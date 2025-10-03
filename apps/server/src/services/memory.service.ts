import type { Db, Collection, Document, WithId } from 'mongodb';

export type MemoryScope = 'global' | 'perThread';

export interface MemoryDoc extends Document {
  nodeId: string;
  scope: MemoryScope;
  threadId?: string;
  data: Record<string, string>; // dotted path -> string value
  dirs: Record<string, true>; // dotted dir path -> marker
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

  private async getDocOrCreate(): Promise<WithId<MemoryDoc>> {
    const res = await this.collection.findOneAndUpdate(
      this.filter,
      { $setOnInsert: { nodeId: this.nodeId, scope: this.scope, threadId: this.threadId, data: {}, dirs: {} } },
      { upsert: true, returnDocument: 'after' },
    );
    // findOneAndUpdate with upsert always returns a value with after + upserted id
    const doc = (res.value as WithId<MemoryDoc>) || ({} as any);
    // Coalesce legacy docs missing fields to safe shapes to avoid runtime TypeErrors
    (doc as any).data = (doc as any).data ?? {};
    (doc as any).dirs = (doc as any).dirs ?? {};
    return doc as WithId<MemoryDoc>;
  }

  private dotted(path: string): string {
    const p = this.normalizePath(path);
    return p === '/' ? '' : p.slice(1).replaceAll('/', '.');
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

    // file exact match
    if (Object.prototype.hasOwnProperty.call(doc.data, key)) {
      return { kind: 'file', size: Buffer.byteLength(doc.data[key] || '') };
    }

    // explicit dir marker
    if (Object.prototype.hasOwnProperty.call(doc.dirs, key)) return { kind: 'dir' };

    // implicit dir if any child exists
    const prefix = key + '.';
    const hasChild = Object.keys(doc.data).some((k) => k.startsWith(prefix)) ||
      Object.keys(doc.dirs).some((k) => k.startsWith(prefix));
    return hasChild ? { kind: 'dir' } : { kind: 'none' };
  }

  /** List immediate children at a path (default '/'). */
  async list(path: string = '/'): Promise<ListEntry[]> {
    const key = this.dotted(path);
    const doc = await this.getDocOrCreate();
    const results = new Map<string, 'file' | 'dir'>();
    const prefix = key === '' ? '' : key + '.';

    // From files
    for (const k of Object.keys(doc.data)) {
      if (!k.startsWith(prefix)) continue;
      const rest = k.slice(prefix.length);
      if (rest.length === 0) continue; // exact file not a child
      const seg = rest.split('.', 1)[0];
      const isDirect = rest === seg; // file directly under
      if (!results.has(seg)) results.set(seg, isDirect ? 'file' : 'dir');
      else if (!isDirect) results.set(seg, 'dir');
    }

    // From explicit dirs
    for (const k of Object.keys(doc.dirs)) {
      if (!k.startsWith(prefix)) continue;
      const rest = k.slice(prefix.length);
      if (rest.length === 0) continue;
      const seg = rest.split('.', 1)[0];
      results.set(seg, 'dir');
    }

    return Array.from(results, ([name, kind]) => ({ name, kind }));
  }

  /** Read file content; throws if dir or not found. */
  async read(path: string): Promise<string> {
    const key = this.dotted(path);
    const doc = await this.getDocOrCreate();
    const val = doc.data[key];
    if (val === undefined) {
      const s = await this.stat(path);
      if (s.kind === 'dir') throw new Error('EISDIR: path is a directory');
      throw new Error('ENOENT: file not found');
    }
    return val;
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

    const current = dataMap[key];
    const next = current === undefined ? data : current + (current.endsWith('\n') || data.startsWith('\n') ? '' : '\n') + data;
    await this.collection.updateOne(this.filter, { $set: { [`data.${key}`]: next } });
  }

  /** Replace all occurrences of `oldStr` with `newStr` in the file. Returns number of replacements. */
  async update(path: string, oldStr: string, newStr: string): Promise<number> {
    if (typeof oldStr !== 'string' || typeof newStr !== 'string') throw new Error('update expects string args');
    const key = this.dotted(path);
    const doc = await this.getDocOrCreate();

    if (Object.prototype.hasOwnProperty.call(doc.dirs, key)) throw new Error('EISDIR: path is a directory');

    const current = doc.data[key];
    if (current === undefined) throw new Error('ENOENT: file not found');

    if (oldStr.length === 0) return 0;
    const parts = current.split(oldStr);
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
      const files = Object.keys(doc.data).length;
      const dirs = Object.keys(doc.dirs).length;
      await this.collection.updateOne(this.filter, { $set: { data: {}, dirs: {} } });
      return { files, dirs };
    }
    const prefix = key + '.';
    const unset: Record<string, ''> = {} as any;
    let files = 0;
    if (Object.prototype.hasOwnProperty.call(doc.data, key)) {
      unset[`data.${key}`] = '' as any;
      files += 1;
    }
    for (const k of Object.keys(doc.data)) {
      if (k.startsWith(prefix)) {
        unset[`data.${k}`] = '' as any;
        files += 1;
      }
    }

    let dirs = 0;
    if (Object.prototype.hasOwnProperty.call(doc.dirs, key)) {
      unset[`dirs.${key}`] = '' as any;
      dirs += 1;
    }
    for (const k of Object.keys(doc.dirs)) {
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
    return { ...doc.data };
  }

  /** Convenience dump of entire doc (shallow). */
  async dump(): Promise<Pick<MemoryDoc, 'nodeId' | 'scope' | 'threadId'> & { data: Record<string, string>; dirs: Record<string, true> }> {
    const doc = await this.getDocOrCreate();
    return { nodeId: doc.nodeId, scope: doc.scope, threadId: doc.threadId, data: { ...doc.data }, dirs: { ...doc.dirs } };
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
