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
    await this.coll().createIndex({ nodeId: 1, scope: 1, threadId: 1 }, { unique: true, name: 'memories_unique_scope' });
    this.indexesEnsured = true;
  }

  // Helpers
  private normalizePath(path: string): string {
    if (path === undefined || path === null) throw new Error('Invalid path');
    if (typeof path !== 'string') throw new Error('Invalid path');
    const trimmed = path.trim();
    if (trimmed === '' || trimmed === '/') return '';
    if (!trimmed.startsWith('/')) throw new Error('Path must start with /');
    if (trimmed.includes('..')) throw new Error('Path cannot contain ..');
    if (trimmed.includes('//')) throw new Error('Path cannot contain //');
    const parts = trimmed
      .split('/')
      .filter(Boolean)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
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
      const hasAny = this.isDirValue(data) && Object.keys(data).length > 0;
      const exists = this.isDirValue(data);
      const type = exists ? 'dir' : undefined;
      return { exists, type, kind: exists ? 'dir' : 'missing' };
    }

    const exact = this.getAt(data, prefix);
    if (exact.found) {
      if (this.isDirValue(exact.value)) return { exists: true, type: 'dir', kind: 'dir' };
      return { exists: true, type: 'file', kind: 'file' };
    }

    // Not found exactly; because we store nested objects, absence means missing
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
    // Check for collisions with non-object along the way
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
          // Will be created by $set
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

  // Mutating APIs to be implemented later
  async append(path: string, data: any): Promise<void> {
    const prefix = this.normalizePath(path);
    const { key, doc } = await this.getDoc();
    const dataRoot = doc?.data ?? {};

    if (prefix === '') throw new Error('Cannot append at root');

    const parentPath = prefix.split('.').slice(0, -1).join('.');
    const leaf = prefix.split('.').slice(-1)[0]!;
    const parent = parentPath ? this.getAt(dataRoot, parentPath) : { found: true, value: dataRoot };

    if (!parent.found) {
      // create missing parents as objects via $set of entire path to object chain
      // But we can directly $set leaf; Mongo will create ancestors implicitly
    }

    // Check current value
    const current = this.getAt(dataRoot, prefix);

    if (!current.found) {
      // set to data
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
    } else if (this.isDirValue(val)) {
      // Already handled; just to satisfy TS
      throw new Error('Cannot append to a directory');
    } else if (val !== null && typeof val === 'object') {
      // unreachable due to isDirValue; keep for completeness
      newVal = { ...(val as any), ...(typeof data === 'object' && !Array.isArray(data) ? data : {}) };
    } else if (typeof val === 'object' && !Array.isArray(val)) {
      // shallow merge if both objects
      if (typeof data === 'object' && data !== null && !Array.isArray(data)) newVal = Object.assign({}, val, data);
      else newVal = [val, data];
    } else if (typeof val === 'string') {
      newVal = val + '\n' + String(data);
    } else if (Array.isArray(val)) {
      newVal = Array.isArray(data) ? [...val, ...data] : [...val, data];
    } else {
      // primitive
      newVal = [val, data];
    }

    await this.coll().updateOne(
      key,
      { $set: { [`data.${prefix}`]: newVal }, $currentDate: { 'meta.updatedAt': true }, $setOnInsert: { 'meta.createdAt': new Date() } },
      { upsert: true },
    );
  }

  async update(_path: string, _oldData: any, _newData: any): Promise<void> {
    throw new NotImplementedError('update');
  }

  async delete(_path: string): Promise<void> {
    throw new NotImplementedError('delete');
  }

  // Expose helpers for tests
  _normalizePath(path: string) {
    return this.normalizePath(path);
  }
  _ensureDocKey() {
    return this.ensureDocKey();
  }
}
