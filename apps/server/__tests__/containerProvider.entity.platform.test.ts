import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ContainerProviderEntity, ContainerProviderStaticConfigSchema } from '../src/entities/containerProvider.entity';
import { ContainerService } from '../src/services/container.service';
import { ContainerEntity } from '../src/entities/container.entity';
import { PLATFORM_LABEL } from '../src/constants.js';

class MockContainer extends ContainerEntity {
  constructor(id: string, private svc: Partial<ContainerService>) {
    super(svc as any, id);
  }
  override stop = vi.fn(async () => {});
  override remove = vi.fn(async (_force?: boolean) => {});
  override exec = vi.fn(async (_cmd: string | string[]) => ({ stdout: '', stderr: '', exitCode: 0 }));
}

describe('ContainerProviderEntity platform reuse logic', () => {
  let svc: Partial<ContainerService>;
  const idLabels = (id: string) => ({ 'hautech.ai/thread_id': `node__${id}` });

  beforeEach(() => {
    vi.clearAllMocks();
    const startImpl = async (_opts: Parameters<ContainerService['start']>[0]) => new MockContainer('cid123', svc as any);
    svc = {
      findContainerByLabels: vi.fn(async (_labels: Record<string, string>) => undefined) as unknown as ContainerService['findContainerByLabels'],
      start: vi.fn(startImpl) as unknown as ContainerService['start'],
      getContainerLabels: vi.fn(async (_id: string) => ({})) as unknown as ContainerService['getContainerLabels'],
    };
  });

  it('recreates when existing platform mismatches requested', async () => {
    const existing = new MockContainer('abc', svc as any);
    (svc.findContainerByLabels as any).mockResolvedValue(existing);
    (svc.getContainerLabels as any).mockResolvedValue({ [PLATFORM_LABEL]: 'linux/amd64' });

    const provider = new ContainerProviderEntity(svc as any, {}, idLabels);
    provider.setConfig({ platform: 'linux/arm64' }); // DinD disabled by default
    const c = await provider.provide('t1');

    // ensure lookup used the thread-scoped label
    expect((svc.findContainerByLabels as any).mock.calls[0][0]).toMatchObject(idLabels('t1'));

    expect(existing.stop).toHaveBeenCalled();
    expect(existing.remove).toHaveBeenCalled();
    expect(svc.start).toHaveBeenCalled();
    const startArgs = (svc.start as any).mock.calls[0][0];
    expect(startArgs.platform).toBe('linux/arm64');
    expect(c).toBeInstanceOf(MockContainer);
  });

  it('recreates when existing has no platform label but platform is requested', async () => {
    const existing = new MockContainer('abc', svc as any);
    (svc.findContainerByLabels as any).mockResolvedValue(existing);
    (svc.getContainerLabels as any).mockResolvedValue({});

    const provider = new ContainerProviderEntity(svc as any, {}, idLabels);
    provider.setConfig({ platform: 'linux/arm64' }); // DinD disabled by default
    const c = await provider.provide('t2');

    expect(existing.stop).toHaveBeenCalled();
    expect(existing.remove).toHaveBeenCalled();
    expect(svc.start).toHaveBeenCalled();
    const startArgs = (svc.start as any).mock.calls[0][0];
    expect(startArgs.platform).toBe('linux/arm64');
    expect(c).toBeInstanceOf(MockContainer);
  });

  it('reuses existing when platform undefined', async () => {
    const existing = new MockContainer('abc', svc as any);
    (svc.findContainerByLabels as any).mockResolvedValue(existing);

    const provider = new ContainerProviderEntity(svc as any, {}, idLabels);
    // no platform in config
    const c = await provider.provide('t3');

    expect(existing.stop).not.toHaveBeenCalled();
    expect(existing.remove).not.toHaveBeenCalled();
    expect(svc.start).not.toHaveBeenCalled();
    expect(c).toBe(existing);
  });

  it('does not call remove() when platform undefined and container reused', async () => {
    const existing = new MockContainer('abc', svc as any);
    (svc.findContainerByLabels as any).mockResolvedValue(existing);

    const provider = new ContainerProviderEntity(svc as any, {}, idLabels);
    const c = await provider.provide('t4');

    expect(existing.stop).not.toHaveBeenCalled();
    expect(existing.remove).not.toHaveBeenCalled();
    expect(c).toBe(existing);
  });

  it('schema rejects invalid platform values', () => {
    const res = ContainerProviderStaticConfigSchema.safeParse({ platform: 'linux/arm/v7' });
    expect(res.success).toBe(false);
  });

  it('does not attempt DinD when flag disabled (default)', async () => {
    const startImpl = async (_opts: Parameters<ContainerService['start']>[0]) => new MockContainer('cid123', svc as any);
    (svc.start as any).mockImplementationOnce(startImpl);
    const provider = new ContainerProviderEntity(svc as any, {}, idLabels);
    provider.setConfig({});
    const c = await provider.provide('tdis');
    expect(c).toBeInstanceOf(MockContainer);
    // verify DOCKER_HOST is NOT injected when DinD disabled
    const call = (svc.start as any).mock.calls.find(Boolean);
    expect(call[0].env?.DOCKER_HOST).toBeUndefined();
  });

  it('injects DOCKER_HOST and would ensure DinD when enabled', async () => {
    const startImpl = async (_opts: Parameters<ContainerService['start']>[0]) => new MockContainer('cid999', svc as any);
    (svc.start as any).mockImplementationOnce(startImpl);
    const provider = new ContainerProviderEntity(svc as any, {}, idLabels);
    provider.setConfig({ enableDinD: true });
    const c = await provider.provide('ten');
    expect(c).toBeInstanceOf(MockContainer);
    const call = (svc.start as any).mock.calls.find(Boolean);
    expect(call[0].env?.DOCKER_HOST).toBe('tcp://localhost:2375');
  });
});
