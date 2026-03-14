import { describe, expect, it, vi } from 'vitest';
import type { ContainerHandle } from '@agyn/docker-runner';

import { DockerWorkspaceRuntimeProvider } from '../../src/workspace/providers/docker.workspace.provider';
import type { DockerClient } from '../../src/infra/container/dockerClient.token';
import type { ContainerRegistry } from '../../src/infra/container/container.registry';
import type { WorkspaceKey, WorkspaceSpec } from '../../src/workspace/runtime/workspace.runtime.provider';

const createPrismaStub = () => {
  const prismaClient = {
    workspaceVolume: {
      findFirst: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
  };
  return {
    prismaClient,
    prismaService: { getClient: () => prismaClient },
  };
};

describe('DockerWorkspaceRuntimeProvider', () => {
  it('registers workspace containers in the registry when ensuring a new workspace', async () => {
    const dockerClient = createDockerClientStub();
    const registerStart = vi.fn().mockResolvedValue(undefined);
    const registry = { registerStart } as unknown as ContainerRegistry;
    const { prismaClient, prismaService } = createPrismaStub();
    prismaClient.workspaceVolume.findFirst.mockResolvedValueOnce(null);
    prismaClient.workspaceVolume.findFirst.mockResolvedValueOnce(null);
    prismaClient.workspaceVolume.create.mockResolvedValueOnce({ id: 'volume-thread-abc' });

    const provider = new DockerWorkspaceRuntimeProvider(dockerClient, registry, prismaService as any);

    const key: WorkspaceKey = { threadId: 'thread-abc', role: 'workspace', nodeId: 'node-xyz' };
    const spec: WorkspaceSpec = { image: 'node:20-bullseye', persistentVolume: { mountPath: '/workspace' } };

    const result = await provider.ensureWorkspace(key, spec);

    expect(result.workspaceId).toBe('cid-123');
    expect(registerStart).toHaveBeenCalledTimes(1);
    expect(registerStart).toHaveBeenCalledWith(
      expect.objectContaining({
        containerId: 'cid-123',
        threadId: 'thread-abc',
        nodeId: 'node-xyz',
        labels: expect.objectContaining({ 'hautech.ai/thread_id': 'thread-abc', 'hautech.ai/role': 'workspace' }),
      }),
    );
    expect(prismaClient.workspaceVolume.create).toHaveBeenCalledWith({
      data: { threadId: 'thread-abc', volumeName: 'ha_ws_thread-abc' },
    });
  });

  it('reactivates an existing workspace volume record when one is available', async () => {
    const dockerClient = createDockerClientStub();
    const registry = { registerStart: vi.fn().mockResolvedValue(undefined) } as unknown as ContainerRegistry;
    const { prismaClient, prismaService } = createPrismaStub();

    prismaClient.workspaceVolume.findFirst
      .mockResolvedValueOnce(null) // no active volume
      .mockResolvedValueOnce({ id: 'volume-1' });

    const provider = new DockerWorkspaceRuntimeProvider(dockerClient, registry, prismaService as any);

    const key: WorkspaceKey = { threadId: 'thread-reactivate', role: 'workspace' };
    const spec: WorkspaceSpec = { image: 'node:20-bullseye', persistentVolume: { mountPath: '/workspace' } };

    await provider.ensureWorkspace(key, spec);

    expect(prismaClient.workspaceVolume.update).toHaveBeenCalledWith({
      where: { id: 'volume-1' },
      data: { volumeName: 'ha_ws_thread-reactivate', removedAt: null },
    });
    expect(prismaClient.workspaceVolume.create).not.toHaveBeenCalled();
  });

  it('skips volume updates when an active record already matches the volume name', async () => {
    const dockerClient = createDockerClientStub();
    const registry = { registerStart: vi.fn().mockResolvedValue(undefined) } as unknown as ContainerRegistry;
    const { prismaClient, prismaService } = createPrismaStub();

    prismaClient.workspaceVolume.findFirst.mockResolvedValueOnce({ id: 'volume-active', volumeName: 'ha_ws_thread-active' });

    const provider = new DockerWorkspaceRuntimeProvider(dockerClient, registry, prismaService as any);

    const key: WorkspaceKey = { threadId: 'thread-active', role: 'workspace' };
    const spec: WorkspaceSpec = { image: 'node:20-bullseye', persistentVolume: { mountPath: '/workspace' } };

    await provider.ensureWorkspace(key, spec);

    expect(prismaClient.workspaceVolume.update).not.toHaveBeenCalled();
    expect(prismaClient.workspaceVolume.create).not.toHaveBeenCalled();
  });
});

function createDockerClientStub(): DockerClient {
  const handle = { id: 'cid-123', stop: vi.fn(), remove: vi.fn() } as unknown as ContainerHandle;
  return {
    touchLastUsed: vi.fn().mockResolvedValue(undefined),
    ensureImage: vi.fn().mockResolvedValue(undefined),
    start: vi.fn().mockResolvedValue(handle),
    execContainer: vi.fn(),
    openInteractiveExec: vi.fn(),
    streamContainerLogs: vi.fn(),
    resizeExec: vi.fn(),
    stopContainer: vi.fn(),
    removeContainer: vi.fn(),
    getContainerLabels: vi.fn(),
    getContainerNetworks: vi.fn(),
    findContainersByLabels: vi.fn().mockResolvedValue([]),
    listContainersByVolume: vi.fn(),
    removeVolume: vi.fn(),
    findContainerByLabels: vi.fn().mockResolvedValue(undefined),
    putArchive: vi.fn(),
    inspectContainer: vi.fn().mockResolvedValue({
      Id: 'cid-123',
      Name: '/workspace-cid',
      Config: {
        Labels: {
          'hautech.ai/thread_id': 'thread-abc',
          'hautech.ai/role': 'workspace',
        },
        Image: 'node:20-bullseye',
      },
      Mounts: [],
      State: { Status: 'running' },
    }),
    getEventsStream: vi.fn(),
  } as unknown as DockerClient;
}
