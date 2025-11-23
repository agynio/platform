import { Inject, Injectable } from '@nestjs/common';
import { GraphRepository } from '../../graph/graph.repository';
import {
  PostgresMemoryEntitiesRepository,
  type MemoryEntitiesRepositoryPort,
  type RepoFilter,
} from './memory.repository';
import type { DeleteResult, ListEntry, MemoryEntity, MemoryScope, StatResult } from './memory.types';

const VALID_SEGMENT = /^[A-Za-z0-9_. -]+$/;

@Injectable()
export class MemoryService {
  constructor(
    @Inject(PostgresMemoryEntitiesRepository) private readonly repo: MemoryEntitiesRepositoryPort,
    @Inject(GraphRepository) private readonly graphRepo: GraphRepository,
  ) {}

  normalizePath(rawPath: string, opts: { allowRoot?: boolean } = {}): string {
    const allowRoot = opts.allowRoot ?? false;
    if (rawPath == null) throw new Error('path is required');
    let p = String(rawPath);
    if (p.length === 0) {
      if (allowRoot) return '/';
      throw new Error('path is required');
    }
    p = p.replace(/\\+/g, '/');
    p = p.trim();
    if (p.length === 0) {
      if (allowRoot) return '/';
      throw new Error('path is required');
    }
    p = p.replace(/\/+/g, '/');
    if (!p.startsWith('/')) p = '/' + p;
    p = p.replace(/\/+/g, '/');
    if (p.length > 1 && p.endsWith('/')) p = p.replace(/\/+$/g, '');
    if (p === '') p = '/';
    if (p === '/' && allowRoot) return '/';
    if (p === '/' && !allowRoot) throw new Error('path is required');
    if (p.includes('..')) throw new Error('invalid path: ".." not allowed');
    if (p.includes('$')) throw new Error('invalid path: "$" not allowed');
    const segments = this.getSegments(p);
    for (const segment of segments) {
      if (!VALID_SEGMENT.test(segment)) throw new Error(`invalid path segment: ${segment}`);
    }
    return p;
  }

  async ensureIndexes(): Promise<void> {
    // Schema managed via migrations; nothing to do.
  }

  async listDocs(): Promise<Array<{ nodeId: string; scope: MemoryScope; threadId?: string }>> {
    const rows = await this.repo.listDistinctNodeThreads();
    let graph = null;
    try {
      graph = await this.graphRepo.get('main');
    } catch {
      graph = null;
    }

    if (!graph) {
      return this.buildDocsFromPersistence(rows);
    }

    return this.buildDocsFromGraph(graph.nodes ?? [], rows);
  }

  private getSegments(path: string): string[] {
    if (path === '/') return [];
    return path.slice(1).split('/');
  }

  private buildFilter(nodeId: string, scope: MemoryScope, threadId?: string): RepoFilter {
    if (scope === 'perThread') {
      if (!threadId || threadId.trim().length === 0) throw new Error('threadId required for perThread scope');
      return { nodeId, threadId: threadId.trim() };
    }
    return { nodeId, threadId: null };
  }

  private normalizeThreadId(threadId: string | null): string | undefined {
    if (typeof threadId !== 'string') return undefined;
    const trimmed = threadId.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  private buildDocsResponse(
    scopeByNode: Map<string, MemoryScope>,
    threadIdsByNode: Map<string, Set<string>>,
  ): Array<{ nodeId: string; scope: MemoryScope; threadId?: string }> {
    const sortedNodes = Array.from(scopeByNode.entries()).sort(([a], [b]) => a.localeCompare(b));
    const items: Array<{ nodeId: string; scope: MemoryScope; threadId?: string }> = [];
    for (const [nodeId, scope] of sortedNodes) {
      items.push({ nodeId, scope });
      if (scope !== 'perThread') continue;
      const threads = Array.from(threadIdsByNode.get(nodeId) ?? []).sort((a, b) => a.localeCompare(b));
      for (const threadId of threads) {
        items.push({ nodeId, scope, threadId });
      }
    }
    return items;
  }

  private buildDocsFromPersistence(
    rows: Array<{ nodeId: string; threadId: string | null }>,
  ): Array<{ nodeId: string; scope: MemoryScope; threadId?: string }> {
    const scopeByNode = new Map<string, MemoryScope>();
    const threadIdsByNode = new Map<string, Set<string>>();
    for (const row of rows) {
      const threadId = this.normalizeThreadId(row.threadId);
      const current = scopeByNode.get(row.nodeId);
      if (!current || current === 'global') {
        scopeByNode.set(row.nodeId, threadId ? 'perThread' : current ?? 'global');
      }
      if (threadId) {
        if (!threadIdsByNode.has(row.nodeId)) threadIdsByNode.set(row.nodeId, new Set());
        threadIdsByNode.get(row.nodeId)!.add(threadId);
      }
    }
    return this.buildDocsResponse(scopeByNode, threadIdsByNode);
  }

  private buildDocsFromGraph(
    graphNodes: Array<{ id: string; template?: string; config?: Record<string, unknown> | null }>,
    rows: Array<{ nodeId: string; threadId: string | null }>,
  ): Array<{ nodeId: string; scope: MemoryScope; threadId?: string }> {
    const scopeByNode = new Map<string, MemoryScope>();
    const threadIdsByNode = new Map<string, Set<string>>();

    for (const node of graphNodes) {
      if (node.template !== 'memory') continue;
      const cfg = node.config as { scope?: unknown } | undefined;
      const scope: MemoryScope = cfg?.scope === 'perThread' ? 'perThread' : 'global';
      if (!scopeByNode.has(node.id)) {
        scopeByNode.set(node.id, scope);
      }
    }

    for (const row of rows) {
      const scope = scopeByNode.get(row.nodeId);
      if (!scope || scope !== 'perThread') continue;
      const threadId = this.normalizeThreadId(row.threadId);
      if (!threadId) continue;
      if (!threadIdsByNode.has(row.nodeId)) threadIdsByNode.set(row.nodeId, new Set());
      threadIdsByNode.get(row.nodeId)!.add(threadId);
    }

    return this.buildDocsResponse(scopeByNode, threadIdsByNode);
  }

  async ensureDir(nodeId: string, scope: MemoryScope, threadId: string | undefined, path: string): Promise<void> {
    const filter = this.buildFilter(nodeId, scope, threadId);
    const norm = this.normalizePath(path, { allowRoot: true });
    if (norm === '/') return;
    const segments = this.getSegments(norm);
    await this.repo.ensurePath(filter, segments);
  }

  async stat(nodeId: string, scope: MemoryScope, threadId: string | undefined, path: string): Promise<StatResult> {
    const filter = this.buildFilter(nodeId, scope, threadId);
    const norm = this.normalizePath(path, { allowRoot: true });
    if (norm === '/') {
      const children = await this.repo.listChildren(filter, null);
      return { exists: true, hasSubdocs: children.length > 0, contentLength: 0 };
    }
    const segments = this.getSegments(norm);
    const entity = await this.repo.resolvePath(filter, segments);
    if (!entity) {
      return { exists: false, hasSubdocs: false, contentLength: 0 };
    }
    const hasChildren = await this.repo.entityHasChildren(entity.id);
    const contentLength = entity.content != null ? Buffer.byteLength(entity.content) : 0;
    return { exists: true, hasSubdocs: hasChildren, contentLength };
  }

  async list(nodeId: string, scope: MemoryScope, threadId: string | undefined, rawPath: string = '/'): Promise<ListEntry[]> {
    const filter = this.buildFilter(nodeId, scope, threadId);
    const norm = this.normalizePath(rawPath || '/', { allowRoot: true });
    const segments = this.getSegments(norm);
    let parentId: string | null = null;
    if (segments.length > 0) {
      const parent = await this.repo.resolvePath(filter, segments);
      if (!parent) return [];
      parentId = parent.id;
    }
    const children = await this.repo.listChildren(filter, parentId);
    return children.map((child) => ({
      name: child.name,
      hasSubdocs: child.hasChildren,
    }));
  }

  async read(nodeId: string, scope: MemoryScope, threadId: string | undefined, path: string): Promise<string> {
    const filter = this.buildFilter(nodeId, scope, threadId);
    const norm = this.normalizePath(path, { allowRoot: true });
    if (norm === '/') return '';
    const segments = this.getSegments(norm);
    const entity = await this.repo.resolvePath(filter, segments);
    if (!entity) throw new Error('ENOENT: document not found');
    return entity.content ?? '';
  }

  async append(nodeId: string, scope: MemoryScope, threadId: string | undefined, path: string, data: string): Promise<void> {
    if (typeof data !== 'string') throw new Error('append expects string data');
    const filter = this.buildFilter(nodeId, scope, threadId);
    const norm = this.normalizePath(path);
    const segments = this.getSegments(norm);
    if (segments.length === 0) throw new Error('append requires document path');
    const entity = await this.repo.ensurePath(filter, segments);
    if (!entity) throw new Error('append requires document path');
    const base = entity.content ?? '';
    const needsSeparator = base.length > 0 && !base.endsWith('\n') && !data.startsWith('\n');
    const next = base.length === 0 ? data : base + (needsSeparator ? '\n' : '') + data;
    await this.repo.updateContent(entity.id, next);
  }

  async update(
    nodeId: string,
    scope: MemoryScope,
    threadId: string | undefined,
    path: string,
    oldStr: string,
    newStr: string,
  ): Promise<number> {
    if (typeof oldStr !== 'string' || typeof newStr !== 'string') throw new Error('update expects string args');
    const filter = this.buildFilter(nodeId, scope, threadId);
    const norm = this.normalizePath(path);
    const segments = this.getSegments(norm);
    const entity = await this.repo.resolvePath(filter, segments);
    if (!entity) {
      throw new Error('ENOENT: document not found');
    }
    if (oldStr.length === 0) return 0;
    const value = entity.content ?? '';
    const parts = value.split(oldStr);
    const count = parts.length - 1;
    if (count === 0) return 0;
    const next = parts.join(newStr);
    await this.repo.updateContent(entity.id, next);
    return count;
  }

  async delete(nodeId: string, scope: MemoryScope, threadId: string | undefined, rawPath: string | undefined): Promise<DeleteResult> {
    const filter = this.buildFilter(nodeId, scope, threadId);
    const norm = this.normalizePath(rawPath ?? '/', { allowRoot: true });
    if (norm === '/') {
      return this.repo.deleteSubtree(filter, null);
    }
    const segments = this.getSegments(norm);
    if (segments.length === 0) return { removed: 0 };
    const entity = await this.repo.resolvePath(filter, segments);
    if (!entity) return { removed: 0 };
    return this.repo.deleteSubtree(filter, entity.id);
  }

  private buildPathMap(entities: MemoryEntity[]): Map<string, string> {
    const byId = new Map(entities.map((entity) => [entity.id, entity] as const));
    const cache = new Map<string, string>();

    const resolvePath = (entity: MemoryEntity): string => {
      const cached = cache.get(entity.id);
      if (cached) return cached;
      const parent = entity.parentId ? byId.get(entity.parentId) : undefined;
      const parentPath = parent ? resolvePath(parent) : '';
      const path = parentPath ? `${parentPath}/${entity.name}` : `/${entity.name}`;
      cache.set(entity.id, path);
      return path;
    };

    for (const entity of entities) resolvePath(entity);
    return cache;
  }

  async getAll(nodeId: string, scope: MemoryScope, threadId: string | undefined): Promise<Record<string, string>> {
    const filter = this.buildFilter(nodeId, scope, threadId);
    const entities = await this.repo.listAll(filter);
    if (entities.length === 0) return {};
    const paths = this.buildPathMap(entities);
    const out: Record<string, string> = {};
    for (const entity of entities) {
      if (entity.content != null) {
        out[paths.get(entity.id)!] = entity.content;
      }
    }
    return out;
  }

  async dump(
    nodeId: string,
    scope: MemoryScope,
    threadId: string | undefined,
  ): Promise<{ nodeId: string; scope: MemoryScope; threadId?: string; data: Record<string, string>; dirs: Record<string, true> }> {
    const filter = this.buildFilter(nodeId, scope, threadId);
    const entities = await this.repo.listAll(filter);
    const data: Record<string, string> = {};
    const dirs: Record<string, true> = {};
    if (entities.length === 0) {
      return { nodeId, scope, threadId: threadId ?? undefined, data, dirs };
    }
    const paths = this.buildPathMap(entities);
    const childCounts = new Map<string, number>();
    for (const entity of entities) {
      if (entity.parentId) {
        childCounts.set(entity.parentId, (childCounts.get(entity.parentId) ?? 0) + 1);
      }
    }
    for (const entity of entities) {
      const path = paths.get(entity.id)!;
      if (entity.content != null) data[path] = entity.content;
      if (childCounts.has(entity.id)) dirs[path] = true;
    }
    return { nodeId, scope, threadId: threadId ?? undefined, data, dirs };
  }

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
