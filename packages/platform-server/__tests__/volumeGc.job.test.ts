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
      workspaceVolume: {
        findMany: vi.fn(async () => [] as Array<{ id: string; threadId: string; volumeName: string; createdAt: Date }>),
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
    prisma.workspaceVolume.findMany.mockResolvedValue([
      { id: 'volume-1', threadId: 'thread-1', volumeName: 'ha_ws_thread-1', createdAt: new Date('2023-12-31T23:00:00Z') },
    ]);

    const now = new Date('2024-01-01T00:00:00Z');
    await service.sweep(now);

    expect(containerService.listContainersByVolume).toHaveBeenCalledWith('ha_ws_thread-1');
    expect(containerService.removeVolume).toHaveBeenCalledWith('ha_ws_thread-1', { force: true });
    expect(prisma.workspaceVolume.updateMany).toHaveBeenCalledWith({
      where: { id: 'volume-1', removedAt: null },
      data: { removedAt: expect.any(Date) },
    });
    const updateArgs = prisma.workspaceVolume.updateMany.mock.calls[0][0];
    expect(updateArgs.data.removedAt.toISOString()).toBe(now.toISOString());
  });

  it('skips volumes still referenced by containers', async () => {
    const { service, prisma, containerService } = makeService();
    prisma.workspaceVolume.findMany.mockResolvedValue([
      { id: 'volume-2', threadId: 'thread-2', volumeName: 'ha_ws_thread-2', createdAt: new Date('2023-12-31T23:10:00Z') },
    ]);
    containerService.listContainersByVolume.mockResolvedValue(['cid-123']);

    await service.sweep(new Date('2024-01-01T00:00:00Z'));

    expect(containerService.removeVolume).not.toHaveBeenCalled();
    expect(prisma.workspaceVolume.updateMany).not.toHaveBeenCalled();
  });

  it('marks volumes as removed when runner reports not_found', async () => {
    const { service, prisma, containerService } = makeService();
    prisma.workspaceVolume.findMany.mockResolvedValue([
      { id: 'volume-3', threadId: 'thread-3', volumeName: 'ha_ws_thread-3', createdAt: new Date('2023-12-31T23:20:00Z') },
    ]);
    containerService.removeVolume.mockResolvedValueOnce('not_found');
    const now = new Date('2024-01-01T12:00:00Z');

    await service.sweep(now);

    expect(containerService.removeVolume).toHaveBeenCalledTimes(1);
    expect(prisma.workspaceVolume.updateMany).toHaveBeenCalledWith({
      where: { id: 'volume-3', removedAt: null },
      data: { removedAt: expect.any(Date) },
    });
    const updateArgs = prisma.workspaceVolume.updateMany.mock.calls[0][0];
    expect(updateArgs.data.removedAt.toISOString()).toBe(now.toISOString());
  });

  it('does not mark volumes when removal fails with non-404 error', async () => {
    const { service, prisma, containerService } = makeService();
    prisma.workspaceVolume.findMany.mockResolvedValue([
      { id: 'volume-err', threadId: 'thread-err', volumeName: 'ha_ws_thread-err', createdAt: new Date('2023-12-31T23:30:00Z') },
    ]);
    containerService.removeVolume.mockRejectedValueOnce(new Error('boom'));

    await service.sweep(new Date('2024-01-01T00:00:00Z'));

    expect(prisma.workspaceVolume.updateMany).not.toHaveBeenCalled();
  });

  it('honors VOLUME_GC_MAX_PER_SWEEP limit', async () => {
    process.env.VOLUME_GC_MAX_PER_SWEEP = '1';
    const { service, prisma } = makeService();
    prisma.workspaceVolume.findMany.mockResolvedValue([
      { id: 'volume-a', threadId: 'thread-a', volumeName: 'ha_ws_thread-a', createdAt: new Date('2023-12-31T23:40:00Z') },
      { id: 'volume-b', threadId: 'thread-b', volumeName: 'ha_ws_thread-b', createdAt: new Date('2023-12-31T23:35:00Z') },
    ]);

    await service.sweep(new Date('2024-01-01T00:00:00Z'));

    expect(prisma.workspaceVolume.findMany).toHaveBeenCalledWith({
      where: { removedAt: null, thread: { status: 'closed' } },
      select: { id: true, threadId: true, volumeName: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 1,
    });
  });

  it('applies cooldown between attempts for the same thread', async () => {
    const { service, prisma, containerService } = makeService();
    const candidate = {
      id: 'volume-c',
      threadId: 'thread-c',
      volumeName: 'ha_ws_thread-c',
      createdAt: new Date('2023-12-31T23:50:00Z'),
    };
    prisma.workspaceVolume.findMany.mockResolvedValue([candidate]);

    const firstTime = new Date('2024-01-01T00:00:00Z');
    await service.sweep(firstTime);

    prisma.workspaceVolume.findMany.mockResolvedValue([candidate]);
    const secondTime = new Date(firstTime.getTime() + 1_000);
    await service.sweep(secondTime);

    expect(containerService.listContainersByVolume).toHaveBeenCalledTimes(1);
    expect(containerService.removeVolume).toHaveBeenCalledTimes(1);
  });

  it('skips sweep entirely when docker runner is down', async () => {
    const { service, containerService, prisma } = makeService({ runnerStatus: 'down' });

    await service.sweep(new Date('2024-01-01T00:00:00Z'));

    expect(containerService.listContainersByVolume).not.toHaveBeenCalled();
    expect(prisma.workspaceVolume.updateMany).not.toHaveBeenCalled();
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
