import { describe, expect, it, vi } from 'vitest';
import { MemoryService } from '../src/nodes/memory/memory.service';
import type { MemoryEntitiesRepositoryPort } from '../src/nodes/memory/memory.repository';
import type { MemoryScope } from '../src/nodes/memory/memory.types';

type RepoRow = { nodeId: string; threadId: string | null };

const createRepoStub = (rows: RepoRow[]): MemoryEntitiesRepositoryPort => ({
  resolvePath: vi.fn(),
  ensurePath: vi.fn(),
  listChildren: vi.fn(),
  deleteSubtree: vi.fn(),
  entityHasChildren: vi.fn(),
  updateContent: vi.fn(),
  listAll: vi.fn(),
  listDistinctNodeThreads: vi.fn().mockResolvedValue(rows),
});

const baseGraph = {
  name: 'main',
  version: 1,
  updatedAt: '2024-01-01T00:00:00.000Z',
  edges: [],
};

describe('MemoryService listDocs aggregation', () => {
  it('returns graph memory nodes when persistence is empty', async () => {
    const repo = createRepoStub([]);
    const graph = {
      get: vi.fn().mockResolvedValue({
        ...baseGraph,
        nodes: [
          { id: 'mem-global', template: 'memory', config: { scope: 'global' as MemoryScope } },
          { id: 'mem-threaded', template: 'memory', config: { scope: 'perThread' as MemoryScope } },
          { id: 'not-memory', template: 'other' },
        ],
      }),
    };

    const svc = new MemoryService(repo, graph as any);
    const result = await svc.listDocs();

    expect(result).toEqual([
      { nodeId: 'mem-global', scope: 'global' },
      { nodeId: 'mem-threaded', scope: 'perThread' },
    ]);
    expect(graph.get).toHaveBeenCalledWith('main');
  });

  it('augments perThread nodes with persisted thread IDs and filters stale rows', async () => {
    const repo = createRepoStub([
      { nodeId: 'mem-threaded', threadId: ' thread-2 ' },
      { nodeId: 'mem-threaded', threadId: 'thread-1' },
      { nodeId: 'mem-threaded', threadId: 'thread-1' },
      { nodeId: 'mem-threaded', threadId: '' },
      { nodeId: 'mem-global', threadId: null },
      { nodeId: 'stale-node', threadId: 'orphan' },
    ]);
    const graph = {
      get: vi.fn().mockResolvedValue({
        ...baseGraph,
        nodes: [
          { id: 'mem-global', template: 'memory', config: { scope: 'global' as MemoryScope } },
          { id: 'mem-threaded', template: 'memory', config: { scope: 'perThread' as MemoryScope } },
        ],
      }),
    };

    const svc = new MemoryService(repo, graph as any);
    const result = await svc.listDocs();

    expect(result).toEqual([
      { nodeId: 'mem-global', scope: 'global' },
      { nodeId: 'mem-threaded', scope: 'perThread' },
      { nodeId: 'mem-threaded', scope: 'perThread', threadId: 'thread-1' },
      { nodeId: 'mem-threaded', scope: 'perThread', threadId: 'thread-2' },
    ]);
    expect(graph.get).toHaveBeenCalledWith('main');
  });

  it('falls back to persistence when graph fails', async () => {
    const repo = createRepoStub([
      { nodeId: 'persist-global', threadId: null },
      { nodeId: 'persist-thread', threadId: ' t1 ' },
    ]);
    const graph = { get: vi.fn().mockRejectedValue(new Error('boom')) };

    const svc = new MemoryService(repo, graph as any);
    const result = await svc.listDocs();

    expect(result).toEqual([
      { nodeId: 'persist-global', scope: 'global' },
      { nodeId: 'persist-thread', scope: 'perThread' },
      { nodeId: 'persist-thread', scope: 'perThread', threadId: 't1' },
    ]);
  });
});
