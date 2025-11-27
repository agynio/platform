import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ThreadCleanupCoordinator } from '../src/agents/threadCleanup.coordinator';

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
    findByVolume: vi.fn(async () => [] as Array<{ containerId: string; threadId: string | null; status: 'running' }>),
  };
  const containerService = {
    listContainersByVolume: vi.fn(async () => [] as string[]),
    removeVolume: vi.fn(async (volumeName: string) => {
      record(`volume:${volumeName}`);
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
  };
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

  it('skips workspace volume removal when references remain', async () => {
    const now = new Date();
    prismaStub.thread.findUnique.mockResolvedValue({ id: 'root', parentId: null, status: 'closed', createdAt: now });
    prismaStub.thread.findMany.mockResolvedValue([]);
    prismaStub.run.findMany.mockResolvedValue([]);

    const { coordinator, containerService, registry, reminders, eventsBus, callOrder } = makeCoordinator();
    registry.listByThread.mockResolvedValue([]);
    registry.findByVolume.mockResolvedValue([{ containerId: 'other', threadId: 'other-thread', status: 'running' }]);
    containerService.listContainersByVolume.mockResolvedValue([]);

    await coordinator.closeThreadWithCascade('root');

    expect(containerService.removeVolume).not.toHaveBeenCalled();
    expect(reminders.cancelThreadReminders).toHaveBeenCalledWith({ threadId: 'root' });
    expect(eventsBus.emitThreadMetrics).toHaveBeenCalledWith({ threadId: 'root' });
    expect(eventsBus.emitThreadMetricsAncestors).toHaveBeenCalledWith({ threadId: 'root' });

    const metricsIndex = callOrder.indexOf('metrics:root');
    expect(metricsIndex).toBeGreaterThan(callOrder.indexOf('reminders:root'));
    expect(callOrder.indexOf('metricsAncestors:root')).toBeGreaterThan(metricsIndex);
  });
});
