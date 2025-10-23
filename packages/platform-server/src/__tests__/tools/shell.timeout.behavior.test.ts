import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LoggerService } from '../../core/services/logger.service';
import { ShellTool } from '../../nodes/tools/shell_command/shell_command.node';
import { ContainerService } from '../../core/services/container.service';
import { isExecTimeoutError, ExecIdleTimeoutError } from '../../utils/execTimeout';
import { ContainerProviderEntity } from '../../entities/containerProvider.entity';
import { ContainerEntity } from '../../entities/container.entity';
import type { Mock } from 'vitest';

describe('ShellTool timeout error message', () => {
  it('throws clear timeout error with tail header on exec timeout', async () => {
    const logger = new LoggerService();
    const timeoutErr = new Error('Exec timed out after 3600000ms');

    const fakeContainer = {
      exec: vi.fn(async () => {
        throw timeoutErr;
      }),
    } as const;

    class FakeContainer extends ContainerEntity {
      override async exec(_cmd: string | string[], _opts?: unknown): Promise<never> { throw timeoutErr; }
    }
    class FakeProvider extends ContainerProviderEntity {
      constructor(logger: LoggerService) { super(new ContainerService(logger), undefined, {}, () => ({})); }
      override async provide(_t: string): Promise<ContainerEntity> { return new FakeContainer(new ContainerService(logger), 'fake'); }
    }
    const provider = new FakeProvider(logger);

    const tool = new ShellTool(undefined, logger);
    tool.setContainerProvider(provider);
    await tool.setConfig({});
    const t = tool.init();

    type InvokeArgs = Parameters<ReturnType<ShellTool['init']>['invoke']>;
    const payload: InvokeArgs[0] = { command: 'sleep 999999' };
    const ctx: InvokeArgs[1] = { configurable: { thread_id: 't' } } as any;
    await expect(
      t.invoke(payload, ctx),
    ).rejects.toThrowError(/Error \(timeout after 3600000ms\): command exceeded 3600000ms and was terminated\. See output tail below\./);
    await expect(
      t.invoke(payload, ctx),
    ).rejects.toThrowError(/----------/);
  });

  it('distinguishes idle timeout messaging', async () => {
    const logger = new LoggerService();
    const idleErr = new ExecIdleTimeoutError(60000, 'out', 'err');
    const fakeContainer = { exec: vi.fn(async () => { throw idleErr; }) } as const;
    class FakeContainer extends ContainerEntity { override async exec(): Promise<never> { throw idleErr; } }
    class FakeProvider extends ContainerProviderEntity { constructor(logger: LoggerService) { super(new ContainerService(logger), undefined, {}, () => ({})); } override async provide(): Promise<ContainerEntity> { return new FakeContainer(new ContainerService(logger), 'fake'); } }
    const provider = new FakeProvider(logger);
    const tool = new ShellTool(undefined, logger);
    tool.setContainerProvider(provider);
    await tool.setConfig({});
    const t = tool.init();
    type InvokeArgs = Parameters<ReturnType<ShellTool['init']>['invoke']>;
    const payload: InvokeArgs[0] = { command: 'sleep 999999' };
    const ctx: InvokeArgs[1] = { configurable: { thread_id: 't' } } as any;
    await expect(
      t.invoke(payload, ctx),
    ).rejects.toThrowError(/Error \(idle timeout\): no output for 60000ms; command was terminated\./);
  });

  it('reports actual enforced idle timeout from error.timeoutMs when available', async () => {
    const logger = new LoggerService();
    const idleErr = new (class extends ExecIdleTimeoutError { constructor() { super(12345, 'out', 'err'); } })();
    const fakeContainer = { exec: vi.fn(async () => { throw idleErr; }) } as const;
    class FakeContainer extends ContainerEntity { override async exec(): Promise<never> { throw idleErr; } }
    class FakeProvider extends ContainerProviderEntity { constructor(logger: LoggerService) { super(new ContainerService(logger), undefined, {}, () => ({})); } override async provide(): Promise<ContainerEntity> { return new FakeContainer(new ContainerService(logger), 'fake'); } }
    const provider = new FakeProvider(logger);
    const tool = new ShellTool(undefined, logger);
    tool.setContainerProvider(provider);
    await tool.setConfig({ idleTimeoutMs: 60000 });
    const t = tool.init();
    type InvokeArgs = Parameters<ReturnType<ShellTool['init']>['invoke']>;
    const payload: InvokeArgs[0] = { command: 'sleep 999999' };
    const ctx: InvokeArgs[1] = { configurable: { thread_id: 't' } } as any;
    await expect(
      t.invoke(payload, ctx),
    ).rejects.toThrowError(/no output for 12345ms/);
  });
});

describe('ContainerService.execContainer killOnTimeout behavior', () => {
  let svc: ContainerService;
  let logger: LoggerService;
  beforeEach(() => {
    logger = new LoggerService();
    svc = new ContainerService(logger);
  });

  it('stops container on timeout when killOnTimeout=true', async () => {
    const docker = {
      getContainer: vi.fn((id: string) => ({
        inspect: vi.fn(async () => ({ Id: id, State: { Running: true } })),
        exec: vi.fn(async (_opts: any) => ({
          start: (_: any, cb: any) => cb(undefined, { on: () => {}, once: () => {}, pipe: () => {}, end: () => {} }),
          inspect: vi.fn(async () => ({})),
        })),
        stop: vi.fn(async () => {}),
      })),
      modem: { demuxStream: () => {} },
    } as const;

    // Patch service docker instance without any: use Reflect.set
    Reflect.set(svc as unknown as object, 'docker', docker);
    // Simulate timeout by throwing during exec.inspect() at end
    // We'll patch exec.inspect via docker mock below
    const timeoutErr = new Error('Exec timed out after 123ms');
    const getContainer = docker.getContainer;
    // Patch startAndCollectExec behavior by providing a container.exec that yields a stream that errors
    Reflect.set(svc as unknown as object, 'startAndCollectExec', vi.fn(async () => { throw timeoutErr; }));

    await expect(
      svc.execContainer('cid123', 'echo hi', { timeoutMs: 123, killOnTimeout: true }),
    ).rejects.toThrow(/timed out/);
    // Ensure stop was called via stopContainer path (second getContainer call)
    expect(docker.getContainer).toHaveBeenCalledTimes(2);
    const stopped = docker.getContainer.mock.results[1].value;
    expect(stopped.stop).toHaveBeenCalledTimes(1);
  });

  it('does not stop container when killOnTimeout is false/omitted', async () => {
    const docker = {
      getContainer: vi.fn((id: string) => ({
        inspect: vi.fn(async () => ({ Id: id, State: { Running: true } })),
        exec: vi.fn(async (_opts: any) => ({
          start: (_: any, cb: any) => cb(undefined, { on: () => {}, once: () => {}, pipe: () => {}, end: () => {} }),
          inspect: vi.fn(async () => ({})),
        })),
        stop: vi.fn(async () => {}),
      })),
      modem: { demuxStream: () => {} },
    } as const;
    Reflect.set(svc as unknown as object, 'docker', docker);
    const timeoutErr = new Error('Exec timed out after 456ms');
    Reflect.set(svc as unknown as object, 'startAndCollectExec', vi.fn(async () => { throw timeoutErr; }));

    await expect(
      svc.execContainer('cid999', 'echo nope', { timeoutMs: 456 }),
    ).rejects.toThrow(/timed out/);
    // Ensure stop was not called on any container instance
    const getContainerMock = docker.getContainer;
    const anyStopped = getContainerMock.mock.results.some((r: any) => r.value.stop.mock.calls.length > 0);
    expect(anyStopped).toBe(false);
    // Optional: verify only one getContainer call (inspect only)
    expect(docker.getContainer).toHaveBeenCalledTimes(1);
  });

  it('propagates non-timeout errors unchanged (service)', async () => {
    const docker = {
      getContainer: vi.fn((id: string) => ({
        inspect: vi.fn(async () => ({ Id: id, State: { Running: true } })),
        exec: vi.fn(async (_opts: any) => ({
          start: (_: any, cb: any) => cb(undefined, { on: () => {}, once: () => {}, pipe: () => {}, end: () => {} }),
          inspect: vi.fn(async () => ({})),
        })),
        stop: vi.fn(async () => {}),
      })),
      modem: { demuxStream: () => {} },
    } as const;
    Reflect.set(svc as unknown as object, 'docker', docker);
    const genericErr = new Error('Some other failure');
    Reflect.set(svc as unknown as object, 'startAndCollectExec', vi.fn(async () => { throw genericErr; }));

    await expect(svc.execContainer('cid42', 'echo oops', { timeoutMs: 50, killOnTimeout: true })).rejects.toBe(
      genericErr,
    );
    // Should not attempt stop as it is not a timeout
    const anyStopped = docker.getContainer.mock.results.some((r: any) => r.value.stop.mock.calls.length > 0);
    expect(anyStopped).toBe(false);
  });

  it('stops container on idle timeout with killOnTimeout=true', async () => {
    const docker = {
      getContainer: vi.fn((id: string) => ({
        inspect: vi.fn(async () => ({ Id: id, State: { Running: true } })),
        exec: vi.fn(async (_opts: any) => ({
          start: (_: any, cb: any) => cb(undefined, { on: () => {}, once: () => {}, pipe: () => {}, end: () => {} }),
          inspect: vi.fn(async () => ({})),
        })),
        stop: vi.fn(async () => {}),
      })),
      modem: { demuxStream: () => {} },
    } as const;
    Reflect.set(svc as unknown as object, 'docker', docker);
    const idleErr = new ExecIdleTimeoutError(321, 'a', 'b');
    Reflect.set(svc as unknown as object, 'startAndCollectExec', vi.fn(async () => { throw idleErr; }));

    await expect(
      svc.execContainer('cidIdle', 'echo idle', { timeoutMs: 9999, idleTimeoutMs: 321, killOnTimeout: true }),
    ).rejects.toBe(idleErr);
    expect(docker.getContainer).toHaveBeenCalledTimes(2);
    const stopped = docker.getContainer.mock.results[1].value;
    expect(stopped.stop).toHaveBeenCalledTimes(1);
  });
});

describe('ShellTool non-timeout error propagation', () => {
  it('rethrows non-timeout errors', async () => {
    const logger = new LoggerService();
    class FakeContainer extends ContainerEntity {
      override async exec(): Promise<never> { throw new Error('Permission denied'); }
    }
    class FakeProvider extends ContainerProviderEntity {
      constructor(logger: LoggerService) { super(new ContainerService(logger), undefined, {}, () => ({})); }
      override async provide(): Promise<ContainerEntity> { return new FakeContainer(new ContainerService(logger), 'fake'); }
    }
    const provider = new FakeProvider(logger);

    const tool = new ShellTool(undefined, logger);
    tool.setContainerProvider(provider);
    await tool.setConfig({});
    const t = tool.init();

    type InvokeArgs = Parameters<ReturnType<ShellTool['init']>['invoke']>;
    const payload: InvokeArgs[0] = { command: 'ls' };
    const ctx: InvokeArgs[1] = { configurable: { thread_id: 't' } } as any;
    await expect(
      t.invoke(payload, ctx),
    ).rejects.toThrow('Permission denied');
  });
});
