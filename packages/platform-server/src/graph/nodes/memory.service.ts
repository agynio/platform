import { Inject, Injectable } from '@nestjs/common';
import type { MemoryDirsMap, MemoryDataMap, MemoryDoc, MemoryFilter, MemoryScope, ListEntry, StatResult } from './memory.types';
import type { MemoryRepositoryPort } from './memory.repository';
import { PostgresMemoryRepository } from './memory.repository';

/**
 * Memory service with string-only file values.
 * One document per { nodeId, scope[, threadId] } in the `memories` table.
 * Paths map to dotted keys in doc.data: "/a/b/c" -> data["a.b.c"]. Back-compat for nested JSON present.
 */
@Injectable()
export class MemoryService {
  constructor(@Inject(PostgresMemoryRepository) private readonly repo: MemoryRepositoryPort) {}

  normalizePath(rawPath: string): string {
    if (!rawPath) throw new Error('path is required');
    let p = rawPath.replace(/\\+/g, '/');
    p = p.replace(/\/+/g, '/');
    if (!p.startsWith('/')) p = '/' + p;
    if (p.length > 1 && p.endsWith('/')) p = p.replace(/\/+$/g, '');
    if (p.includes('..')) throw new Error('invalid path: ".." not allowed');
    if (p.includes('$')) throw new Error('invalid path: "$" not allowed');
    const segs = p.split('/').filter(Boolean);
    const valid = /^[A-Za-z0-9_. -]+$/;
    for (const s of segs) {
      if (!valid.test(s)) throw new Error(`invalid path segment: ${s}`);
    }
    return p;
  }

  async ensureIndexes(): Promise<void> {
    // Schema managed via migrations; nothing to do.
  }

  private buildFilter(nodeId: string, scope: MemoryScope, threadId?: string): MemoryFilter {
    const filter: MemoryFilter = { nodeId, scope };
    if (scope === 'perThread') filter.threadId = threadId;
    return filter;
  }

  async checkDocExists(nodeId: string, scope: MemoryScope, threadId?: string): Promise<boolean> {
    const found = await this.repo.getDoc(this.buildFilter(nodeId, scope, threadId));
    return !!found;
  }

  private async getDocOrCreate(nodeId: string, scope: MemoryScope, threadId?: string): Promise<MemoryDoc> {
    const doc = await this.repo.getOrCreateDoc(this.buildFilter(nodeId, scope, threadId));
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

  private async ensureAncestorDirs(nodeId: string, scope: MemoryScope, threadId: string | undefined, normPath: string): Promise<void> {
    const segments = this.getPathSegments(normPath);
    if (segments.length <= 1) return;
    await this.repo.withDoc<void>(this.buildFilter(nodeId, scope, threadId), async (doc) => {
      const dirs: MemoryDirsMap = { ...doc.dirs };
      for (let i = 1; i < segments.length; i++) {
        const dirPath = '/' + segments.slice(0, i).join('/');
        const dirKey = this.dotted(dirPath);
        dirs[dirKey] = true;
      }
      return { doc: { ...doc, dirs } };
    });
  }

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

  private hasFlatChild(doc: MemoryDoc, key: string): boolean {
    const prefix = key ? key + '.' : '';
    if (Object.keys(doc.data).some((k) => typeof k === 'string' && k.startsWith(prefix))) return true;
    if (Object.keys(doc.dirs).some((k) => typeof k === 'string' && k.startsWith(prefix))) return true;
    return false;
  }

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

  async ensureDir(nodeId: string, scope: MemoryScope, threadId: string | undefined, path: string): Promise<void> {
    const norm = this.normalizePath(path);
    const key = this.dotted(norm);
    if (key === '') return;
    await this.ensureAncestorDirs(nodeId, scope, threadId, norm);
    await this.repo.withDoc<void>(this.buildFilter(nodeId, scope, threadId), async (doc) => {
      const updatedDirs: MemoryDirsMap = { ...doc.dirs, [key]: true };
      return { doc: { ...doc, dirs: updatedDirs } };
    });
  }

  async stat(nodeId: string, scope: MemoryScope, threadId: string | undefined, path: string): Promise<StatResult> {
    const key = this.dotted(path);
    const doc = await this.getDocOrCreate(nodeId, scope, threadId);
    if (key === '') return { kind: 'dir' };
    const n = this.getNested(doc.data, key);
    if (n.exists) {
      if (typeof n.node === 'string') return { kind: 'file', size: Buffer.byteLength(n.node || '') };
      return { kind: 'dir' };
    }
    if (Object.prototype.hasOwnProperty.call(doc.data, key)) {
      const v = doc.data[key];
      if (typeof v === 'string') return { kind: 'file', size: Buffer.byteLength(v || '') };
    }
    if (Object.prototype.hasOwnProperty.call(doc.dirs, key)) return { kind: 'dir' };
    const hasChild = this.hasFlatChild(doc, key);
    return hasChild ? { kind: 'dir' } : { kind: 'none' };
  }

  async list(nodeId: string, scope: MemoryScope, threadId: string | undefined, path: string = '/'): Promise<ListEntry[]> {
    const key = this.dotted(path);
    const doc = await this.getDocOrCreate(nodeId, scope, threadId);
    const nestedChildren: ListEntry[] = [];
    const n = this.getNested(doc.data, key);
    if (n.exists && typeof n.node === 'object' && n.node !== null) {
      nestedChildren.push(...this.listNestedChildren(n.node));
    }
    const nd = this.getNested(doc.dirs, key);
    if (nd.exists && typeof nd.node === 'object' && nd.node !== null) {
      for (const name of Object.keys(nd.node as Record<string, unknown>)) nestedChildren.push({ name, kind: 'dir' });
    }
    const flatMap = new Map<string, 'file' | 'dir'>();
    const prefix = key === '' ? '' : key + '.';
    for (const fullKey of Object.keys(doc.data)) {
      if (!fullKey.startsWith(prefix)) continue;
      const rest = fullKey.slice(prefix.length);
      if (rest.length === 0) continue;
      const attemptDir = (segment: string): boolean => {
        if (!segment) return false;
        const candidate = prefix ? `${prefix}${segment}` : segment;
        return Object.prototype.hasOwnProperty.call(doc.dirs, candidate);
      };
      const resolve = (restKey: string): { name: string; kind: 'file' | 'dir' } => {
        if (!restKey.includes('.')) {
          const isDir = attemptDir(restKey);
          return { name: restKey, kind: isDir ? 'dir' : 'file' };
        }
        let idx = restKey.indexOf('.');
        while (idx !== -1) {
          const segment = restKey.slice(0, idx);
          if (attemptDir(segment)) return { name: segment, kind: 'dir' };
          idx = restKey.indexOf('.', idx + 1);
        }
        const isDir = attemptDir(restKey);
        return { name: restKey, kind: isDir ? 'dir' : 'file' };
      };
      const { name, kind } = resolve(rest);
      if (!name) continue;
      const prev = flatMap.get(name);
      if (!prev || (prev === 'file' && kind === 'dir')) flatMap.set(name, kind);
    }
    for (const fullKey of Object.keys(doc.dirs)) {
      if (!fullKey.startsWith(prefix)) continue;
      const rest = fullKey.slice(prefix.length);
      if (rest.length === 0) continue;
      const name = rest.includes('.') ? rest.slice(0, rest.indexOf('.')) : rest;
      if (!name) continue;
      flatMap.set(name, 'dir');
    }
    const flatChildren = Array.from(flatMap, ([name, kind]) => ({ name, kind }));
    return this.mergeChildren(nestedChildren, flatChildren);
  }

  async read(nodeId: string, scope: MemoryScope, threadId: string | undefined, path: string): Promise<string> {
    const key = this.dotted(path);
    const doc = await this.getDocOrCreate(nodeId, scope, threadId);
    const nested = this.getNested(doc.data, key);
    if (nested.exists) {
      if (typeof nested.node === 'string') return nested.node;
      throw new Error('EISDIR: path is a directory');
    }
    const flat = doc.data[key];
    if (typeof flat === 'string') return flat;
    const s = await this.stat(nodeId, scope, threadId, path);
    if (s.kind === 'dir') throw new Error('EISDIR: path is a directory');
    throw new Error('ENOENT: file not found');
  }

  async append(nodeId: string, scope: MemoryScope, threadId: string | undefined, path: string, data: string): Promise<void> {
    if (typeof data !== 'string') throw new Error('append expects string data');
    const norm = this.normalizePath(path);
    const key = this.dotted(norm);
    await this.ensureAncestorDirs(nodeId, scope, threadId, norm);
    await this.repo.withDoc<void>(this.buildFilter(nodeId, scope, threadId), async (doc) => {
      if (Object.prototype.hasOwnProperty.call(doc.dirs, key)) throw new Error('EISDIR: path is a directory');
      let current: string | undefined = undefined;
      const nested = this.getNested(doc.data, key);
      if (nested && nested.exists && typeof nested.node === 'string') current = nested.node as string;
      if (current === undefined) {
        const direct = doc.data[key];
        if (typeof direct === 'string') current = direct;
      }
      const next = current === undefined ? data : current + (current.endsWith('\n') || data.startsWith('\n') ? '' : '\n') + data;
      const newData: MemoryDataMap = { ...doc.data, [key]: next };
      return { doc: { ...doc, data: newData } };
    });
  }

  async update(nodeId: string, scope: MemoryScope, threadId: string | undefined, path: string, oldStr: string, newStr: string): Promise<number> {
    if (typeof oldStr !== 'string' || typeof newStr !== 'string') throw new Error('update expects string args');
    const key = this.dotted(path);
    let replaced = 0;
    await this.repo.withDoc<void>(this.buildFilter(nodeId, scope, threadId), async (doc) => {
      if (Object.prototype.hasOwnProperty.call(doc.dirs, key)) throw new Error('EISDIR: path is a directory');
      let current: string | undefined = undefined;
      const nested = this.getNested(doc.data, key);
      if (nested && nested.exists) {
        if (typeof nested.node === 'string') current = nested.node as string;
        else throw new Error('EISDIR: path is a directory');
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

  async delete(nodeId: string, scope: MemoryScope, threadId: string | undefined, path: string): Promise<{ files: number; dirs: number }> {
    const key = this.dotted(path);
    let out = { files: 0, dirs: 0 };
    await this.repo.withDoc<void>(this.buildFilter(nodeId, scope, threadId), async (doc) => {
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
        const nested = this.getNested(doc.data, key);
        if (nested && nested.exists && typeof nested.node === 'string') {
          delete dataObj[key];
          files += 1;
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

  async getAll(nodeId: string, scope: MemoryScope, threadId: string | undefined): Promise<Record<string, string>> {
    const doc = await this.getDocOrCreate(nodeId, scope, threadId);
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(doc.data)) {
      if (typeof value === 'string') out[key] = value;
    }
    return out;
  }

  async dump(nodeId: string, scope: MemoryScope, threadId: string | undefined): Promise<Pick<MemoryDoc, 'nodeId' | 'scope' | 'threadId'> & { data: Record<string, string>; dirs: Record<string, true> }>
  {
    const doc = await this.getDocOrCreate(nodeId, scope, threadId);
    const dataOut: Record<string, string> = {};
    for (const [key, value] of Object.entries(doc.data)) {
      if (typeof value === 'string') dataOut[key] = value;
    }
    const dirOut: Record<string, true> = {};
    for (const [key, value] of Object.entries(doc.dirs)) {
      if (value === true) dirOut[key] = true;
    }
    return { nodeId: doc.nodeId, scope: doc.scope, threadId: doc.threadId, data: dataOut, dirs: dirOut };
  }

  // Convenience: provide a bound adapter for existing consumers
  forMemory(nodeId: string, scope: MemoryScope, threadId?: string) {
    return {
      list: (path = '/') => this.list(nodeId, scope, threadId, path),
      stat: (path: string) => this.stat(nodeId, scope, threadId, path),
      read: (path: string) => this.read(nodeId, scope, threadId, path),
      append: (path: string, data: string) => this.append(nodeId, scope, threadId, path, data),
      update: (path: string, oldStr: string, newStr: string) => this.update(nodeId, scope, threadId, path, oldStr, newStr),
      ensureDir: (path: string) => this.ensureDir(nodeId, scope, threadId, path),
      delete: (path: string) => this.delete(nodeId, scope, threadId, path),
      getAll: () => this.getAll(nodeId, scope, threadId),
      dump: () => this.dump(nodeId, scope, threadId),
    } as const;
  }
}
