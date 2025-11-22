import { describe, expect, it, vi } from 'vitest';
import { MemoryController } from '../src/graph/controllers/memory.controller';

type MemoryRow = { node_id: string; scope: string; thread_id: string | null };

class PrismaStub {
  constructor(private readonly rows: MemoryRow[]) {}
  getClient() {
    return {
      $queryRaw: async (..._args: unknown[]) => this.rows,
    };
  }
}

const baseGraph = {
  name: 'main',
  version: 1,
  updatedAt: '2024-01-01T00:00:00.000Z',
  edges: [],
};

const moduleRefStub = {};

describe('MemoryController listDocs aggregation', () => {
  it('returns graph memory nodes when persistence is empty', async () => {
    const prismaStub = new PrismaStub([]);
    const graphRepoStub = {
      get: vi.fn().mockResolvedValue({
        ...baseGraph,
        nodes: [
          { id: 'mem-global', template: 'memory', config: { scope: 'global' } },
          { id: 'mem-threaded', template: 'memory', config: { scope: 'perThread' } },
          { id: 'not-memory', template: 'other' },
        ],
      }),
    };

    const controller = new MemoryController(moduleRefStub as any, prismaStub as any, graphRepoStub as any);
    const result = await controller.listDocs();

    expect(result).toEqual({
      items: [
        { nodeId: 'mem-global', scope: 'global' },
        { nodeId: 'mem-threaded', scope: 'perThread' },
      ],
    });
    expect(graphRepoStub.get).toHaveBeenCalledWith('main');
  });

  it('augments perThread nodes with persisted thread IDs and filters stale rows', async () => {
    const rows: MemoryRow[] = [
      { node_id: 'mem-threaded', scope: 'perThread', thread_id: ' thread-2 ' },
      { node_id: 'mem-threaded', scope: 'perThread', thread_id: 'thread-1' },
      { node_id: 'mem-threaded', scope: 'perThread', thread_id: 'thread-1' }, // duplicate thread
      { node_id: 'mem-threaded', scope: 'perThread', thread_id: '' }, // empty threadId ignored
      { node_id: 'mem-global', scope: 'global', thread_id: null },
      { node_id: 'stale-node', scope: 'perThread', thread_id: 'orphan' },
    ];
    const prismaStub = new PrismaStub(rows);
    const graphRepoStub = {
      get: vi.fn().mockResolvedValue({
        ...baseGraph,
        nodes: [
          { id: 'mem-global', template: 'memory', config: { scope: 'global' } },
          { id: 'mem-threaded', template: 'memory', config: { scope: 'perThread' } },
        ],
      }),
    };

    const controller = new MemoryController(moduleRefStub as any, prismaStub as any, graphRepoStub as any);
    const result = await controller.listDocs();

    expect(result).toEqual({
      items: [
        { nodeId: 'mem-global', scope: 'global' },
        { nodeId: 'mem-threaded', scope: 'perThread' },
        { nodeId: 'mem-threaded', scope: 'perThread', threadId: 'thread-1' },
        { nodeId: 'mem-threaded', scope: 'perThread', threadId: 'thread-2' },
      ],
    });
    expect(graphRepoStub.get).toHaveBeenCalledWith('main');
  });
});
