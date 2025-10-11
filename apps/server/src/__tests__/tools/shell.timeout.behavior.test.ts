import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LoggerService } from '../../services/logger.service';
import { ShellTool } from '../../tools/shell_command';
import { ContainerService } from '../../services/container.service';

describe('ShellTool timeout error message', () => {
  it('returns clear timeout error string on exec timeout', async () => {
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
    await tool.setConfig({});
    const t = tool.init();

    const res = String(await t.invoke({ command: 'sleep 999999' }, { configurable: { thread_id: 't' } } as any));
    expect(res).toContain('Error (timeout after 1h)');
    expect(res).toContain('3600000ms');
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
    const spy = vi.spyOn(svc as any, 'startAndCollectExec').mockRejectedValue(timeoutErr);

    await expect(
      svc.execContainer('cid123', 'echo hi', { timeoutMs: 123, killOnTimeout: true }),
    ).rejects.toThrow(/timed out/);
    // stop should be called once on the container
    expect(docker.getContainer).toHaveBeenCalledWith('cid123');
    const cont = docker.getContainer.mock.results[0].value;
    expect(cont.stop).toHaveBeenCalledTimes(1);
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
    // Ensure stop was not called
    const cont = docker.getContainer.mock.results[0].value;
    expect(cont.stop).not.toHaveBeenCalled();
  });
});
