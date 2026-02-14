import { describe, expect, it, vi } from 'vitest';
import { ContainerAdminService } from '../src/infra/container/containerAdmin.service';
import type { DockerClient } from '../src/infra/container/dockerClient.token';
import type { ContainerRegistry } from '../src/infra/container/container.registry';

describe('ContainerAdminService', () => {
  it('stops, removes, and marks containers as deleted', async () => {
    const docker: Partial<DockerClient> = {
      stopContainer: vi.fn().mockResolvedValue(undefined),
      removeContainer: vi.fn().mockResolvedValue(undefined),
    };
    const registry: Partial<ContainerRegistry> = {
      markDeleted: vi.fn().mockResolvedValue(undefined),
    };

    const service = new ContainerAdminService(docker as DockerClient, registry as ContainerRegistry);
    await service.deleteContainer('cid-123');

    expect(docker.stopContainer).toHaveBeenCalledWith('cid-123', 10);
    expect(docker.removeContainer).toHaveBeenCalledWith('cid-123', { force: true, removeVolumes: true });
    expect(registry.markDeleted).toHaveBeenCalledWith('cid-123', 'manual_delete');
  });

  it('ignores benign not-found errors when stopping/removing', async () => {
    const docker: Partial<DockerClient> = {
      stopContainer: vi.fn().mockRejectedValueOnce({ statusCode: 404 }),
      removeContainer: vi.fn().mockRejectedValueOnce({ statusCode: 409 }),
    };
    const registry: Partial<ContainerRegistry> = {
      markDeleted: vi.fn().mockResolvedValue(undefined),
    };

    const service = new ContainerAdminService(docker as DockerClient, registry as ContainerRegistry);
    await service.deleteContainer('cid-missing');

    expect(docker.stopContainer).toHaveBeenCalledWith('cid-missing', 10);
    expect(docker.removeContainer).toHaveBeenCalledWith('cid-missing', { force: true, removeVolumes: true });
    expect(registry.markDeleted).toHaveBeenCalledWith('cid-missing', 'manual_delete');
  });
});
