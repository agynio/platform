import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LoggerService } from '../../src/core/services/logger.service';
import { ContainerService } from '../../src/core/services/container.service';

describe('ContainerService last_used updates', () => {
  let svc: ContainerService;
  let logger: LoggerService;

  const makeDocker = () => ({
    modem: { demuxStream: vi.fn() },
    getContainer: vi.fn((id: string) => ({
      inspect: vi.fn(async () => ({ Id: id, State: { Running: true } })),
      exec: vi.fn(async (_opts: any) => ({
        start: (_: any, cb: any) => cb(undefined, { on: () => {}, once: () => {}, pipe: () => {}, end: () => {} }),
        inspect: vi.fn(async () => ({ ExitCode: 0 })),
      })),
    })),
  }) as any;

  beforeEach(() => {
    logger = new LoggerService();
    svc = new ContainerService(logger);
    (svc as any).docker = makeDocker();
    vi.spyOn(svc as any, 'startAndCollectExec').mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });
  });

  it('updates last_used when execContainer() is called', async () => {
    const registry = { updateLastUsed: vi.fn(async () => {}) } as any;
    svc.setRegistry(registry);
    const cid = 'abc123cid';
    await svc.execContainer(cid, 'echo hi');
    expect(registry.updateLastUsed).toHaveBeenCalledTimes(1);
    const [calledId, calledDate] = registry.updateLastUsed.mock.calls[0];
    expect(calledId).toBe(cid);
    expect(calledDate).toBeInstanceOf(Date);
  });

  it('updates last_used when openInteractiveExec() is called', async () => {
    const registry = { updateLastUsed: vi.fn(async () => {}) } as any;
    svc.setRegistry(registry);

    const { PassThrough } = require('node:stream');
    const docker: any = (svc as any).docker;
    docker.getContainer = vi.fn((id: string) => ({
      inspect: vi.fn(async () => ({ Id: id, State: { Running: true } })),
      exec: vi.fn(async (_opts: any) => ({
        start: (_: any, cb: any) => {
          const stream = new PassThrough();
          setTimeout(() => stream.end(), 0);
          cb(undefined, stream as any);
        },
        inspect: vi.fn(async () => ({ ExitCode: 0 })),
      })),
    }));

    const cid = 'xyz789cid';
    const sess = await svc.openInteractiveExec(cid, 'sh -lc "echo hi"');
    expect(registry.updateLastUsed).toHaveBeenCalledTimes(1);
    const [calledId, calledDate] = registry.updateLastUsed.mock.calls[0];
    expect(calledId).toBe(cid);
    expect(calledDate).toBeInstanceOf(Date);
    await sess.close();
  });
});

