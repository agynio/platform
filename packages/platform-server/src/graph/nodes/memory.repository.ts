import { Injectable, Scope, Inject } from '@nestjs/common';
import { PrismaService } from '../../core/services/prisma.service';
import type { Prisma, PrismaClient } from '@prisma/client';

// Storage port for Postgres-backed memory. Minimal operations used by MemoryService.
type MemoryFilter = { nodeId: string; scope: MemoryScope; threadId?: string };
type MemoryDataMap = Record<string, string | Record<string, unknown>>;
type MemoryDirsMap = Record<string, true | Record<string, unknown>>;

interface MemoryRepositoryPort {
  ensureSchema(): Promise<void>;
  withDoc<T>(filter: MemoryFilter, fn: (doc: MemoryDoc) => Promise<{ doc: MemoryDoc; result?: T } | { doc?: MemoryDoc; result?: T }>): Promise<T>;
  getDoc(filter: MemoryFilter): Promise<MemoryDoc | null>;
  getOrCreateDoc(filter: MemoryFilter): Promise<MemoryDoc>;
}

export type MemoryScope = 'global' | 'perThread';

export interface MemoryDoc {
  nodeId: string;
  scope: MemoryScope;
  threadId?: string;
  // Note: Real Mongo $set with dotted paths (e.g. "data.a.b") creates nested objects.
  // Some legacy docs may have flat dotted keys.
  // Support both shapes for reads/lists.
  data: MemoryDataMap;
  dirs: MemoryDirsMap;
}

export interface StatResult {
  kind: 'file' | 'dir' | 'none';
  // for files, report byte length to aid size-capping heuristics
  size?: number;
}

export interface ListEntry {
  name: string; // immediate child name (not full path)
  kind: 'file' | 'dir';
}

/**
 * Memory service with string-only file values.
 * One document per { nodeId, scope[, threadId] } in the `memories` table.
 * Paths map to dotted keys in doc.data: "/a/b/c" -> data["a.b.c"]. Back-compat for nested JSON present.
 */
@Injectable({ scope: Scope.TRANSIENT })
export class MemoryService {
  private nodeId!: string;
  private scope!: MemoryScope;
  private threadId?: string;

  // Backing repository (Postgres). Inject lazily via PrismaService
  private repo: MemoryRepositoryPort;

  constructor(@Inject(PrismaService) prisma: PrismaService) {
    this.repo = new PostgresMemoryRepository(prisma);
  }

  init(params: { nodeId: string; scope: MemoryScope; threadId?: string }) {
    this.nodeId = params.nodeId;
    this.scope = params.scope;
    this.threadId = params.threadId;
    if (this.scope === 'perThread' && !this.threadId) throw new Error('threadId is required for perThread scope');
    // Ensure schema exists lazily
    void this.repo.ensureSchema().catch(() => {});

    return this;
  }

  /** Collapse multiple slashes, require leading slash, forbid ".." and "$", and allow [A-Za-z0-9_. -] only in segments. */
  normalizePath(rawPath: string): string {
    if (!rawPath) throw new Error('path is required');
    let p = rawPath.replace(/\\+/g, '/'); // backslashes -> slashes
    p = p.replace(/\/+/g, '/'); // collapse duplicate slashes
    if (!p.startsWith('/')) p = '/' + p;
    // trim trailing slash except for root
    if (p.length > 1 && p.endsWith('/')) p = p.replace(/\/+$/g, '');
    // forbid parent traversal and mongo operator keys
    if (p.includes('..')) throw new Error('invalid path: ".." not allowed');
    if (p.includes('$')) throw new Error('invalid path: "$" not allowed');
    // validate segments
    const segs = p.split('/').filter(Boolean);
    const valid = /^[A-Za-z0-9_. -]+$/;
    for (const s of segs) {
      if (!valid.test(s)) throw new Error(`invalid path segment: ${s}`);
    }
    return p;
  }

  /** Create idempotent indexes for uniqueness across scopes. */
  async ensureIndexes(): Promise<void> {
    await this.repo.ensureSchema();
  }

  private buildFilter(): MemoryFilter {
    const filter: MemoryFilter = { nodeId: this.nodeId, scope: this.scope };
    if (this.scope === 'perThread') filter.threadId = this.threadId;
    return filter;
  }

  // Expose minimal debug context without leaking data
  getDebugInfo(): { nodeId: string; scope: MemoryScope; threadId?: string } {
    return { nodeId: this.nodeId, scope: this.scope, threadId: this.threadId };
  }

  // Check whether a document exists for this {nodeId, scope[, threadId]}
  async checkDocExists(): Promise<boolean> {
    const found = await this.repo.getDoc(this.buildFilter());
    return !!found;
  }

  private async getDocOrCreate(): Promise<MemoryDoc> {
    const doc = await this.repo.getOrCreateDoc(this.buildFilter());
    // Ensure maps exist
    if (!doc.data) doc.data = {} as MemoryDataMap;
    if (!doc.dirs) doc.dirs = {} as MemoryDirsMap;
    return doc;
  }

  private dotted(path: string): string {
    const p = this.normalizePath(path);
    return p === '/' ? '' : p.slice(1).replaceAll('/', '.');
  }

  private getPathSegments(normPath: string): string[] {
    if (normPath === '/') return [];
    return normPath.slice(1).split('/').filter(Boolean);
  }

  private async ensureAncestorDirs(normPath: string): Promise<void> {
    const segments = this.getPathSegments(normPath);
    if (segments.length <= 1) return;
    await this.repo.withDoc<void>(this.buildFilter(), async (doc) => {
      const dirs: MemoryDirsMap = { ...doc.dirs };
      for (let i = 1; i < segments.length; i++) {
        const dirPath = '/' + segments.slice(0, i).join('/');
        const dirKey = this.dotted(dirPath);
        dirs[dirKey] = true;
      }
      return { doc: { ...doc, dirs } };
    });
  }

  private resolveChildEntry(rest: string, prefixKey: string, dirs: MemoryDirsMap, defaultKind: 'file' | 'dir'): { name: string; kind: 'file' | 'dir' } {
    const attemptDir = (segment: string): boolean => {
      if (!segment) return false;
      const candidate = prefixKey ? `${prefixKey}${segment}` : segment;
      return Object.prototype.hasOwnProperty.call(dirs, candidate);
    };

    if (!rest.includes('.')) {
      const isDir = attemptDir(rest);
      return { name: rest, kind: isDir ? 'dir' : defaultKind };
    }

    let idx = rest.indexOf('.');
    while (idx !== -1) {
      const segment = rest.slice(0, idx);
      if (attemptDir(segment)) {
        return { name: segment, kind: 'dir' };
      }
      idx = rest.indexOf('.', idx + 1);
    }

    const isDir = attemptDir(rest);
    return { name: rest, kind: isDir ? 'dir' : defaultKind };
  }

  // Traverse nested object by dotted key. Uses loose typing to support nested-object persistence.
  private getNested(obj: unknown, dottedKey: string): { exists: boolean; node?: unknown } {
    if (dottedKey === '') return { exists: true, node: obj };
    if (obj == null || typeof obj !== 'object') return { exists: false };
    const segs = dottedKey.split('.');
    let curr: unknown = obj as Record<string, unknown>;
    for (const s of segs) {
      if (curr == null || typeof curr !== 'object' || !(s in (curr as Record<string, unknown>))) return { exists: false };
      curr = (curr as Record<string, unknown>)[s];
    }
    return { exists: true, node: curr };
  }

  // Check quickly if there is any flat dotted child under the prefix
  private hasFlatChild(doc: MemoryDoc, key: string): boolean {
    const prefix = key ? key + '.' : '';
    if (Object.keys(doc.data).some((k) => typeof k === 'string' && k.startsWith(prefix))) return true;
    if (Object.keys(doc.dirs).some((k) => typeof k === 'string' && k.startsWith(prefix))) return true;
    return false;
  }

  // Build immediate children listing from a nested object node
  private listNestedChildren(obj: unknown): ListEntry[] {
    if (obj == null || typeof obj !== 'object') return [];
    const out: ListEntry[] = [];
    for (const [name, value] of Object.entries(obj as Record<string, unknown>)) {
      out.push({ name, kind: typeof value === 'string' ? 'file' : 'dir' });
    }
    return out;
  }

  private mergeChildren(a: ListEntry[], b: ListEntry[]): ListEntry[] {
    const map = new Map<string, 'file' | 'dir'>();
    for (const e of [...a, ...b]) {
      const prev = map.get(e.name);
      if (!prev) map.set(e.name, e.kind);
      else if (prev === 'file' && e.kind === 'dir') map.set(e.name, 'dir');
    }
    return Array.from(map, ([name, kind]) => ({ name, kind }));
  }

  /** Ensure directory exists (creates marker). Root always exists. */
  async ensureDir(path: string): Promise<void> {
    const norm = this.normalizePath(path);
    const key = this.dotted(norm);
    if (key === '') return; // root
    await this.ensureAncestorDirs(norm);
    await this.repo.withDoc<void>(this.buildFilter(), async (doc) => {
      const updatedDirs: MemoryDirsMap = { ...doc.dirs, [key]: true };
      return { doc: { ...doc, dirs: updatedDirs } };
    });
  }

  /**
   * stat(path): identifies if path represents a file, dir, or none.
   * Directories may exist implicitly via parent segments of files or explicitly via ensureDir.
   */
  async stat(path: string): Promise<StatResult> {
    const key = this.dotted(path);
    const doc = await this.getDocOrCreate();
    if (key === '') return { kind: 'dir' };

    // Prefer nested path resolution first
    const n = this.getNested(doc.data, key);
    if (n.exists) {
      if (typeof n.node === 'string') return { kind: 'file', size: Buffer.byteLength(n.node || '') };
      return { kind: 'dir' };
    }

    // Back-compat: flat dotted exact file or dir
    if (Object.prototype.hasOwnProperty.call(doc.data, key)) {
      const v = doc.data[key];
      if (typeof v === 'string') return { kind: 'file', size: Buffer.byteLength(v || '') };
    }
    if (Object.prototype.hasOwnProperty.call(doc.dirs, key)) return { kind: 'dir' };

    // Implicit dir if any child exists
    const hasChild = this.hasFlatChild(doc, key);
    return hasChild ? { kind: 'dir' } : { kind: 'none' };
  }

  /** List immediate children at a path (default '/'). */
  async list(path: string = '/'): Promise<ListEntry[]> {
    const key = this.dotted(path);
    const doc = await this.getDocOrCreate();
    const nestedChildren: ListEntry[] = [];

    // Children from nested data tree (preferred)
    const n = this.getNested(doc.data, key);
    if (n.exists && typeof n.node === 'object' && n.node !== null) {
      nestedChildren.push(...this.listNestedChildren(n.node));
    }

    // Include explicit nested dirs under this key
    const nd = this.getNested(doc.dirs, key);
    if (nd.exists && typeof nd.node === 'object' && nd.node !== null) {
      for (const name of Object.keys(nd.node as Record<string, unknown>)) nestedChildren.push({ name, kind: 'dir' });
    }

    // Back-compat: flat dotted keys aggregation
    const flatMap = new Map<string, 'file' | 'dir'>();
    const prefix = key === '' ? '' : key + '.';
    for (const fullKey of Object.keys(doc.data)) {
      if (!fullKey.startsWith(prefix)) continue;
      const rest = fullKey.slice(prefix.length);
      if (rest.length === 0) continue;
      const { name, kind } = this.resolveChildEntry(rest, prefix, doc.dirs, 'file');
      if (!name) continue;
      const prev = flatMap.get(name);
      if (!prev || (prev === 'file' && kind === 'dir')) {
        flatMap.set(name, kind);
      }
    }
    for (const fullKey of Object.keys(doc.dirs)) {
      if (!fullKey.startsWith(prefix)) continue;
      const rest = fullKey.slice(prefix.length);
      if (rest.length === 0) continue;
      const { name } = this.resolveChildEntry(rest, prefix, doc.dirs, 'dir');
      if (!name) continue;
      flatMap.set(name, 'dir');
    }

    const flatChildren = Array.from(flatMap, ([name, kind]) => ({ name, kind }));
    return this.mergeChildren(nestedChildren, flatChildren);
  }

  /** Read file content; throws if dir or not found. */
  async read(path: string): Promise<string> {
    const key = this.dotted(path);
    const doc = await this.getDocOrCreate();
    // Try nested first
    const nested = this.getNested(doc.data, key);
    if (nested.exists) {
      if (typeof nested.node === 'string') return nested.node;
      throw new Error('EISDIR: path is a directory');
    }
    // Fallback: flat dotted exact key
    const flat = doc.data[key];
    if (typeof flat === 'string') return flat;

    // Not found; determine if it's a dir
    const s = await this.stat(path);
    if (s.kind === 'dir') throw new Error('EISDIR: path is a directory');
    throw new Error('ENOENT: file not found');
  }

  /** Append string data to a file; creates file if missing. Errors if path is a directory. */
  async append(path: string, data: string): Promise<void> {
    if (typeof data !== 'string') throw new Error('append expects string data');
    const norm = this.normalizePath(path);
    const key = this.dotted(norm);
    await this.ensureAncestorDirs(norm);
    await this.repo.withDoc<void>(this.buildFilter(), async (doc) => {
      if (Object.prototype.hasOwnProperty.call(doc.dirs, key)) throw new Error('EISDIR: path is a directory');
      let current: string | undefined = undefined;
      try {
        const nested = this.getNested(doc.data, key);
        if (nested && nested.exists && typeof nested.node === 'string') current = nested.node as string;
      } catch (_e) {
        // ignore nested lookup errors; fallback to flat map
      }
      if (current === undefined) {
        const direct = doc.data[key];
        if (typeof direct === 'string') current = direct;
      }
      const next = current === undefined ? data : current + (current.endsWith('\n') || data.startsWith('\n') ? '' : '\n') + data;
      const newData: MemoryDataMap = { ...doc.data, [key]: next };
      return { doc: { ...doc, data: newData } };
    });
  }

  /** Replace all occurrences of `oldStr` with `newStr` in the file. Returns number of replacements. */
  async update(path: string, oldStr: string, newStr: string): Promise<number> {
    if (typeof oldStr !== 'string' || typeof newStr !== 'string') throw new Error('update expects string args');
    const key = this.dotted(path);
    let replaced = 0;
    await this.repo.withDoc<void>(this.buildFilter(), async (doc) => {
      if (Object.prototype.hasOwnProperty.call(doc.dirs, key)) throw new Error('EISDIR: path is a directory');
      let current: string | undefined = undefined;
      try {
        const nested = this.getNested(doc.data, key);
        if (nested && nested.exists) {
          if (typeof nested.node === 'string') current = nested.node as string;
          else throw new Error('EISDIR: path is a directory');
        }
      } catch (_e) {
        // ignore nested lookup errors; continue with flat map
      }
      if (current === undefined) {
        const direct = doc.data[key];
        if (typeof direct === 'string') current = direct;
      }
      if (current === undefined) throw new Error('ENOENT: file not found');
      if (oldStr.length === 0) return { doc };
      const parts = String(current).split(oldStr);
      const count = parts.length - 1;
      if (count === 0) return { doc };
      replaced = count;
      const next = parts.join(newStr);
      const newData: MemoryDataMap = { ...doc.data, [key]: next };
      return { doc: { ...doc, data: newData } };
    });
    return replaced;
  }

  /** Delete a file or a dir subtree. Returns counts. */
  async delete(path: string): Promise<{ files: number; dirs: number }> {
    const key = this.dotted(path);
    let out = { files: 0, dirs: 0 };
    await this.repo.withDoc<void>(this.buildFilter(), async (doc) => {
      if (key === '') {
        const files = Object.keys(doc.data).length;
        const dirs = Object.keys(doc.dirs).length;
        out = { files, dirs };
        const clearedData: MemoryDataMap = {};
        const clearedDirs: MemoryDirsMap = {};
        return { doc: { ...doc, data: clearedData, dirs: clearedDirs } };
      }
      const prefix = key + '.';
      const dataObj: MemoryDataMap = { ...doc.data };
      let files = 0;
      if (Object.prototype.hasOwnProperty.call(dataObj, key)) {
        delete dataObj[key];
        files += 1;
      } else {
        try {
          const nested = this.getNested(doc.data, key);
          if (nested && nested.exists && typeof nested.node === 'string') {
            delete dataObj[key];
            files += 1;
          }
        } catch (_e) {
          // ignore nested lookup errors; proceed to prefix deletion
        }
      }
      for (const k of Object.keys(dataObj)) {
        if (k.startsWith(prefix)) {
          delete dataObj[k];
          files += 1;
        }
      }
      const dirsObj: MemoryDirsMap = { ...doc.dirs };
      let dirs = 0;
      if (Object.prototype.hasOwnProperty.call(dirsObj, key)) {
        delete dirsObj[key];
        dirs += 1;
      }
      for (const k of Object.keys(dirsObj)) {
        if (k.startsWith(prefix)) {
          delete dirsObj[k];
          dirs += 1;
        }
      }
      out = { files, dirs };
      return { doc: { ...doc, data: dataObj, dirs: dirsObj } };
    });
    return out;
  }

  /** Return flat dotted key -> string value map (clone). */
  async getAll(): Promise<Record<string, string>> {
    const doc = await this.getDocOrCreate();
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(doc.data)) {
      if (typeof value === 'string') out[key] = value;
    }
    return out;
  }

  /** Convenience dump of entire doc (shallow). */
  async dump(): Promise<
    Pick<MemoryDoc, 'nodeId' | 'scope' | 'threadId'> & { data: Record<string, string>; dirs: Record<string, true> }
  > {
    const doc = await this.getDocOrCreate();
    const dataOut: Record<string, string> = {};
    for (const [key, value] of Object.entries(doc.data)) {
      if (typeof value === 'string') dataOut[key] = value;
    }
    const dirOut: Record<string, true> = {};
    for (const [key, value] of Object.entries(doc.dirs)) {
      if (value === true) dirOut[key] = true;
    }
    return {
      nodeId: doc.nodeId,
      scope: doc.scope,
      threadId: doc.threadId,
      data: dataOut,
      dirs: dirOut,
    };
  }

}

class PostgresMemoryRepository implements MemoryRepositoryPort {
  private static schemaInitialized = false;
  private static schemaInitPromise: Promise<void> | null = null;
  private static readonly SCHEMA_LOCK_KEY = BigInt(0x4d4d5250); // 'MMRP'

  constructor(private prismaSvc: PrismaService) {}

  private async getClient(): Promise<PrismaClient> {
    return this.prismaSvc.getClient();
  }

  private static rowToDoc(row: MemoryRow): MemoryDoc {
    return {
      nodeId: row.node_id,
      scope: row.scope,
      threadId: row.thread_id ?? undefined,
      data: (row.data || {}) as MemoryDataMap,
      dirs: (row.dirs || {}) as MemoryDirsMap,
    };
  }

  async ensureSchema(): Promise<void> {
    const prisma = await this.getClient();

    if (PostgresMemoryRepository.schemaInitialized) return;

    if (!PostgresMemoryRepository.schemaInitPromise) {
      PostgresMemoryRepository.schemaInitPromise = this.performEnsureSchema(prisma)
        .then(() => {
          PostgresMemoryRepository.schemaInitialized = true;
        })
        .finally(() => {
          PostgresMemoryRepository.schemaInitPromise = null;
        });
    }

    await PostgresMemoryRepository.schemaInitPromise;
  }

  private async performEnsureSchema(prisma: PrismaClient): Promise<void> {
    await prisma.$executeRaw`SELECT pg_advisory_lock(${PostgresMemoryRepository.SCHEMA_LOCK_KEY})`;
    try {
      await prisma.$executeRaw`CREATE EXTENSION IF NOT EXISTS pgcrypto;`;
      await prisma.$executeRaw`
        CREATE TABLE IF NOT EXISTS memories (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          node_id TEXT NOT NULL,
          scope TEXT NOT NULL CHECK (scope IN ('global','perThread')),
          thread_id TEXT NULL,
          data JSONB NOT NULL DEFAULT '{}'::jsonb,
          dirs JSONB NOT NULL DEFAULT '{}'::jsonb,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `;
      await prisma.$executeRaw`CREATE UNIQUE INDEX IF NOT EXISTS uniq_memories_global ON memories (node_id, scope) WHERE scope = 'global';`;
      await prisma.$executeRaw`CREATE UNIQUE INDEX IF NOT EXISTS uniq_memories_per_thread ON memories (node_id, scope, thread_id) WHERE scope = 'perThread' AND thread_id IS NOT NULL;`;
      await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS idx_memories_lookup ON memories (node_id, scope, thread_id);`;
    } finally {
      await prisma.$executeRaw`SELECT pg_advisory_unlock(${PostgresMemoryRepository.SCHEMA_LOCK_KEY})`;
    }
  }

  private async selectForUpdate(filter: MemoryFilter, tx: Prisma.TransactionClient) {
    const rows = await tx.$queryRaw<MemoryRow[]>`
      SELECT id, node_id, scope, thread_id, data, dirs, created_at, updated_at
      FROM memories
      WHERE node_id = ${filter.nodeId}
        AND scope = ${filter.scope}
        AND (thread_id IS NOT DISTINCT FROM ${filter.scope === 'perThread' ? filter.threadId ?? null : null})
      FOR UPDATE
    `;
    return rows[0] ?? null;
  }

  async getDoc(filter: MemoryFilter): Promise<MemoryDoc | null> {
    const prisma = await this.getClient();
    const rows = await prisma.$queryRaw<MemoryRow[]>`
      SELECT id, node_id, scope, thread_id, data, dirs, created_at, updated_at
      FROM memories
      WHERE node_id = ${filter.nodeId}
        AND scope = ${filter.scope}
        AND (thread_id IS NOT DISTINCT FROM ${filter.scope === 'perThread' ? filter.threadId ?? null : null})
    `;
    if (!rows[0]) return null;
    return PostgresMemoryRepository.rowToDoc(rows[0]);
  }

  async getOrCreateDoc(filter: MemoryFilter): Promise<MemoryDoc> {
    const prisma = await this.getClient();
    await this.ensureSchema();
    return await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      let row = await this.selectForUpdate(filter, tx);
      if (!row) {
        await tx.$executeRaw`INSERT INTO memories (node_id, scope, thread_id, data, dirs) VALUES (${filter.nodeId}, ${filter.scope}, ${filter.scope === 'perThread' ? filter.threadId ?? null : null}, '{}'::jsonb, '{}'::jsonb)`;
        row = await this.selectForUpdate(filter, tx);
      }
      if (!row) throw new Error('failed to create memory document');
      return PostgresMemoryRepository.rowToDoc(row as MemoryRow);
    });
  }

  async withDoc<T>(filter: MemoryFilter, fn: (doc: MemoryDoc) => Promise<{ doc: MemoryDoc; result?: T } | { doc?: MemoryDoc; result?: T }>): Promise<T> {
    const prisma = await this.getClient();
    await this.ensureSchema();
    return await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      let row = await this.selectForUpdate(filter, tx);
      if (!row) {
        await tx.$executeRaw`INSERT INTO memories (node_id, scope, thread_id, data, dirs) VALUES (${filter.nodeId}, ${filter.scope}, ${filter.scope === 'perThread' ? filter.threadId ?? null : null}, '{}'::jsonb, '{}'::jsonb)`;
        row = await this.selectForUpdate(filter, tx);
      }
      if (!row) throw new Error('failed to create memory document');
      const current: MemoryDoc = PostgresMemoryRepository.rowToDoc(row as MemoryRow);
      const { doc, result } = await fn(current);
      if (doc) {
        await tx.$executeRaw`UPDATE memories SET data = ${JSON.stringify(doc.data)}::jsonb, dirs = ${JSON.stringify(doc.dirs)}::jsonb, updated_at = NOW() WHERE node_id = ${filter.nodeId} AND scope = ${filter.scope} AND (thread_id IS NOT DISTINCT FROM ${filter.scope === 'perThread' ? filter.threadId ?? null : null})`;
      }
      return result as T;
    });
  }
}

// Strongly-typed row mapped from raw SQL
type MemoryRow = {
  id: string;
  node_id: string;
  scope: 'global' | 'perThread';
  thread_id: string | null;
  data: Record<string, unknown>;
  dirs: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
};
