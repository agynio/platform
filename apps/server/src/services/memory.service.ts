import type { Db, Collection, Document } from 'mongodb';
import { LoggerService } from './logger.service';

export type MemoryScope = 'global' | 'perThread';

export class NotImplementedError extends Error {
  constructor(method: string) {
    super(`${method} not implemented`);
    this.name = 'NotImplementedError';
  }
}

type Key = { nodeId: string; scope: MemoryScope; threadId?: string };

type Stat = { exists: boolean; type?: 'dir' | 'file'; kind?: 'dir' | 'file' | 'missing' };

export class MemoryService {
  private indexesEnsured = false;

  constructor(
    private db: Db,
    private logger: LoggerService,
    private opts: { nodeId: string; scope: MemoryScope; threadResolver: () => string | undefined },
  ) {}

  private coll(): Collection<Document> {
    return this.db.collection('memories');
  }

  private async ensureIndexes() {
    if (this.indexesEnsured) return;
    // Unique index for perThread docs (threadId exists)
    await this.coll().createIndex(
      { nodeId: 1, scope: 1, threadId: 1 },
      { unique: true, name: 'memories_unique_per_thread', partialFilterExpression: { threadId: { $exists: true } } },
    );
    // Unique index for global docs (no threadId)
    await this.coll().createIndex(
      { nodeId: 1, scope: 1 },
      { unique: true, name: 'memories_unique_global', partialFilterExpression: { threadId: { $exists: false } } },
    );
    this.indexesEnsured = true;
  }

  // Helpers
  private normalizePath(path: string): string {
    if (path === undefined || path === null) throw new Error('Invalid path: undefined');
    if (typeof path !== 'string') throw new Error('Invalid path: must be string');
    let trimmed = path.trim();
    if (trimmed === '' || trimmed === '/') return '';
    if (!trimmed.startsWith('/')) throw new Error('Invalid path: must start with /');
    if (trimmed.includes('..')) throw new Error('Invalid path: path cannot contain ..');
    // collapse multiple slashes
    trimmed = trimmed.replace(/\/+/, '/');
    if (trimmed.includes('//')) throw new Error('Invalid path: path cannot contain //');
    const parts = trimmed
      .split('/')
      .filter(Boolean)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
    const validSeg = /^[A-Za-z0-9_\- ]+$/;
    for (const seg of parts) {
      if (seg.includes('$')) throw new Error(`Invalid path segment '${seg}': contains $`);
      if (!validSeg.test(seg)) throw new Error(`Invalid path segment '${seg}': only alphanum, space, _, - allowed`);
    }
    return parts.join('.');
  }

  private ensureDocKey(): Key {
    const { nodeId, scope, threadResolver } = this.opts;
    if (scope === 'global') return { nodeId, scope };
    const threadId = threadResolver();
    if (!threadId) throw new Error('threadId is required for perThread scope');
    return { nodeId, scope, threadId };
  }

  private async getDoc(): Promise<{ key: Key; doc: any | null }> {
    await this.ensureIndexes();
    const key = this.ensureDocKey();
    const doc = await this.coll().findOne(key);
    return { key, doc };
  }

  private getAt(obj: any, dot: string): { found: boolean; value?: any } {
    if (!dot) return { found: true, value: obj };
    const parts = dot.split('.');
    let cur = obj;
    for (const p of parts) {
      if (cur && typeof cur === 'object' && !Array.isArray(cur) && p in cur) {
        cur = (cur as any)[p];
      } else {
        return { found: false };
      }
    }
    return { found: true, value: cur };
  }

  private isDirValue(v: any): boolean {
    return v !== null && typeof v === 'object' && !Array.isArray(v);
  }

  private immediateChildren(obj: any): { name: string; type: 'dir' | 'file' }[] {
    if (!this.isDirValue(obj)) return [];
    return Object.keys(obj).map((k) => ({ name: k, type: this.isDirValue(obj[k]) ? 'dir' : 'file' }));
  }

  async stat(path: string): Promise<Stat> {
    const prefix = this.normalizePath(path);
    const { doc } = await this.getDoc();
    const data = doc?.data ?? {};

    if (prefix === '') {
      const exists = this.isDirValue(data);
      const type = exists ? 'dir' : undefined;
      return { exists, type, kind: exists ? 'dir' : 'missing' };
    }

    const exact = this.getAt(data, prefix);
    if (exact.found) {
      if (this.isDirValue(exact.value)) return { exists: true, type: 'dir', kind: 'dir' };
      return { exists: true, type: 'file', kind: 'file' };
    }

    return { exists: false, kind: 'missing' };
  }

  async read(path: string): Promise<any> {
    const prefix = this.normalizePath(path);
    const { doc } = await this.getDoc();
    const data = doc?.data ?? {};

    if (prefix === '') {
      const children = this.immediateChildren(data);
      const out: Record<string, { kind: 'dir' | 'file' }> = {};
      for (const c of children) out[c.name] = { kind: c.type } as any;
      return out;
    }

    const exact = this.getAt(data, prefix);
    if (!exact.found) return undefined;
    if (this.isDirValue(exact.value)) {
      const children = this.immediateChildren(exact.value);
      const out: Record<string, { kind: 'dir' | 'file' }> = {};
      for (const c of children) out[c.name] = { kind: c.type } as any;
      return out;
    }
    return exact.value;
  }

  async list(path: string = '/'): Promise<{ name: string; type: 'dir' | 'file' }[]> {
    const prefix = this.normalizePath(path);
    const { doc } = await this.getDoc();
    const data = doc?.data ?? {};

    if (prefix === '') return this.immediateChildren(data);
    const exact = this.getAt(data, prefix);
    if (!exact.found) return [];
    return this.immediateChildren(exact.value);
  }

  async ensureDir(path: string): Promise<void> {
    const prefix = this.normalizePath(path);
    if (prefix === '') return; // root

    const parts = prefix.split('.');
    const { key, doc } = await this.getDoc();
    const data = doc?.data ?? {};
    let cur: any = data;
    for (const p of parts) {
      if (cur && typeof cur === 'object' && !Array.isArray(cur)) {
        if (p in cur) {
          const v = cur[p];
          if (!this.isDirValue(v)) {
            throw new Error(`Cannot create directory at '${path}': file exists in the way`);
          }
          cur = v;
        } else {
          cur = undefined as any;
        }
      } else if (cur === undefined) {
        break;
      } else {
        throw new Error(`Cannot create directory at '${path}': invalid parent`);
      }
    }

    const setField = `data.${prefix}`;
    await this.coll().updateOne(
      key,
      {
        $set: { [setField]: {} },
        $setOnInsert: { 'meta.createdAt': new Date() },
        $currentDate: { 'meta.updatedAt': true },
      },
      { upsert: true },
    );
  }

  async append(path: string, data: any): Promise<void> {
    const prefix = this.normalizePath(path);
    const { key, doc } = await this.getDoc();
    const dataRoot = doc?.data ?? {};

    if (prefix === '') throw new Error('Cannot append at root');

    const current = this.getAt(dataRoot, prefix);

    if (!current.found) {
      await this.coll().updateOne(
        key,
        { $set: { [`data.${prefix}`]: data }, $setOnInsert: { 'meta.createdAt': new Date() }, $currentDate: { 'meta.updatedAt': true } },
        { upsert: true },
      );
      return;
    }

    const val = current.value;
    if (this.isDirValue(val)) throw new Error('Cannot append to a directory');

    let newVal: any;
    if (Array.isArray(val)) {
      if (Array.isArray(data)) newVal = [...val, ...data];
      else newVal = [...val, data];
    } else if (typeof val === 'string') {
      newVal = val.length ? `${val}\n${String(data)}` : String(data);
    } else if (val !== null && typeof val === 'object') {
      newVal = { ...(val as any), ...(typeof data === 'object' && !Array.isArray(data) ? data : {}) };
    } else {
      newVal = [val, data];
    }

    await this.coll().updateOne(
      key,
      { $set: { [`data.${prefix}`]: newVal }, $currentDate: { 'meta.updatedAt': true }, $setOnInsert: { 'meta.createdAt': new Date() } },
      { upsert: true },
    );
  }

  async update(path: string, oldData: any, newData: any): Promise<{ updated: number }> {
    const prefix = this.normalizePath(path);
    const { key, doc } = await this.getDoc();
    const dataRoot = doc?.data ?? {};
    if (prefix === '') throw new Error('Cannot update root');

    const current = this.getAt(dataRoot, prefix);
    if (!current.found) return { updated: 0 };
    const val = current.value;
    if (this.isDirValue(val)) throw new Error('Cannot update a directory');

    let updated = 0;
    let newVal: any = val;

    if (Array.isArray(val)) {
      newVal = (val as any[]).map((v) => (v === oldData ? (updated++, newData) : v));
    } else if (typeof val === 'string') {
      const src = String(oldData);
      const dst = String(newData);
      if (src.length === 0) return { updated: 0 };
      const parts = String(val).split(src);
      updated = parts.length - 1;
      newVal = parts.join(dst);
    } else if (val !== null && typeof val === 'object') {
      const obj = { ...(val as Record<string, any>) };
      for (const k of Object.keys(obj)) {
        if (obj[k] === oldData) {
          obj[k] = newData;
          updated++;
        }
      }
      newVal = obj;
    } else {
      if (val === oldData) {
        newVal = newData;
        updated = 1;
      }
    }

    if (updated > 0) {
      await this.coll().updateOne(
        key,
        { $set: { [`data.${prefix}`]: newVal }, $currentDate: { 'meta.updatedAt': true }, $setOnInsert: { 'meta.createdAt': new Date() } },
        { upsert: true },
      );
    }

    return { updated };
  }

  async delete(path: string): Promise<{ deleted: number }> {
    const prefix = this.normalizePath(path);
    const { key, doc } = await this.getDoc();
    const dataRoot = doc?.data ?? {};
    if (prefix === '') throw new Error('Cannot delete root');

    const current = this.getAt(dataRoot, prefix);
    if (!current.found) return { deleted: 0 };

    if (!this.isDirValue(current.value)) {
      await this.coll().updateOne(
        key,
        { $unset: { [`data.${prefix}`]: '' }, $currentDate: { 'meta.updatedAt': true }, $setOnInsert: { 'meta.createdAt': new Date() } },
        { upsert: true },
      );
      return { deleted: 1 };
    }

    const unsetOps: Record<string, ''> = {} as any;
    let count = 0;
    const buildUnsets = (baseObj: any, basePath: string) => {
      if (!this.isDirValue(baseObj)) {
        unsetOps[`data.${basePath}`] = '' as any;
        count++;
        return;
      }
      for (const k of Object.keys(baseObj)) {
        const next = basePath ? `${basePath}.${k}` : k;
        buildUnsets(baseObj[k], next);
      }
    };
    buildUnsets(current.value, prefix);

    if (count === 0) {
      unsetOps[`data.${prefix}`] = '' as any;
    }

    await this.coll().updateOne(
      key,
      { $unset: unsetOps, $currentDate: { 'meta.updatedAt': true }, $setOnInsert: { 'meta.createdAt': new Date() } },
      { upsert: true },
    );

    return { deleted: count || 1 };
  }

  // Expose helpers for tests
  _normalizePath(path: string) {
    return this.normalizePath(path);
  }
  _ensureDocKey() {
    return this.ensureDocKey();
  }
}
