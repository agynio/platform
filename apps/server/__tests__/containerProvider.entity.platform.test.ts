import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ContainerProviderEntity, ContainerProviderStaticConfigSchema } from '../src/entities/containerProvider.entity';
import { ContainerService } from '../src/services/container.service';
import { ContainerEntity } from '../src/entities/container.entity';
import { PLATFORM_LABEL } from '../src/constants.js';

class MockContainer extends ContainerEntity {
  constructor(id: string, private svc: Partial<ContainerService>) {
    // Tests only use exec/stop/remove; cast avoids any while keeping types local
    super(svc as unknown as ContainerService, id);
  }
  override stop = vi.fn(async () => {});
  override remove = vi.fn(async (_force?: boolean) => {});
  override exec = vi.fn(async (_cmd: string | string[]) => ({ stdout: '', stderr: '', exitCode: 0 }));
}

describe('ContainerProviderEntity platform reuse logic', () => {
  let svc: vi.Mocked<Partial<ContainerService>>;
  const idLabels = (id: string) => ({ 'hautech.ai/thread_id': `node__${id}` });

  beforeEach(() => {
    vi.clearAllMocks();
    const startImpl = async (_opts: Parameters<ContainerService['start']>[0]) => new MockContainer('cid123', svc);
    svc = {
      findContainerByLabels: vi.fn(async (_labels: Record<string, string>) => undefined),
      start: vi.fn(startImpl),
      getContainerLabels: vi.fn(async (_id: string) => ({})),
      execContainer: vi.fn(async () => ({ stdout: '', stderr: '', exitCode: 0 })),
    } as unknown as vi.Mocked<Partial<ContainerService>>;
  });

  it('recreates when existing platform mismatches requested', async () => {
    const existing = new MockContainer('abc', svc);
    (svc.findContainerByLabels as unknown as vi.Mock).mockResolvedValue(existing);
    (svc.getContainerLabels as unknown as vi.Mock).mockResolvedValue({ [PLATFORM_LABEL]: 'linux/amd64' });

    const provider = new ContainerProviderEntity(svc as unknown as ContainerService, {}, idLabels);
    provider.setConfig({ platform: 'linux/arm64' }); // DinD disabled by default
    const c = await provider.provide('t1');

    // ensure lookup used the thread-scoped label
    expect((svc.findContainerByLabels as vi.Mock).mock.calls[0][0]).toMatchObject(idLabels('t1'));

    expect(existing.stop).toHaveBeenCalled();
    expect(existing.remove).toHaveBeenCalled();
    expect(svc.start).toHaveBeenCalled();
    type StartOpts = Parameters<ContainerService['start']>[0];
    const startArgs = (svc.start as vi.Mock).mock.calls[0][0] as StartOpts;
    expect(startArgs.platform).toBe('linux/arm64');
    expect(c).toBeInstanceOf(MockContainer);
  });

  it('recreates when existing has no platform label but platform is requested', async () => {
    const existing = new MockContainer('abc', svc);
    (svc.findContainerByLabels as unknown as vi.Mock).mockResolvedValue(existing);
    (svc.getContainerLabels as unknown as vi.Mock).mockResolvedValue({});

    const provider = new ContainerProviderEntity(svc as unknown as ContainerService, {}, idLabels);
    provider.setConfig({ platform: 'linux/arm64' }); // DinD disabled by default
    const c = await provider.provide('t2');

    expect(existing.stop).toHaveBeenCalled();
    expect(existing.remove).toHaveBeenCalled();
    expect(svc.start).toHaveBeenCalled();
    const startArgs = (svc.start as vi.Mock).mock.calls[0][0] as Parameters<ContainerService['start']>[0];
    expect(startArgs.platform).toBe('linux/arm64');
    expect(c).toBeInstanceOf(MockContainer);
  });

  it('reuses existing when platform undefined', async () => {
    const existing = new MockContainer('abc', svc);
    (svc.findContainerByLabels as unknown as vi.Mock).mockResolvedValue(existing);

    const provider = new ContainerProviderEntity(svc as unknown as ContainerService, {}, idLabels);
    // no platform in config
    const c = await provider.provide('t3');

    expect(existing.stop).not.toHaveBeenCalled();
    expect(existing.remove).not.toHaveBeenCalled();
    expect(svc.start).not.toHaveBeenCalled();
    expect(c).toBe(existing);
  });

  it('does not call remove() when platform undefined and container reused', async () => {
    const existing = new MockContainer('abc', svc);
    (svc.findContainerByLabels as unknown as vi.Mock).mockResolvedValue(existing);

    const provider = new ContainerProviderEntity(svc as unknown as ContainerService, {}, idLabels);
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
    const startImpl = async (_opts: Parameters<ContainerService['start']>[0]) => new MockContainer('cid123', svc);
    (svc.start as vi.Mock).mockImplementationOnce(startImpl);
    const provider = new ContainerProviderEntity(svc as unknown as ContainerService, {}, idLabels);
    provider.setConfig({});
    const c = await provider.provide('tdis');
    expect(c).toBeInstanceOf(MockContainer);
    // verify DOCKER_HOST is NOT injected when DinD disabled
    const call = (svc.start as vi.Mock).mock.calls[0];
    expect((call[0] as Parameters<ContainerService['start']>[0]).env?.DOCKER_HOST).toBeUndefined();
  });

  it('injects DOCKER_HOST and would ensure DinD when enabled', async () => {
    const startImpl = async (_opts: Parameters<ContainerService['start']>[0]) => new MockContainer('cid999', svc);
    (svc.start as vi.Mock).mockImplementationOnce(startImpl);
    // DinD readiness already mocked in beforeEach via execContainer
    const provider = new ContainerProviderEntity(svc as unknown as ContainerService, {}, idLabels);
    provider.setConfig({ enableDinD: true });
    const c = await provider.provide('ten');
    expect(c).toBeInstanceOf(MockContainer);
    const call = (svc.start as vi.Mock).mock.calls[0];
    expect((call[0] as Parameters<ContainerService['start']>[0]).env?.DOCKER_HOST).toBe('tcp://localhost:2375');
  }, 20000);
});
