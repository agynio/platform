import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ThreadCleanupCoordinator } from '../src/agents/threadCleanup.coordinator';

const loggerStub = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};

const prismaStub = {
  thread: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
  },
  run: {
    findMany: vi.fn(),
  },
};

const makeCoordinator = () => {
  const persistence = {
    updateThread: vi.fn(async () => ({ previousStatus: 'open', status: 'closed' })),
  };
  const termination = { terminateByThread: vi.fn(async () => undefined) };
  const cleanup = { sweepSelective: vi.fn(async () => undefined) };
  const runSignals = { activateTerminate: vi.fn() };
  const registry = {
    listByThread: vi.fn(async () => [] as Array<{ containerId: string; status: 'running' }>),
    findByVolume: vi.fn(async () => [] as Array<{ containerId: string; threadId: string | null; status: 'running' }>),
  };
  const containerService = {
    listContainersByVolume: vi.fn(async () => [] as string[]),
    removeVolume: vi.fn(async () => undefined),
  };
  const prismaService = { getClient: () => prismaStub };

  const coordinator = new ThreadCleanupCoordinator(
    persistence as any,
    termination as any,
    cleanup as any,
    runSignals as any,
    loggerStub as any,
    prismaService as any,
    registry as any,
    containerService as any,
  );

  return { coordinator, persistence, termination, cleanup, runSignals, registry, containerService };
};

describe('ThreadCleanupCoordinator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaStub.thread.findUnique.mockReset();
    prismaStub.thread.findMany.mockReset();
    prismaStub.run.findMany.mockReset();
  });

  it('cascades leaf-first, closes descendants, and terminates runs', async () => {
    const now = new Date();
    const threads = new Map([
      ['root', { id: 'root', parentId: null, status: 'closed', createdAt: now }],
      ['child', { id: 'child', parentId: 'root', status: 'open', createdAt: now }],
      ['leaf', { id: 'leaf', parentId: 'child', status: 'open', createdAt: now }],
    ]);
    prismaStub.thread.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => threads.get(where.id));
    prismaStub.thread.findMany.mockImplementation(async ({ where }: { where: { parentId: { in: string[] } } }) => {
      const parents = where.parentId?.in ?? [];
      return Array.from(threads.values()).filter((node) => node.parentId && parents.includes(node.parentId));
    });
    prismaStub.run.findMany.mockImplementation(async ({ where }: { where: { threadId: string } }) => {
      if (where.threadId === 'leaf') {
        return [{ id: 'run-leaf', threadId: 'leaf', status: 'running' }];
      }
      return [];
    });

    const { coordinator, persistence, termination, cleanup, runSignals, registry, containerService } = makeCoordinator();

    registry.listByThread.mockImplementation(async (threadId: string) => [{ containerId: `${threadId}-c`, status: 'running' }]);
    registry.findByVolume.mockResolvedValue([]);
    containerService.listContainersByVolume.mockResolvedValue([]);

    await coordinator.closeThreadWithCascade('root');

    expect(persistence.updateThread).toHaveBeenCalledTimes(2);
    expect(persistence.updateThread).toHaveBeenNthCalledWith(1, 'leaf', { status: 'closed' });
    expect(persistence.updateThread).toHaveBeenNthCalledWith(2, 'child', { status: 'closed' });
    expect(runSignals.activateTerminate).toHaveBeenCalledWith('run-leaf');
    expect(termination.terminateByThread.mock.calls.map(([tid]) => tid)).toEqual(['leaf', 'child', 'root']);
    expect(cleanup.sweepSelective.mock.calls).toEqual([
      ['leaf', { graceSeconds: 10, force: true, deleteEphemeral: true }],
      ['child', { graceSeconds: 10, force: true, deleteEphemeral: true }],
      ['root', { graceSeconds: 10, force: true, deleteEphemeral: true }],
    ]);
    expect(containerService.removeVolume.mock.calls).toEqual([
      ['ha_ws_leaf', { force: true }],
      ['ha_ws_child', { force: true }],
      ['ha_ws_root', { force: true }],
    ]);
  });

  it('terminates active runs and proceeds with cleanup', async () => {
    const now = new Date();
    prismaStub.thread.findUnique.mockResolvedValue({ id: 'root', parentId: null, status: 'open', createdAt: now });
    prismaStub.thread.findMany.mockResolvedValue([]);
    prismaStub.run.findMany.mockResolvedValue([{ id: 'run-root', threadId: 'root', status: 'running' }]);

    const { coordinator, persistence, termination, cleanup, runSignals, registry, containerService } = makeCoordinator();
    registry.listByThread.mockResolvedValue([{ containerId: 'root-c', status: 'running' }]);
    registry.findByVolume.mockResolvedValue([]);
    containerService.listContainersByVolume.mockResolvedValue([]);

    await coordinator.closeThreadWithCascade('root');

    expect(persistence.updateThread).toHaveBeenCalledWith('root', { status: 'closed' });
    expect(runSignals.activateTerminate).toHaveBeenCalledWith('run-root');
    expect(termination.terminateByThread).toHaveBeenCalledWith('root');
    expect(cleanup.sweepSelective).toHaveBeenCalledWith('root', {
      graceSeconds: 10,
      force: true,
      deleteEphemeral: true,
    });
    expect(containerService.removeVolume).toHaveBeenCalledWith('ha_ws_root', { force: true });
  });

  it('skips workspace volume removal when references remain', async () => {
    const now = new Date();
    prismaStub.thread.findUnique.mockResolvedValue({ id: 'root', parentId: null, status: 'closed', createdAt: now });
    prismaStub.thread.findMany.mockResolvedValue([]);
    prismaStub.run.findMany.mockResolvedValue([]);

    const { coordinator, containerService, registry } = makeCoordinator();
    registry.listByThread.mockResolvedValue([]);
    registry.findByVolume.mockResolvedValue([{ containerId: 'other', threadId: 'other-thread', status: 'running' }]);
    containerService.listContainersByVolume.mockResolvedValue([]);

    await coordinator.closeThreadWithCascade('root');

    expect(containerService.removeVolume).not.toHaveBeenCalled();
  });
});
