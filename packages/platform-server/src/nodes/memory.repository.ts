import type { Db, Collection, Document, WithId } from 'mongodb';

export type MemoryScope = 'global' | 'perThread';

export interface MemoryDoc extends Document {
  nodeId: string;
  scope: MemoryScope;
  threadId?: string;
  // Note: Real Mongo $set with dotted paths (e.g. "data.a.b") creates nested objects.
  // Some legacy docs may have flat dotted keys.
  // Support both shapes for reads/lists.
  data: Record<string, any>;
  dirs: Record<string, any>;
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
 * Mongo-backed memory service with string-only file values.
 * One Mongo document per { nodeId, scope[, threadId] } in the `memories` collection.
 * Paths map to dotted keys in doc.data: "/a/b/c" -> data["a.b.c"].
 */
@Injectable()
export class MemoryService {
  private collection: Collection<MemoryDoc>;

  constructor(private db: Db, private nodeId: string, private scope: MemoryScope, private threadId?: string) {
    if (scope === 'perThread' && !threadId) throw new Error('threadId is required for perThread scope');
    this.collection = db.collection<MemoryDoc>('memories');
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
    const existing = await this.collection.indexes();
    const names = new Set(existing.map((i) => i.name));
    const specs: { name: string; key: any; unique: boolean; partialFilterExpression: any }[] = [
      {
        name: 'uniq_global',
        key: { nodeId: 1, scope: 1 },
        unique: true,
        partialFilterExpression: { scope: 'global' },
      },
      {
        name: 'uniq_per_thread',
        key: { nodeId: 1, scope: 1, threadId: 1 },
        unique: true,
        partialFilterExpression: { scope: 'perThread', threadId: { $exists: true } },
      },
    ];
    for (const s of specs) {
      if (!names.has(s.name)) {
        try {
          await this.collection.createIndex(s.key, {
            name: s.name,
            unique: s.unique,
            partialFilterExpression: s.partialFilterExpression,
          });
        } catch (e) {
          // ignore if already exists (race conditions)
        }
      }
    }
  }

  private get filter() {
    const base: any = { nodeId: this.nodeId, scope: this.scope };
    if (this.scope === 'perThread') base.threadId = this.threadId;
    return base;
  }

  // Expose minimal debug context without leaking data
  getDebugInfo(): { nodeId: string; scope: MemoryScope; threadId?: string } {
    return { nodeId: this.nodeId, scope: this.scope, threadId: this.threadId };
  }

  // Check whether a document exists for this {nodeId, scope[, threadId]}
  async checkDocExists(): Promise<boolean> {
    const found = await this.collection.findOne(this.filter, { projection: { _id: 1 } });
    return !!found;
  }

  private async getDocOrCreate(): Promise<WithId<MemoryDoc>> {
    // Fast path: fetch existing document
    let doc = (await this.collection.findOne(this.filter)) as WithId<MemoryDoc> | null;
    if (!doc) {
      // Create new doc explicitly to avoid potential read-after-write race on memory server
      await this.collection.updateOne(
        this.filter,
        { $setOnInsert: { nodeId: this.nodeId, scope: this.scope, threadId: this.threadId, data: {}, dirs: {} } },
        { upsert: true },
      );
      doc = (await this.collection.findOne(this.filter)) as WithId<MemoryDoc> | null;
    }
    const safe: any = doc || { nodeId: this.nodeId, scope: this.scope, threadId: this.threadId, data: {}, dirs: {} };
    safe.data = safe.data ?? {};
    safe.dirs = safe.dirs ?? {};
    return safe as WithId<MemoryDoc>;
  }

  private dotted(path: string): string {
    const p = this.normalizePath(path);
    return p === '/' ? '' : p.slice(1).replaceAll('/', '.');
  }

  // Traverse nested object by dotted key. Uses loose typing to support nested-object persistence.
  private getNested(obj: any, dottedKey: string): { exists: boolean; node?: any } {
    if (dottedKey === '') return { exists: true, node: obj };
    if (obj == null || typeof obj !== 'object') return { exists: false };
    const segs = dottedKey.split('.');
    let curr: any = obj;
    for (const s of segs) {
      if (curr == null || typeof curr !== 'object' || !(s in curr)) return { exists: false };
      curr = curr[s];
    }
    return { exists: true, node: curr };
  }

  // Check quickly if there is any flat dotted child under the prefix
  private hasFlatChild(doc: WithId<MemoryDoc>, key: string): boolean {
    const prefix = key ? key + '.' : '';
    const dataKeys = Object.keys((doc as any).data || {});
    if (dataKeys.some((k) => typeof k === 'string' && k.startsWith(prefix))) return true;
    const dirKeys = Object.keys((doc as any).dirs || {});
    if (dirKeys.some((k) => typeof k === 'string' && k.startsWith(prefix))) return true;
    return false;
  }

  // Build immediate children listing from a nested object node
  private listNestedChildren(obj: any): ListEntry[] {
    if (obj == null || typeof obj !== 'object') return [];
    const out: ListEntry[] = [];
    for (const [name, value] of Object.entries(obj)) {
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
    await this.collection.updateOne(this.filter, { $set: { [`dirs.${key}`]: true } }, { upsert: true });
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
    const n = this.getNested((doc as any).data, key);
    if (n.exists) {
      if (typeof n.node === 'string') return { kind: 'file', size: Buffer.byteLength(n.node || '') };
      return { kind: 'dir' };
    }

    // Back-compat: flat dotted exact file or dir
    if (Object.prototype.hasOwnProperty.call((doc as any).data, key)) {
      const v = (doc as any).data[key];
      if (typeof v === 'string') return { kind: 'file', size: Buffer.byteLength(v || '') };
    }
    if (Object.prototype.hasOwnProperty.call((doc as any).dirs, key)) return { kind: 'dir' };

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
    const n = this.getNested((doc as any).data, key);
    if (n.exists && typeof n.node === 'object') {
      nestedChildren.push(...this.listNestedChildren(n.node));
    }

    // Include explicit nested dirs under this key
    const nd = this.getNested((doc as any).dirs, key);
    if (nd.exists && typeof nd.node === 'object') {
      for (const name of Object.keys(nd.node)) nestedChildren.push({ name, kind: 'dir' });
    }

    // Back-compat: flat dotted keys aggregation
    const flatMap = new Map<string, 'file' | 'dir'>();
    const prefix = key === '' ? '' : key + '.';
    for (const k of Object.keys((doc as any).data || {})) {
      if (typeof k !== 'string' || !k.startsWith(prefix)) continue;
      const rest = k.slice(prefix.length);
      if (rest.length === 0) continue; // exact key not a child
      const seg = rest.split('.', 1)[0];
      const isDirect = rest === seg;
      const next: 'file' | 'dir' = isDirect ? 'file' : 'dir';
      const prev = flatMap.get(seg);
      flatMap.set(seg, prev === 'dir' ? 'dir' : next);
    }
    for (const k of Object.keys((doc as any).dirs || {})) {
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
    const nested = this.getNested((doc as any).data, key);
    if (nested.exists) {
      if (typeof nested.node === 'string') return nested.node;
      throw new Error('EISDIR: path is a directory');
    }
    // Fallback: flat dotted exact key
    const flat = (doc as any).data?.[key];
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
    const doc = await this.getDocOrCreate();

    const dirs = (doc as any).dirs ?? {};
    const dataMap = (doc as any).data ?? {};
    // error if explicit dir at this key
    if (Object.prototype.hasOwnProperty.call(dirs, key)) throw new Error('EISDIR: path is a directory');

    // Support both nested and flat dotted keys. Prefer nested existing resolution.
    let current: string | undefined = undefined;
    // attempt nested resolution similar to read/stat logic
    try {
      const nested = (this as any).getNested?.((doc as any).data, key);
      if (nested && nested.exists && typeof nested.node === 'string') current = nested.node;
    } catch {}
    // fallback: flat dotted key value
    if (current === undefined) current = dataMap[key];
    const next = current === undefined ? data : current + (current.endsWith('\n') || data.startsWith('\n') ? '' : '\n') + data;
    await this.collection.updateOne(this.filter, { $set: { [`data.${key}`]: next } });
  }

  /** Replace all occurrences of `oldStr` with `newStr` in the file. Returns number of replacements. */
  async update(path: string, oldStr: string, newStr: string): Promise<number> {
    if (typeof oldStr !== 'string' || typeof newStr !== 'string') throw new Error('update expects string args');
    const key = this.dotted(path);
    const doc = await this.getDocOrCreate();

    if (Object.prototype.hasOwnProperty.call((doc as any).dirs, key)) throw new Error('EISDIR: path is a directory');
    // Support both nested object persistence (Mongo auto-expands dotted keys) and flat dotted keys.
    let current: any = undefined;
    try {
      const nested = (this as any).getNested?.((doc as any).data, key);
      if (nested && nested.exists) {
        if (typeof nested.node === 'string') current = nested.node; else throw new Error('EISDIR: path is a directory');
      }
    } catch {}
    if (current === undefined) current = (doc as any).data?.[key];
    if (current === undefined) throw new Error('ENOENT: file not found');

    if (oldStr.length === 0) return 0;
    const parts = String(current).split(oldStr);
    const count = parts.length - 1;
    if (count === 0) return 0;
    const next = parts.join(newStr);
    await this.collection.updateOne(this.filter, { $set: { [`data.${key}`]: next } });
    return count;
  }

  /** Delete a file or a dir subtree. Returns counts. */
  async delete(path: string): Promise<{ files: number; dirs: number }> {
    const key = this.dotted(path);
    const doc = await this.getDocOrCreate();
    if (key === '') {
      // clear all for this doc
      const files = Object.keys((doc as any).data || {}).length;
      const dirs = Object.keys((doc as any).dirs || {}).length;
      await this.collection.updateOne(this.filter, { $set: { data: {}, dirs: {} } });
      return { files, dirs };
    }
    const prefix = key + '.';
    const unset: Record<string, ''> = {} as any;
    let files = 0;
    const dataObj: any = (doc as any).data || {};
    if (Object.prototype.hasOwnProperty.call(dataObj, key)) {
      unset[`data.${key}`] = '' as any;
      files += 1;
    } else {
      // attempt nested lookup (Mongo created nested objects from dotted $set)
      try {
        const nested = (this as any).getNested?.(dataObj, key);
        if (nested && nested.exists && typeof nested.node === 'string') {
          unset[`data.${key}`] = '' as any;
          files += 1;
        }
      } catch {}
    }
    for (const k of Object.keys(dataObj)) {
      if (k.startsWith(prefix)) {
        unset[`data.${k}`] = '' as any;
        files += 1;
      }
    }

    let dirs = 0;
    const dirsObj: any = (doc as any).dirs || {};
    if (Object.prototype.hasOwnProperty.call(dirsObj, key)) {
      unset[`dirs.${key}`] = '' as any;
      dirs += 1;
    }
    for (const k of Object.keys(dirsObj)) {
      if (k.startsWith(prefix)) {
        unset[`dirs.${k}`] = '' as any;
        dirs += 1;
      }
    }

    if (files === 0 && dirs === 0) return { files: 0, dirs: 0 };
    await this.collection.updateOne(this.filter, { $unset: unset });
    return { files, dirs };
  }

  /** Return flat dotted key -> string value map (clone). */
  async getAll(): Promise<Record<string, string>> {
    const doc = await this.getDocOrCreate();
    return { ...(doc as any).data };
  }

  /** Convenience dump of entire doc (shallow). */
  async dump(): Promise<Pick<MemoryDoc, 'nodeId' | 'scope' | 'threadId'> & { data: Record<string, string>; dirs: Record<string, true> }> {
    const doc = await this.getDocOrCreate();
    return { nodeId: (doc as any).nodeId, scope: (doc as any).scope, threadId: (doc as any).threadId, data: { ...(doc as any).data }, dirs: { ...(doc as any).dirs } } as any;
  }

  // ensure parents of a dotted key are marked as dirs
  private async ensureParentDirs(key: string) {
    if (!key) return;
    const parts = key.split('.');
    const updates: Record<string, true> = {} as any;
    for (let i = 1; i < parts.length; i++) {
      const dirKey = parts.slice(0, i).join('.');
      updates[`dirs.${dirKey}`] = true as any;
    }
    if (Object.keys(updates).length)
      await this.collection.updateOne(this.filter, { $set: updates }, { upsert: true });
  }
}
import { Injectable } from '@nestjs/common';
