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

  it('cleans DinD sidecars before workspace containers', async () => {
    const { service, registry, containers } = makeService();
    registry.listByThread.mockResolvedValue([{ containerId: 'workspace', status: 'running' }]);
    containers.findContainersByLabels.mockImplementation(async (labels: Record<string, string>) => {
      if (labels['hautech.ai/parent_cid'] === 'workspace') return [{ id: 'sidecar' }];
      return [];
    });

    await service.sweepSelective('thread-1', { graceSeconds: 7, force: true, deleteEphemeral: true });

    expect(containers.stopContainer.mock.calls.map(([id]) => id)).toEqual(['sidecar', 'workspace']);
    expect(containers.removeContainer.mock.calls).toEqual([
      ['sidecar', { force: true, removeVolumes: true }],
      ['workspace', { force: true, removeVolumes: false }],
    ]);
    expect(registry.markStopped).toHaveBeenCalledWith('workspace', 'thread_closed');
  });

  it('respects deleteEphemeral=false by keeping sidecar volumes', async () => {
    const { service, registry, containers } = makeService();
    registry.listByThread.mockResolvedValue([{ containerId: 'workspace', status: 'running' }]);
    containers.findContainersByLabels.mockResolvedValue([{ id: 'sidecar' }]);

    await service.sweepSelective('thread-2', { graceSeconds: 5, force: false, deleteEphemeral: false });

    expect(containers.removeContainer.mock.calls).toEqual([
      ['sidecar', { force: true, removeVolumes: false }],
      ['workspace', { force: false, removeVolumes: false }],
    ]);
  });

  it('exits early when no containers registered for thread', async () => {
    const { service, containers } = makeService();
    await service.sweepSelective('thread-empty', { graceSeconds: 5, force: true, deleteEphemeral: true });
    expect(containers.stopContainer).not.toHaveBeenCalled();
  });
});
