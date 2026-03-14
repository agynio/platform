import { describe, expect, it, vi } from 'vitest';

import { createDockerClientStub } from '../helpers/dockerClient.stub';
import { ContainerHandle } from '../../src/infra/container/container.handle';
import { DockerWorkspaceRuntimeProvider } from '../../src/workspace/providers/docker.workspace.provider';
import type { ContainerRegistry } from '../../src/infra/container/container.registry';
import type { WorkspaceKey, WorkspaceSpec } from '../../src/workspace/runtime/workspace.runtime.provider';

describe('DockerWorkspaceRuntimeProvider', () => {
  it('registers workspace containers in the registry when ensuring a new workspace', async () => {
    const dockerClient = createDockerClientStub();
    const handle = new ContainerHandle(dockerClient, 'cid-123');
    dockerClient.start.mockResolvedValue(handle);
    const registerStart = vi.fn().mockResolvedValue(undefined);
    const registry = { registerStart } as unknown as ContainerRegistry;

    const provider = new DockerWorkspaceRuntimeProvider(dockerClient, registry);

    const key: WorkspaceKey = { threadId: 'thread-abc', role: 'workspace', nodeId: 'node-xyz' };
    const spec: WorkspaceSpec = { image: 'node:20-bullseye', persistentVolume: { mountPath: '/workspace' } };

    dockerClient.inspectContainer.mockResolvedValue({
      Id: 'cid-123',
      Name: '/workspace-cid',
      Config: {
        Labels: {
          'hautech.ai/thread_id': key.threadId,
          'hautech.ai/role': key.role,
        },
        Image: spec.image,
      },
      Mounts: [],
      State: { Status: 'running' },
    });

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
