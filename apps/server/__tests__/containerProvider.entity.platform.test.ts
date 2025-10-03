import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ContainerProviderEntity } from '../src/entities/containerProvider.entity';
import { ContainerService } from '../src/services/container.service';
import { LoggerService } from '../src/services/logger.service';

function setup() {
  const logger = new LoggerService();
  const svc = new ContainerService(logger);
  const docker: any = svc.getDocker();

  // Mock findContainerByLabels to return a stubbed ContainerEntity-like object
  const foundContainer = {
    id: 'deadbeefcafebabe',
    stop: vi.fn(async () => {}),
    remove: vi.fn(async () => {}),
  } as any;

  // Default mocks
  vi.spyOn(svc, 'findContainerByLabels').mockResolvedValue(undefined);
  vi.spyOn(svc, 'start').mockResolvedValue({ id: 'newcontainerid', stop: vi.fn(), remove: vi.fn(), exec: vi.fn() } as any);

  // Mock docker.inspect to return labels
  docker.getContainer = vi.fn(() => ({
    inspect: vi.fn(async () => ({ Config: { Labels: { 'hautech.ai/platform': 'linux/amd64' } } })),
  }));

  return { svc, docker, foundContainer };
}

describe('ContainerProviderEntity platform forwarding and non-reuse', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('forwards platform to containerService.start when set in static config', async () => {
    const { svc } = setup();
    const provider = new ContainerProviderEntity(svc, { cmd: ['sleep', '1'] }, (id) => ({ 'hautech.ai/thread_id': id }));
    provider.setConfig({ platform: 'linux/arm64' });

    await provider.provide('t1');

    expect(svc.start).toHaveBeenCalled();
    const call = (svc.start as any).mock.calls[0][0];
    expect(call.platform).toBe('linux/arm64');
  });

  it('stops/removes existing container on platform mismatch and creates a new one', async () => {
    const { svc, docker, foundContainer } = setup();
    // First, simulate an existing container present
    (svc.findContainerByLabels as any).mockResolvedValue(foundContainer);
    // Existing container has linux/amd64 (from docker.getContainer().inspect mock above)

    const provider = new ContainerProviderEntity(svc, { cmd: ['sleep', '1'] }, (id) => ({ 'hautech.ai/thread_id': id }));
    provider.setConfig({ platform: 'linux/arm64' });

    await provider.provide('t2');

    // Should have inspected, then stopped+removed, then started new with requested platform
    expect(foundContainer.stop).toHaveBeenCalled();
    expect(foundContainer.remove).toHaveBeenCalled();

    expect(svc.start).toHaveBeenCalled();
    const call = (svc.start as any).mock.calls[0][0];
    expect(call.platform).toBe('linux/arm64');
  });
});
