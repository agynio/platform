import { Injectable, Scope, Inject } from '@nestjs/common';
import { PrismaService } from '../../core/services/prisma.service';

// Storage port for Postgres-backed memory. Minimal operations used by MemoryService.
interface MemoryRepositoryPort {
  ensureSchema(): Promise<void>;
  withDoc<T>(filter: { nodeId: string; scope: MemoryScope; threadId?: string }, fn: (doc: MemoryDoc) => Promise<{ doc: MemoryDoc; result?: T } | { doc?: MemoryDoc; result?: T }>): Promise<T>;
  getDoc(filter: { nodeId: string; scope: MemoryScope; threadId?: string }): Promise<MemoryDoc | null>;
  getOrCreateDoc(filter: { nodeId: string; scope: MemoryScope; threadId?: string }): Promise<MemoryDoc>;
}

export type MemoryScope = 'global' | 'perThread';

export interface MemoryDoc {
  nodeId: string;
  scope: MemoryScope;
  threadId?: string;
  // Note: Real Mongo $set with dotted paths (e.g. "data.a.b") creates nested objects.
  // Some legacy docs may have flat dotted keys.
  // Support both shapes for reads/lists.
  data: Record<string, string | Record<string, unknown>>;
  dirs: Record<string, true | Record<string, unknown>>;
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

  /** Collapse multiple slashes, require leading slash, forbid ".." and "$", and allow [A-Za-z0-9_ -] only in segments. */
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
    const valid = /^[A-Za-z0-9_ -]+$/;
    for (const s of segs) {
      if (!valid.test(s)) throw new Error(`invalid path segment: ${s}`);
    }
    return p;
  }

  /** Create idempotent indexes for uniqueness across scopes. */
  async ensureIndexes(): Promise<void> {
    await this.repo.ensureSchema();
  }

  private get filter() {
    const base: Record<string, unknown> = { nodeId: this.nodeId, scope: this.scope };
    if (this.scope === 'perThread') base.threadId = this.threadId;
    return base;
  }

  // Expose minimal debug context without leaking data
  getDebugInfo(): { nodeId: string; scope: MemoryScope; threadId?: string } {
    return { nodeId: this.nodeId, scope: this.scope, threadId: this.threadId };
  }

  // Check whether a document exists for this {nodeId, scope[, threadId]}
  async checkDocExists(): Promise<boolean> {
    const found = await this.repo.getDoc(this.filter);
    return !!found;
  }

  private async getDocOrCreate(): Promise<MemoryDoc> {
    const doc = await this.repo.getOrCreateDoc(this.filter);
    // Ensure maps exist
    if (!doc.data) (doc as unknown as { data: Record<string, unknown> }).data = {};
    if (!doc.dirs) (doc as unknown as { dirs: Record<string, unknown> }).dirs = {};
    return doc as MemoryDoc;
  }

  private dotted(path: string): string {
    const p = this.normalizePath(path);
    return p === '/' ? '' : p.slice(1).replaceAll('/', '.');
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
    const dataKeys = Object.keys(doc.data || {});
    if (dataKeys.some((k) => typeof k === 'string' && k.startsWith(prefix))) return true;
    const dirKeys = Object.keys((doc.dirs || {} as Record<string, unknown>));
    if (dirKeys.some((k) => typeof k === 'string' && k.startsWith(prefix))) return true;
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
    const key = this.dotted(path);
    if (key === '') return; // root
    await this.repo.withDoc<void>(this.filter, async (doc) => {
      const dirs = (doc.dirs ?? {}) as Record<string, unknown>;
      (dirs as Record<string, true>)[key] = true;
      return { doc: { ...doc, dirs } };
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
      const v = (doc.data as Record<string, unknown>)[key];
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
    for (const k of Object.keys(doc.data || {})) {
      if (typeof k !== 'string' || !k.startsWith(prefix)) continue;
      const rest = k.slice(prefix.length);
      if (rest.length === 0) continue; // exact key not a child
      const seg = rest.split('.', 1)[0];
      const isDirect = rest === seg;
      const next: 'file' | 'dir' = isDirect ? 'file' : 'dir';
      const prev = flatMap.get(seg);
      flatMap.set(seg, prev === 'dir' ? 'dir' : next);
    }
    for (const k of Object.keys(doc.dirs || {} as Record<string, unknown>)) {
      if (typeof k !== 'string' || !k.startsWith(prefix)) continue;
      const rest = k.slice(prefix.length);
      if (rest.length === 0) continue;
      const seg = rest.split('.', 1)[0];
      flatMap.set(seg, 'dir');
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
    const flat = (doc.data as Record<string, unknown> | undefined)?.[key];
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
    // Ensure immediate parent dir marker exists for nested paths and mark ancestors
    const lastSlash = norm.lastIndexOf('/');
    const parent = lastSlash <= 0 ? '/' : norm.slice(0, lastSlash);
    await this.ensureDir(parent);
    await this.ensureParentDirs(key);
    await this.repo.withDoc<void>(this.filter, async (doc) => {
      const dirs = (doc.dirs ?? {}) as Record<string, unknown>;
      const dataMap = (doc.data ?? {}) as Record<string, string>;
      if (Object.prototype.hasOwnProperty.call(dirs, key)) throw new Error('EISDIR: path is a directory');
      let current: string | undefined = undefined;
      try {
        const nested = this.getNested(doc.data, key);
        if (nested && nested.exists && typeof nested.node === 'string') current = nested.node as string;
      } catch {}
      if (current === undefined) current = dataMap[key];
      const next = current === undefined ? data : current + (current.endsWith('\n') || data.startsWith('\n') ? '' : '\n') + data;
      const newData = { ...(doc.data as Record<string, unknown>), [key]: next } as Record<string, unknown>;
      return { doc: { ...doc, data: newData } };
    });
  }

  /** Replace all occurrences of `oldStr` with `newStr` in the file. Returns number of replacements. */
  async update(path: string, oldStr: string, newStr: string): Promise<number> {
    if (typeof oldStr !== 'string' || typeof newStr !== 'string') throw new Error('update expects string args');
    const key = this.dotted(path);
    let replaced = 0;
    await this.repo.withDoc<void>(this.filter, async (doc) => {
      if (Object.prototype.hasOwnProperty.call(doc.dirs, key)) throw new Error('EISDIR: path is a directory');
      let current: string | undefined = undefined;
      try {
        const nested = this.getNested(doc.data, key);
        if (nested && nested.exists) {
          if (typeof nested.node === 'string') current = nested.node as string;
          else throw new Error('EISDIR: path is a directory');
        }
      } catch {}
      if (current === undefined) current = (doc.data as Record<string, unknown> | undefined)?.[key] as string | undefined;
      if (current === undefined) throw new Error('ENOENT: file not found');
      if (oldStr.length === 0) return { doc };
      const parts = String(current).split(oldStr);
      const count = parts.length - 1;
      if (count === 0) return { doc };
      replaced = count;
      const next = parts.join(newStr);
      const newData = { ...(doc.data as Record<string, unknown>), [key]: next } as Record<string, unknown>;
      return { doc: { ...doc, data: newData } };
    });
    return replaced;
  }

  /** Delete a file or a dir subtree. Returns counts. */
  async delete(path: string): Promise<{ files: number; dirs: number }> {
    const key = this.dotted(path);
    let out = { files: 0, dirs: 0 };
    await this.repo.withDoc<void>(this.filter, async (doc) => {
      if (key === '') {
        const files = Object.keys(doc.data || {}).length;
        const dirs = Object.keys(doc.dirs || ({} as Record<string, unknown>)).length;
        out = { files, dirs };
        return { doc: { ...doc, data: {}, dirs: {} } };
      }
      const prefix = key + '.';
      const dataObj: Record<string, unknown> = { ...(doc.data || {}) };
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
        } catch {}
      }
      for (const k of Object.keys(dataObj)) {
        if (k.startsWith(prefix)) {
          delete dataObj[k];
          files += 1;
        }
      }
      const dirsObj: Record<string, unknown> = { ...(doc.dirs || {}) };
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
    return { ...((doc.data as unknown) as Record<string, string>) };
  }

  /** Convenience dump of entire doc (shallow). */
  async dump(): Promise<
    Pick<MemoryDoc, 'nodeId' | 'scope' | 'threadId'> & { data: Record<string, string>; dirs: Record<string, true> }
  > {
    const doc = await this.getDocOrCreate();
    return {
      nodeId: doc.nodeId,
      scope: doc.scope,
      threadId: doc.threadId,
      data: { ...((doc.data as unknown) as Record<string, string>) },
      dirs: { ...((doc.dirs as unknown) as Record<string, true>) },
    } as unknown as Pick<MemoryDoc, 'nodeId' | 'scope' | 'threadId'> & { data: Record<string, string>; dirs: Record<string, true> };
  }

  // ensure parents of a dotted key are marked as dirs
  private async ensureParentDirs(key: string) {
    if (!key) return;
    const parts = key.split('.');
    if (parts.length <= 1) return;
    await this.repo.withDoc<void>(this.filter, async (doc) => {
      const dirs = { ...(doc.dirs || {}) } as Record<string, true>;
      for (let i = 1; i < parts.length; i++) {
        const dirKey = parts.slice(0, i).join('.');
        dirs[dirKey] = true;
      }
      return { doc: { ...doc, dirs } };
    });
  }
}

class PostgresMemoryRepository implements MemoryRepositoryPort {
  constructor(private prismaSvc: PrismaService) {}

  private async getClient() {
    return this.prismaSvc.getClient();
  }

  async ensureSchema(): Promise<void> {
    const prisma = await this.getClient();
    // Create extension, table, and partial unique indexes idempotently
    await prisma.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`);
    await prisma.$executeRawUnsafe(`
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
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS idx_memories_lookup ON memories (node_id, scope, thread_id);
    `);
    await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'uniq_memories_global'
        ) THEN
          EXECUTE 'CREATE UNIQUE INDEX uniq_memories_global ON memories (node_id, scope) WHERE scope = ''global''';
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'uniq_memories_per_thread'
        ) THEN
          EXECUTE 'CREATE UNIQUE INDEX uniq_memories_per_thread ON memories (node_id, scope, thread_id) WHERE scope = ''perThread'' AND thread_id IS NOT NULL';
        END IF;
      END $$;
    `);
  }

  private async selectForUpdate(filter: { nodeId: string; scope: MemoryScope; threadId?: string }, tx: any) {
    const rows = await tx.$queryRawUnsafe<Array<{ id: string; node_id: string; scope: string; thread_id: string | null; data: unknown; dirs: unknown }>>(
      `SELECT id, node_id, scope, thread_id, data, dirs FROM memories WHERE node_id = $1 AND scope = $2 AND (thread_id IS NOT DISTINCT FROM $3) FOR UPDATE`,
      filter.nodeId,
      filter.scope,
      filter.scope === 'perThread' ? filter.threadId ?? null : null,
    );
    return rows[0] || null;
  }

  async getDoc(filter: { nodeId: string; scope: MemoryScope; threadId?: string }): Promise<MemoryDoc | null> {
    const prisma = await this.getClient();
    const rows = await prisma.$queryRawUnsafe<Array<{ node_id: string; scope: string; thread_id: string | null; data: unknown; dirs: unknown }>>(
      `SELECT node_id, scope, thread_id, data, dirs FROM memories WHERE node_id = $1 AND scope = $2 AND (thread_id IS NOT DISTINCT FROM $3)` ,
      filter.nodeId,
      filter.scope,
      filter.scope === 'perThread' ? filter.threadId ?? null : null,
    );
    if (!rows[0]) return null;
    const r = rows[0];
    return { nodeId: r.node_id, scope: r.scope as MemoryScope, threadId: r.thread_id ?? undefined, data: (r.data as any) || {}, dirs: (r.dirs as any) || {} };
  }

  async getOrCreateDoc(filter: { nodeId: string; scope: MemoryScope; threadId?: string }): Promise<MemoryDoc> {
    const prisma = await this.getClient();
    return await prisma.$transaction(async (tx) => {
      await this.ensureSchema();
      let row = await this.selectForUpdate(filter, tx);
      if (!row) {
        await tx.$executeRawUnsafe(
          `INSERT INTO memories (node_id, scope, thread_id, data, dirs) VALUES ($1, $2, $3, '{}'::jsonb, '{}'::jsonb)` ,
          filter.nodeId,
          filter.scope,
          filter.scope === 'perThread' ? filter.threadId ?? null : null,
        );
        row = await this.selectForUpdate(filter, tx);
      }
      if (!row) throw new Error('failed to create memory document');
      return { nodeId: row.node_id, scope: row.scope as MemoryScope, threadId: row.thread_id ?? undefined, data: (row.data as any) || {}, dirs: (row.dirs as any) || {} };
    });
  }

  async withDoc<T>(filter: { nodeId: string; scope: MemoryScope; threadId?: string }, fn: (doc: MemoryDoc) => Promise<{ doc: MemoryDoc; result?: T } | { doc?: MemoryDoc; result?: T }>): Promise<T> {
    const prisma = await this.getClient();
    return await prisma.$transaction(async (tx) => {
      await this.ensureSchema();
      let row = await this.selectForUpdate(filter, tx);
      if (!row) {
        await tx.$executeRawUnsafe(
          `INSERT INTO memories (node_id, scope, thread_id, data, dirs) VALUES ($1, $2, $3, '{}'::jsonb, '{}'::jsonb)` ,
          filter.nodeId,
          filter.scope,
          filter.scope === 'perThread' ? filter.threadId ?? null : null,
        );
        row = await this.selectForUpdate(filter, tx);
      }
      if (!row) throw new Error('failed to create memory document');
      const current: MemoryDoc = { nodeId: row.node_id, scope: row.scope as MemoryScope, threadId: row.thread_id ?? undefined, data: (row.data as any) || {}, dirs: (row.dirs as any) || {} };
      const { doc, result } = await fn(current);
      if (doc) {
        await tx.$executeRawUnsafe(
          `UPDATE memories SET data = $1::jsonb, dirs = $2::jsonb, updated_at = NOW() WHERE node_id = $3 AND scope = $4 AND (thread_id IS NOT DISTINCT FROM $5)` ,
          JSON.stringify(doc.data ?? {}),
          JSON.stringify(doc.dirs ?? {}),
          filter.nodeId,
          filter.scope,
          filter.scope === 'perThread' ? filter.threadId ?? null : null,
        );
      }
      return result as T;
    });
  }
}
