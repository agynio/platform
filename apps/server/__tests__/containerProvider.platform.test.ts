import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ContainerService } from '../src/services/container.service.js';
import { ContainerProviderEntity } from '../src/entities/containerProvider.entity.js';
import { LoggerService } from '../src/services/logger.service.js';

function setupProvider(platform?: string) {
  const logger = new LoggerService();
  const svc = new ContainerService(logger);
  const provider = new ContainerProviderEntity(
    svc,
    { cmd: ['sleep', 'infinity'], workingDir: '/w' },
    (id: string) => ({ tid: id })
  );
  provider.setConfig({ platform });
  return { svc, provider };
}

describe('ContainerProviderEntity platform forwarding and reuse', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('forwards platform to ContainerService.start when set in static config', async () => {
    const { svc, provider } = setupProvider('linux/amd64');
    vi.spyOn(svc, 'findContainerByLabels').mockResolvedValue(undefined as any);
    const startSpy = vi.spyOn(svc, 'start').mockResolvedValue({ id: 'cid', exec: async () => ({ exitCode: 0 }) } as any);
    await provider.provide('t1');
    expect(startSpy).toHaveBeenCalled();
    const arg = startSpy.mock.calls[0][0];
    expect(arg?.platform).toBe('linux/amd64');
  });

  it('does not set platform when absent', async () => {
    const { svc, provider } = setupProvider(undefined);
    vi.spyOn(svc, 'findContainerByLabels').mockResolvedValue(undefined as any);
    const startSpy = vi.spyOn(svc, 'start').mockResolvedValue({ id: 'cid', exec: async () => ({ exitCode: 0 }) } as any);
    await provider.provide('t1');
    const arg = startSpy.mock.calls[0][0];
    expect(arg?.platform).toBeUndefined();
  });

  it('skips reuse when existing container platform mismatches', async () => {
    const { svc, provider } = setupProvider('linux/arm64');
    const existing = { id: 'existing' } as any;
    vi.spyOn(svc, 'findContainerByLabels').mockResolvedValue(existing);
    vi.spyOn(svc, 'getContainerPlatform').mockResolvedValue('linux/amd64');
    const startSpy = vi.spyOn(svc, 'start').mockResolvedValue({ id: 'newcid', exec: async () => ({ exitCode: 0 }) } as any);
    await provider.provide('t2');
    expect(startSpy).toHaveBeenCalled();
  });

  it('reuses when platforms match', async () => {
    const { svc, provider } = setupProvider('linux/arm64');
    const existing = { id: 'existing' } as any;
    vi.spyOn(svc, 'findContainerByLabels').mockResolvedValue(existing);
    vi.spyOn(svc, 'getContainerPlatform').mockResolvedValue('linux/arm64');
    const startSpy = vi.spyOn(svc, 'start').mockResolvedValue({ id: 'newcid', exec: async () => ({ exitCode: 0 }) } as any);
    const reused = await provider.provide('t3');
    expect(startSpy).not.toHaveBeenCalled();
    expect(reused?.id).toBe('existing');
  });
});
