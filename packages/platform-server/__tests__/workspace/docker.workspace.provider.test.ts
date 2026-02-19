import { describe, expect, it, vi } from 'vitest';
import type { ContainerHandle } from '@agyn/docker-runner';

import { DockerWorkspaceRuntimeProvider } from '../../src/workspace/providers/docker.workspace.provider';
import type { DockerClient } from '../../src/infra/container/dockerClient.token';
import type { ContainerRegistry } from '../../src/infra/container/container.registry';
import type { WorkspaceKey, WorkspaceSpec } from '../../src/workspace/runtime/workspace.runtime.provider';

describe('DockerWorkspaceRuntimeProvider', () => {
  it('registers workspace containers in the registry when ensuring a new workspace', async () => {
    const dockerClient = createDockerClientStub();
    const registerStart = vi.fn().mockResolvedValue(undefined);
    const registry = { registerStart } as unknown as ContainerRegistry;

    const provider = new DockerWorkspaceRuntimeProvider(dockerClient, registry);

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
