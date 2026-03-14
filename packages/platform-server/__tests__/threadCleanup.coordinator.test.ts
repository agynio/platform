import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ThreadCleanupCoordinator } from '../src/agents/threadCleanup.coordinator';

const prismaStub = {
  thread: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    updateMany: vi.fn(async () => ({ count: 0 })),
  },
  run: {
    findMany: vi.fn(),
  },
  workspaceVolume: {
    findFirst: vi.fn(),
    updateMany: vi.fn(async () => ({ count: 0 })),
  },
};

const makeCoordinator = () => {
  const callOrder: string[] = [];
  const record = (label: string) => {
    callOrder.push(label);
  };

  const persistence = {
    updateThread: vi.fn(async () => ({ previousStatus: 'open', status: 'closed' })),
  };
  const termination = {
    terminateByThread: vi.fn(async (threadId: string) => {
      record(`terminate:${threadId}`);
    }),
  };
  const cleanup = {
    sweepSelective: vi.fn(async (threadId: string) => {
      record(`sweep:${threadId}`);
    }),
  };
  const runSignals = {
    activateTerminate: vi.fn((runId: string) => {
      record(`runs:${runId}`);
    }),
  };
  const registry = {
    listByThread: vi.fn(async () => [] as Array<{ containerId: string; status: 'running' }>),
    findByVolume: vi.fn(
      async () =>
        [] as Array<{ containerId: string; threadId: string | null; status: 'running' | 'terminating' | 'stopped' }>,
    ),
    markStopped: vi.fn(async () => undefined),
  };
  const containerService = {
    listContainersByVolume: vi.fn(async () => [] as string[]),
    removeVolume: vi.fn(async (volumeName: string) => {
      record(`volume:${volumeName}`);
      return 'removed' as const;
    }),
  };
  const prismaService = { getClient: () => prismaStub };
  const reminders = {
    cancelThreadReminders: vi.fn(async ({ threadId }: { threadId: string }) => {
      record(`reminders:${threadId}`);
      return { cancelledDb: 0, clearedRuntime: 0 };
    }),
  };
  const eventsBus = {
    emitThreadMetrics: vi.fn((payload: { threadId: string }) => {
      record(`metrics:${payload.threadId}`);
    }),
    emitThreadMetricsAncestors: vi.fn((payload: { threadId: string }) => {
      record(`metricsAncestors:${payload.threadId}`);
    }),
  };

  const coordinator = new ThreadCleanupCoordinator(
    persistence as any,
    termination as any,
    cleanup as any,
    runSignals as any,
    prismaService as any,
    registry as any,
    containerService as any,
    reminders as any,
    eventsBus as any,
  );

  const logger = (coordinator as unknown as {
    logger: {
      log: (...args: unknown[]) => void;
      warn: (...args: unknown[]) => void;
      error: (...args: unknown[]) => void;
      debug: (...args: unknown[]) => void;
    };
  }).logger;
  vi.spyOn(logger, 'log').mockImplementation(() => undefined);
  vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
  vi.spyOn(logger, 'error').mockImplementation(() => undefined);
  vi.spyOn(logger, 'debug').mockImplementation(() => undefined);

  return {
    coordinator,
    persistence,
    termination,
    cleanup,
    runSignals,
    registry,
    containerService,
    reminders,
    eventsBus,
    callOrder,
    logger,
  };
};

describe('ThreadCleanupCoordinator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaStub.thread.findUnique.mockReset();
    prismaStub.thread.findMany.mockReset();
    prismaStub.thread.updateMany.mockReset();
    prismaStub.run.findMany.mockReset();
    prismaStub.workspaceVolume.findFirst.mockReset();
    prismaStub.workspaceVolume.updateMany.mockReset();
    prismaStub.workspaceVolume.findFirst.mockImplementation(async ({ where }: { where?: { threadId?: string } }) => {
      const threadId = where?.threadId;
      if (!threadId) return undefined;
      return { id: `volume-${threadId}`, volumeName: `ha_ws_${threadId}` };
    });
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

    const {
      coordinator,
      persistence,
      termination,
      cleanup,
      runSignals,
      registry,
      containerService,
      reminders,
      eventsBus,
      callOrder,
    } = makeCoordinator();

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
    expect(prismaStub.workspaceVolume.updateMany.mock.calls.map(([args]) => args.where.id)).toEqual([
      'volume-leaf',
      'volume-child',
      'volume-root',
    ]);
    for (const [args] of prismaStub.workspaceVolume.updateMany.mock.calls) {
      expect(args.where.removedAt).toBeNull();
      expect(args.data.removedAt).toBeInstanceOf(Date);
    }
    expect(reminders.cancelThreadReminders.mock.calls.map(([args]) => args)).toEqual([
      { threadId: 'leaf' },
      { threadId: 'child' },
      { threadId: 'root' },
    ]);
    expect(eventsBus.emitThreadMetrics.mock.calls.map(([payload]) => payload)).toEqual([
      { threadId: 'leaf' },
      { threadId: 'child' },
      { threadId: 'root' },
    ]);
    expect(eventsBus.emitThreadMetricsAncestors.mock.calls.map(([payload]) => payload)).toEqual([
      { threadId: 'leaf' },
      { threadId: 'child' },
      { threadId: 'root' },
    ]);

    const orderFor = (threadId: string) => ({
      reminders: callOrder.indexOf(`reminders:${threadId}`),
      runs: callOrder.findIndex((label) => label === `runs:run-${threadId}`),
      terminate: callOrder.indexOf(`terminate:${threadId}`),
      sweep: callOrder.indexOf(`sweep:${threadId}`),
      volume: callOrder.indexOf(`volume:ha_ws_${threadId}`),
      metrics: callOrder.indexOf(`metrics:${threadId}`),
      metricsAncestors: callOrder.indexOf(`metricsAncestors:${threadId}`),
    });

    const leafOrder = orderFor('leaf');
    expect(leafOrder.reminders).toBeGreaterThanOrEqual(0);
    expect(leafOrder.terminate).toBeGreaterThan(leafOrder.reminders);
    expect(leafOrder.sweep).toBeGreaterThan(leafOrder.terminate);
    expect(leafOrder.volume).toBeGreaterThan(leafOrder.sweep);
    expect(leafOrder.metrics).toBeGreaterThan(leafOrder.volume);
    expect(leafOrder.metricsAncestors).toBeGreaterThan(leafOrder.metrics);
    const leafRunIndex = callOrder.indexOf('runs:run-leaf');
    expect(leafRunIndex).toBeGreaterThan(leafOrder.reminders);
    expect(leafRunIndex).toBeLessThan(leafOrder.terminate);

    const childOrder = orderFor('child');
    expect(childOrder.reminders).toBeGreaterThanOrEqual(0);
    expect(childOrder.terminate).toBeGreaterThan(childOrder.reminders);
    expect(childOrder.sweep).toBeGreaterThan(childOrder.terminate);
    expect(childOrder.volume).toBeGreaterThan(childOrder.sweep);
    expect(childOrder.metrics).toBeGreaterThan(childOrder.volume);
    expect(childOrder.metricsAncestors).toBeGreaterThan(childOrder.metrics);

    const rootOrder = orderFor('root');
    expect(rootOrder.reminders).toBeGreaterThanOrEqual(0);
    expect(rootOrder.terminate).toBeGreaterThan(rootOrder.reminders);
    expect(rootOrder.sweep).toBeGreaterThan(rootOrder.terminate);
    expect(rootOrder.volume).toBeGreaterThan(rootOrder.sweep);
    expect(rootOrder.metrics).toBeGreaterThan(rootOrder.volume);
    expect(rootOrder.metricsAncestors).toBeGreaterThan(rootOrder.metrics);
  });

  it('terminates active runs and proceeds with cleanup', async () => {
    const now = new Date();
    prismaStub.thread.findUnique.mockResolvedValue({ id: 'root', parentId: null, status: 'open', createdAt: now });
    prismaStub.thread.findMany.mockResolvedValue([]);
    prismaStub.run.findMany.mockResolvedValue([{ id: 'run-root', threadId: 'root', status: 'running' }]);

    const {
      coordinator,
      persistence,
      termination,
      cleanup,
      runSignals,
      registry,
      containerService,
      reminders,
      eventsBus,
      callOrder,
    } = makeCoordinator();
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
    expect(prismaStub.workspaceVolume.updateMany).toHaveBeenCalledWith({
      where: { id: 'volume-root', removedAt: null },
      data: { removedAt: expect.any(Date) },
    });
    const updateArgs = prismaStub.workspaceVolume.updateMany.mock.calls[0][0];
    expect(updateArgs.data.removedAt).toBeInstanceOf(Date);
    expect(reminders.cancelThreadReminders).toHaveBeenCalledWith({ threadId: 'root' });
    expect(eventsBus.emitThreadMetrics).toHaveBeenCalledWith({ threadId: 'root' });
    expect(eventsBus.emitThreadMetricsAncestors).toHaveBeenCalledWith({ threadId: 'root' });

    const orderForRoot = (label: string) => callOrder.indexOf(`${label}:root`);
    expect(callOrder.indexOf('reminders:root')).toBeGreaterThanOrEqual(0);
    expect(orderForRoot('terminate')).toBeGreaterThan(callOrder.indexOf('reminders:root'));
    expect(orderForRoot('sweep')).toBeGreaterThan(orderForRoot('terminate'));
    expect(callOrder.indexOf('volume:ha_ws_root')).toBeGreaterThan(orderForRoot('sweep'));
    expect(callOrder.indexOf('metrics:root')).toBeGreaterThan(callOrder.indexOf('volume:ha_ws_root'));
    expect(callOrder.indexOf('metricsAncestors:root')).toBeGreaterThan(callOrder.indexOf('metrics:root'));
  });

  it('skips workspace volume removal when Docker reports references', async () => {
    const now = new Date();
    prismaStub.thread.findUnique.mockResolvedValue({ id: 'root', parentId: null, status: 'closed', createdAt: now });
    prismaStub.thread.findMany.mockResolvedValue([]);
    prismaStub.run.findMany.mockResolvedValue([]);

    const { coordinator, containerService, registry, reminders, eventsBus, callOrder } = makeCoordinator();
    registry.listByThread.mockResolvedValue([]);
    registry.findByVolume.mockResolvedValue([]);
    containerService.listContainersByVolume.mockResolvedValue(['docker-c1']);

    await coordinator.closeThreadWithCascade('root');

    expect(containerService.removeVolume).not.toHaveBeenCalled();
    expect(registry.markStopped).not.toHaveBeenCalled();
    expect(prismaStub.workspaceVolume.updateMany).not.toHaveBeenCalled();
    expect(reminders.cancelThreadReminders).toHaveBeenCalledWith({ threadId: 'root' });
    expect(eventsBus.emitThreadMetrics).toHaveBeenCalledWith({ threadId: 'root' });
    expect(eventsBus.emitThreadMetricsAncestors).toHaveBeenCalledWith({ threadId: 'root' });

    const metricsIndex = callOrder.indexOf('metrics:root');
    expect(metricsIndex).toBeGreaterThan(callOrder.indexOf('reminders:root'));
    expect(callOrder.indexOf('metricsAncestors:root')).toBeGreaterThan(metricsIndex);
  });

  it('removes workspace volume when registry references belong to closing thread', async () => {
    const now = new Date();
    prismaStub.thread.findUnique.mockResolvedValue({ id: 'root', parentId: null, status: 'closed', createdAt: now });
    prismaStub.thread.findMany.mockResolvedValue([]);
    prismaStub.run.findMany.mockResolvedValue([]);

    const { coordinator, containerService, registry, logger } = makeCoordinator();
    registry.listByThread.mockResolvedValue([]);
    registry.findByVolume.mockResolvedValue([
      { containerId: 'root-c1', threadId: 'root', status: 'terminating' },
      { containerId: 'root-c2', threadId: 'root', status: 'stopped' },
    ]);
    containerService.listContainersByVolume.mockResolvedValue([]);

    await coordinator.closeThreadWithCascade('root');

    expect(containerService.removeVolume).toHaveBeenCalledWith('ha_ws_root', { force: true });
    expect(registry.markStopped).toHaveBeenCalledTimes(1);
    expect(registry.markStopped).toHaveBeenCalledWith('root-c1', 'workspace_volume_removed');
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(prismaStub.workspaceVolume.updateMany).toHaveBeenCalledWith({
      where: { id: 'volume-root', removedAt: null },
      data: { removedAt: expect.any(Date) },
    });
  });

  it('removes workspace volume when registry reports foreign references', async () => {
    const now = new Date();
    prismaStub.thread.findUnique.mockResolvedValue({ id: 'root', parentId: null, status: 'closed', createdAt: now });
    prismaStub.thread.findMany.mockResolvedValue([]);
    prismaStub.run.findMany.mockResolvedValue([]);

    const { coordinator, containerService, registry, logger } = makeCoordinator();
    registry.listByThread.mockResolvedValue([]);
    registry.findByVolume.mockResolvedValue([
      { containerId: 'foreign-c1', threadId: 'other-thread', status: 'running' },
    ]);
    containerService.listContainersByVolume.mockResolvedValue([]);

    await coordinator.closeThreadWithCascade('root');

    expect(containerService.removeVolume).toHaveBeenCalledWith('ha_ws_root', { force: true });
    expect(registry.markStopped).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(prismaStub.workspaceVolume.updateMany).toHaveBeenCalledWith({
      where: { id: 'volume-root', removedAt: null },
      data: { removedAt: expect.any(Date) },
    });
  });

  it('does not warn when registry references are already stopped for the thread', async () => {
    const now = new Date();
    prismaStub.thread.findUnique.mockResolvedValue({ id: 'root', parentId: null, status: 'closed', createdAt: now });
    prismaStub.thread.findMany.mockResolvedValue([]);
    prismaStub.run.findMany.mockResolvedValue([]);

    const { coordinator, containerService, registry, logger } = makeCoordinator();
    registry.listByThread.mockResolvedValue([]);
    registry.findByVolume.mockResolvedValue([
      { containerId: 'root-c1', threadId: 'root', status: 'stopped' },
      { containerId: 'root-c2', threadId: 'root', status: 'stopped' },
    ]);
    containerService.listContainersByVolume.mockResolvedValue([]);

    await coordinator.closeThreadWithCascade('root');

    expect(containerService.removeVolume).toHaveBeenCalledWith('ha_ws_root', { force: true });
    expect(registry.markStopped).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
    expect(prismaStub.workspaceVolume.updateMany).toHaveBeenCalledWith({
      where: { id: 'volume-root', removedAt: null },
      data: { removedAt: expect.any(Date) },
    });
  });

  it('marks workspace volume removal when Docker reports not_found', async () => {
    const now = new Date();
    prismaStub.thread.findUnique.mockResolvedValue({ id: 'root', parentId: null, status: 'closed', createdAt: now });
    prismaStub.thread.findMany.mockResolvedValue([]);
    prismaStub.run.findMany.mockResolvedValue([]);

    const { coordinator, containerService, registry } = makeCoordinator();
    registry.listByThread.mockResolvedValue([]);
    registry.findByVolume.mockResolvedValue([]);
    containerService.listContainersByVolume.mockResolvedValue([]);
    containerService.removeVolume.mockResolvedValueOnce('not_found');

    await coordinator.closeThreadWithCascade('root');

    expect(containerService.removeVolume).toHaveBeenCalledWith('ha_ws_root', { force: true });
    expect(prismaStub.workspaceVolume.updateMany).toHaveBeenCalledWith({
      where: { id: 'volume-root', removedAt: null },
      data: { removedAt: expect.any(Date) },
    });
  });

  it('does not mark workspace volume removal when Docker removal fails with non-404 error', async () => {
    const now = new Date();
    prismaStub.thread.findUnique.mockResolvedValue({ id: 'root', parentId: null, status: 'closed', createdAt: now });
    prismaStub.thread.findMany.mockResolvedValue([]);
    prismaStub.run.findMany.mockResolvedValue([]);

    const { coordinator, containerService, registry, logger } = makeCoordinator();
    registry.listByThread.mockResolvedValue([]);
    registry.findByVolume.mockResolvedValue([]);
    containerService.listContainersByVolume.mockResolvedValue([]);
    const error = Object.assign(new Error('boom'), { statusCode: 500 });
    containerService.removeVolume.mockRejectedValueOnce(error);

    await coordinator.closeThreadWithCascade('root');

    expect(containerService.removeVolume).toHaveBeenCalledWith('ha_ws_root', { force: true });
    expect(prismaStub.workspaceVolume.updateMany).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalled();
  });
});
