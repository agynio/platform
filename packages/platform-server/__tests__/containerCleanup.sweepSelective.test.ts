import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ContainerCleanupService } from '../src/infra/container/containerCleanup.job';

const loggerStub = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};

describe('ContainerCleanupService.sweepSelective', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const makeService = () => {
    const registry = {
      listByThread: vi.fn(async () => [] as Array<{ containerId: string; status: 'running' }>),
      markStopped: vi.fn(async () => undefined),
      recordTerminationFailure: vi.fn(async () => undefined),
    };
    const containers = {
      findContainersByLabels: vi.fn(async () => [] as Array<{ id: string }>),
      stopContainer: vi.fn(async () => undefined),
      removeContainer: vi.fn(async () => undefined),
    };
    const service = new ContainerCleanupService(registry as any, containers as any, loggerStub as any);
    return { service, registry, containers };
  };

  it('stops workspace container without manual sidecar cleanup', async () => {
    const { service, registry, containers } = makeService();
    registry.listByThread.mockResolvedValue([{ containerId: 'workspace', status: 'running' }]);

    await service.sweepSelective('thread-1', { graceSeconds: 7, force: true, deleteEphemeral: true });

    expect(containers.findContainersByLabels).not.toHaveBeenCalled();
    expect(containers.stopContainer.mock.calls).toEqual([['workspace', 7]]);
    expect(containers.removeContainer.mock.calls).toEqual([
      ['workspace', { force: true, removeVolumes: true }],
    ]);
    expect(registry.markStopped).toHaveBeenCalledWith('workspace', 'thread_closed');
  });

  it('respects deleteEphemeral=false when removing workspace', async () => {
    const { service, registry, containers } = makeService();
    registry.listByThread.mockResolvedValue([{ containerId: 'workspace', status: 'running' }]);

    await service.sweepSelective('thread-2', { graceSeconds: 5, force: false, deleteEphemeral: false });

    expect(containers.removeContainer.mock.calls).toEqual([
      ['workspace', { force: false, removeVolumes: false }],
    ]);
  });

  it('exits early when no containers registered for thread', async () => {
    const { service, containers } = makeService();
    await service.sweepSelective('thread-empty', { graceSeconds: 5, force: true, deleteEphemeral: true });
    expect(containers.stopContainer).not.toHaveBeenCalled();
  });
});

describe('ContainerCleanupService retention purge', () => {
  const originalRetention = process.env.CONTAINERS_RETENTION_DAYS;

  afterEach(() => {
    if (originalRetention === undefined) delete process.env.CONTAINERS_RETENTION_DAYS;
    else process.env.CONTAINERS_RETENTION_DAYS = originalRetention;
    vi.clearAllMocks();
  });

  const buildService = () => {
    const registry = {
      getExpired: vi.fn(async () => []),
      deleteHistorical: vi.fn(async () => 0),
    };
    const containers = {
      findContainersByLabels: vi.fn(),
      stopContainer: vi.fn(),
      removeContainer: vi.fn(),
    };
    const service = new ContainerCleanupService(registry as any, containers as any, loggerStub as any);
    return { service, registry };
  };

  it('skips retention purge when disabled', async () => {
    process.env.CONTAINERS_RETENTION_DAYS = '0';
    const { service, registry } = buildService();
    await service.sweep(new Date('2025-01-15T00:00:00Z'));
    expect(registry.deleteHistorical).not.toHaveBeenCalled();
  });

  it('purges historical containers when retention is positive', async () => {
    process.env.CONTAINERS_RETENTION_DAYS = '7';
    const { service, registry } = buildService();
    registry.deleteHistorical.mockResolvedValue(3);
    const now = new Date('2025-02-01T12:00:00Z');
    await service.sweep(now);
    expect(registry.deleteHistorical).toHaveBeenCalledTimes(1);
    const cutoff = registry.deleteHistorical.mock.calls[0][0] as Date;
    const expected = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    expect(Math.abs(cutoff.getTime() - expected.getTime())).toBeLessThan(5);
  });
});
