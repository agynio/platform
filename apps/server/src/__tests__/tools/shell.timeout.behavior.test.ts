import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LoggerService } from '../../services/logger.service';
import { ShellTool } from '../../tools/shell_command';
import { ContainerService } from '../../services/container.service';
import { isExecTimeoutError, ExecIdleTimeoutError } from '../../utils/execTimeout';

describe('ShellTool timeout error message', () => {
  it('throws clear timeout error with tail header on exec timeout', async () => {
    const logger = new LoggerService();
    const timeoutErr = new Error('Exec timed out after 3600000ms');

    const fakeContainer = {
      exec: vi.fn(async () => {
        throw timeoutErr;
      }),
    } as any;

    const provider = { provide: vi.fn(async () => fakeContainer) } as any;

    const tool = new ShellTool(undefined as any, logger);
    tool.setContainerProvider(provider);
    await tool.configure({});
    const t = tool.init();

    await expect(
      t.invoke({ command: 'sleep 999999' }, { configurable: { thread_id: 't' } } as any),
    ).rejects.toThrowError(/Error \(timeout after 3600000ms\): command exceeded 3600000ms and was terminated\. See output tail below\./);
    await expect(
      t.invoke({ command: 'sleep 999999' }, { configurable: { thread_id: 't' } } as any),
    ).rejects.toThrowError(/----------/);
  });

  it('distinguishes idle timeout messaging', async () => {
    const logger = new LoggerService();
    const idleErr = new ExecIdleTimeoutError(60000, 'out', 'err');
    const fakeContainer = { exec: vi.fn(async () => { throw idleErr; }) } as any;
    const provider = { provide: vi.fn(async () => fakeContainer) } as any;
    const tool = new ShellTool(undefined as any, logger);
    tool.setContainerProvider(provider);
    await tool.configure({});
    const t = tool.init();
    await expect(
      t.invoke({ command: 'sleep 999999' }, { configurable: { thread_id: 't' } } as any),
    ).rejects.toThrowError(/Error \(idle timeout\): no output for 60000ms; command was terminated\./);
  });

  it('reports actual enforced idle timeout from error.timeoutMs when available', async () => {
    const logger = new LoggerService();
    const idleErr = new (class extends ExecIdleTimeoutError { constructor() { super(12345, 'out', 'err'); } })();
    const fakeContainer = { exec: vi.fn(async () => { throw idleErr; }) } as any;
    const provider = { provide: vi.fn(async () => fakeContainer) } as any;
    const tool = new ShellTool(undefined as any, logger);
    tool.setContainerProvider(provider);
    await tool.configure({ idleTimeoutMs: 60000 });
    const t = tool.init();
    await expect(
      t.invoke({ command: 'sleep 999999' }, { configurable: { thread_id: 't' } } as any),
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
    const docker: any = {
      getContainer: vi.fn((id: string) => ({
        inspect: vi.fn(async () => ({ Id: id, State: { Running: true } })),
        exec: vi.fn(async (_opts: any) => ({
          start: (_: any, cb: any) => cb(undefined, { on: () => {}, once: () => {}, pipe: () => {}, end: () => {} }),
          inspect: vi.fn(async () => ({})),
        })),
        stop: vi.fn(async () => {}),
      })),
      modem: { demuxStream: () => {} },
    };

    // Patch service docker instance
    (svc as any).docker = docker;
    // Spy on startAndCollectExec to force timeout rejection
    const timeoutErr = new Error('Exec timed out after 123ms');
    vi.spyOn(svc as any, 'startAndCollectExec').mockRejectedValue(timeoutErr);

    await expect(
      svc.execContainer('cid123', 'echo hi', { timeoutMs: 123, killOnTimeout: true }),
    ).rejects.toThrow(/timed out/);
    // Ensure stop was called via stopContainer path (second getContainer call)
    expect(docker.getContainer).toHaveBeenCalledTimes(2);
    const stopped = docker.getContainer.mock.results[1].value;
    expect(stopped.stop).toHaveBeenCalledTimes(1);
  });

  it('does not stop container when killOnTimeout is false/omitted', async () => {
    const docker: any = {
      getContainer: vi.fn((id: string) => ({
        inspect: vi.fn(async () => ({ Id: id, State: { Running: true } })),
        exec: vi.fn(async (_opts: any) => ({
          start: (_: any, cb: any) => cb(undefined, { on: () => {}, once: () => {}, pipe: () => {}, end: () => {} }),
          inspect: vi.fn(async () => ({})),
        })),
        stop: vi.fn(async () => {}),
      })),
      modem: { demuxStream: () => {} },
    };

    (svc as any).docker = docker;
    const timeoutErr = new Error('Exec timed out after 456ms');
    vi.spyOn(svc as any, 'startAndCollectExec').mockRejectedValue(timeoutErr);

    await expect(
      svc.execContainer('cid999', 'echo nope', { timeoutMs: 456 }),
    ).rejects.toThrow(/timed out/);
    // Ensure stop was not called on any container instance
    const anyStopped = docker.getContainer.mock.results.some((r: any) => r.value.stop.mock.calls.length > 0);
    expect(anyStopped).toBe(false);
    // Optional: verify only one getContainer call (inspect only)
    expect(docker.getContainer).toHaveBeenCalledTimes(1);
  });

  it('propagates non-timeout errors unchanged (service)', async () => {
    const docker: any = {
      getContainer: vi.fn((id: string) => ({
        inspect: vi.fn(async () => ({ Id: id, State: { Running: true } })),
        exec: vi.fn(async (_opts: any) => ({
          start: (_: any, cb: any) => cb(undefined, { on: () => {}, once: () => {}, pipe: () => {}, end: () => {} }),
          inspect: vi.fn(async () => ({})),
        })),
        stop: vi.fn(async () => {}),
      })),
      modem: { demuxStream: () => {} },
    };

    (svc as any).docker = docker;
    const genericErr = new Error('Some other failure');
    vi.spyOn(svc as any, 'startAndCollectExec').mockRejectedValue(genericErr);

    await expect(svc.execContainer('cid42', 'echo oops', { timeoutMs: 50, killOnTimeout: true })).rejects.toBe(
      genericErr,
    );
    // Should not attempt stop as it is not a timeout
    const anyStopped = docker.getContainer.mock.results.some((r: any) => r.value.stop.mock.calls.length > 0);
    expect(anyStopped).toBe(false);
  });

  it('stops container on idle timeout with killOnTimeout=true', async () => {
    const docker: any = {
      getContainer: vi.fn((id: string) => ({
        inspect: vi.fn(async () => ({ Id: id, State: { Running: true } })),
        exec: vi.fn(async (_opts: any) => ({
          start: (_: any, cb: any) => cb(undefined, { on: () => {}, once: () => {}, pipe: () => {}, end: () => {} }),
          inspect: vi.fn(async () => ({})),
        })),
        stop: vi.fn(async () => {}),
      })),
      modem: { demuxStream: () => {} },
    };
    (svc as any).docker = docker;
    const idleErr = new ExecIdleTimeoutError(321, 'a', 'b');
    vi.spyOn(svc as any, 'startAndCollectExec').mockRejectedValue(idleErr);

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
    const provider = {
      provide: vi.fn(async () => ({
        exec: vi.fn(async () => {
          // Simulate generic error from container.exec
          throw new Error('Permission denied');
        }),
      })),
    } as unknown as { provide: (id: string) => Promise<{ exec: (cmd: string, opts?: unknown) => Promise<never> }> };

    const tool = new ShellTool(undefined as any, logger);
    tool.setContainerProvider(provider as any);
    await tool.configure({});
    const t = tool.init();

    await expect(
      t.invoke({ command: 'ls' }, { configurable: { thread_id: 't' } } as any),
    ).rejects.toThrow('Permission denied');
  });
});
