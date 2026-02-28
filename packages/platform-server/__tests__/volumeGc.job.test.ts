import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { VolumeGcService } from '../src/infra/container/volumeGc.job';
import type { DockerRunnerStatusService } from '../src/infra/container/dockerRunnerStatus.service';
import type { ConfigService } from '../src/core/services/config.service';

const envKeys = [
  'VOLUME_GC_ENABLED',
  'VOLUME_GC_MAX_PER_SWEEP',
  'VOLUME_GC_CONCURRENCY',
  'VOLUME_GC_COOLDOWN_MS',
  'VOLUME_GC_INTERVAL_MS',
  'VOLUME_GC_SWEEP_TIMEOUT_MS',
];

describe('VolumeGcService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of envKeys) delete process.env[key];
  });

  afterEach(() => {
    for (const key of envKeys) delete process.env[key];
  });

  const makeService = (options: { runnerStatus?: 'up' | 'down'; sweepTimeoutMs?: number } = {}) => {
    const prisma = {
      thread: {
        findMany: vi.fn(async () => [] as Array<{ id: string }>),
        updateMany: vi.fn(async () => ({ count: 0 })),
      },
    };
    const prismaService = { getClient: () => prisma };
    const containerService = {
      listContainersByVolume: vi.fn(async () => [] as string[]),
      removeVolume: vi.fn(async () => 'removed' as const),
    };
    const dockerRunnerStatus = {
      getSnapshot: vi.fn(() => ({
        status: options.runnerStatus ?? 'up',
        optional: true,
        baseUrl: 'http://docker-runner',
        consecutiveFailures: 0,
      })),
    } satisfies Partial<DockerRunnerStatusService>;
    const configService = {
      getVolumeGcSweepTimeoutMs: vi.fn(() => options.sweepTimeoutMs ?? 15_000),
    } satisfies Partial<ConfigService>;
    const service = new VolumeGcService(
      prismaService as any,
      containerService as any,
      dockerRunnerStatus as DockerRunnerStatusService,
      configService as ConfigService,
    );
    return { service, prisma, containerService, dockerRunnerStatus };
  };

  it('removes volumes with no live references', async () => {
    const { service, prisma, containerService } = makeService();
    prisma.thread.findMany.mockResolvedValue([{ id: 'thread-1' }]);

    const now = new Date('2024-01-01T00:00:00Z');
    await service.sweep(now);

    expect(containerService.listContainersByVolume).toHaveBeenCalledWith('ha_ws_thread-1');
    expect(containerService.removeVolume).toHaveBeenCalledWith('ha_ws_thread-1', { force: true });
    expect(prisma.thread.updateMany).toHaveBeenCalledWith({
      where: { id: 'thread-1', workspaceVolumeRemovedAt: null },
      data: { workspaceVolumeRemovedAt: expect.any(Date) },
    });
    const updateArgs = prisma.thread.updateMany.mock.calls[0][0];
    expect(updateArgs.data.workspaceVolumeRemovedAt.toISOString()).toBe(now.toISOString());
  });

  it('skips volumes still referenced by containers', async () => {
    const { service, prisma, containerService } = makeService();
    prisma.thread.findMany.mockResolvedValue([{ id: 'thread-2' }]);
    containerService.listContainersByVolume.mockResolvedValue(['cid-123']);

    await service.sweep(new Date('2024-01-01T00:00:00Z'));

    expect(containerService.removeVolume).not.toHaveBeenCalled();
    expect(prisma.thread.updateMany).not.toHaveBeenCalled();
  });

  it('marks volumes as removed when runner reports not_found', async () => {
    const { service, prisma, containerService } = makeService();
    prisma.thread.findMany.mockResolvedValue([{ id: 'thread-3' }]);
    containerService.removeVolume.mockResolvedValueOnce('not_found');
    const now = new Date('2024-01-01T12:00:00Z');

    await service.sweep(now);

    expect(containerService.removeVolume).toHaveBeenCalledTimes(1);
    expect(prisma.thread.updateMany).toHaveBeenCalledWith({
      where: { id: 'thread-3', workspaceVolumeRemovedAt: null },
      data: { workspaceVolumeRemovedAt: expect.any(Date) },
    });
    const updateArgs = prisma.thread.updateMany.mock.calls[0][0];
    expect(updateArgs.data.workspaceVolumeRemovedAt.toISOString()).toBe(now.toISOString());
  });

  it('does not mark volumes when removal fails with non-404 error', async () => {
    const { service, prisma, containerService } = makeService();
    prisma.thread.findMany.mockResolvedValue([{ id: 'thread-err' }]);
    containerService.removeVolume.mockRejectedValueOnce(new Error('boom'));

    await service.sweep(new Date('2024-01-01T00:00:00Z'));

    expect(prisma.thread.updateMany).not.toHaveBeenCalled();
  });

  it('honors VOLUME_GC_MAX_PER_SWEEP limit', async () => {
    process.env.VOLUME_GC_MAX_PER_SWEEP = '1';
    const { service, prisma } = makeService();
    prisma.thread.findMany.mockResolvedValue([{ id: 'thread-a' }, { id: 'thread-b' }]);

    await service.sweep(new Date('2024-01-01T00:00:00Z'));

    expect(prisma.thread.findMany).toHaveBeenCalledWith({
      where: { status: 'closed', workspaceVolumeRemovedAt: null },
      select: { id: true },
      orderBy: { createdAt: 'desc' },
      take: 1,
    });
  });

  it('applies cooldown between attempts for the same thread', async () => {
    const { service, prisma, containerService } = makeService();
    prisma.thread.findMany.mockResolvedValue([{ id: 'thread-c' }]);

    const firstTime = new Date('2024-01-01T00:00:00Z');
    await service.sweep(firstTime);

    prisma.thread.findMany.mockResolvedValue([{ id: 'thread-c' }]);
    const secondTime = new Date(firstTime.getTime() + 1_000);
    await service.sweep(secondTime);

    expect(containerService.listContainersByVolume).toHaveBeenCalledTimes(1);
    expect(containerService.removeVolume).toHaveBeenCalledTimes(1);
  });

  it('skips sweep entirely when docker runner is down', async () => {
    const { service, containerService, prisma } = makeService({ runnerStatus: 'down' });

    await service.sweep(new Date('2024-01-01T00:00:00Z'));

    expect(containerService.listContainersByVolume).not.toHaveBeenCalled();
    expect(prisma.thread.updateMany).not.toHaveBeenCalled();
  });

  it('enforces sweep timeout', async () => {
    vi.useFakeTimers();
    const { service } = makeService({ sweepTimeoutMs: 10 });
    const sweepSpy = vi.spyOn(service, 'sweep').mockImplementation(async () => {
      await new Promise(() => {});
    });

    const resultPromise = (service as unknown as { sweepWithTimeout: () => Promise<boolean> }).sweepWithTimeout();
    await vi.advanceTimersByTimeAsync(15);
    const result = await resultPromise;

    expect(result).toBe(false);
    expect(sweepSpy).toHaveBeenCalledTimes(1);
    sweepSpy.mockRestore();
    vi.useRealTimers();
  });
});
