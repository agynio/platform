import { describe, it, expect, vi } from 'vitest';
import { ContainerService } from '../../services/container.service';
import { LoggerService } from '../../services/logger.service';

describe('ContainerService idle timer resets on stderr-only output', () => {
  it('should reset idle timer when only stderr produces data', async () => {
    const logger = new LoggerService();
    const svc = new ContainerService(logger);

    const fakeStream: any = {
      on: vi.fn((evt: string, cb: Function) => {
        if (evt === 'end' || evt === 'error' || evt === 'close') return;
        return fakeStream; // noop for data registrations
      }),
    };

    const docker: any = {
      getContainer: vi.fn((id: string) => ({
        inspect: vi.fn(async () => ({ Id: id, State: { Running: true } })),
        exec: vi.fn(async (_opts: any) => ({
          start: (_: any, cb: any) => cb(undefined, fakeStream),
          inspect: vi.fn(async () => ({ ProcessConfig: { tty: false }, ExitCode: 0 })),
        })),
      })),
      modem: {
        demuxStream: vi.fn((_stream: any, out: any, err: any) => {
          // Simulate only stderr emitting data periodically, then end
          const chunks = ['e1', 'e2', 'e3'];
          let i = 0;
          const interval = setInterval(() => {
            if (i < chunks.length) {
              err.write(Buffer.from(chunks[i++]));
            } else {
              clearInterval(interval);
              // trigger end handler
              const endHandler = fakeStream.on.mock.calls.find((c: any[]) => c[0] === 'end')?.[1];
              endHandler && endHandler();
            }
          }, 10);
        }),
      },
    };

    (svc as any).docker = docker;

    const result = await svc.execContainer('cid', 'echo test', { timeoutMs: 2000, idleTimeoutMs: 100 });
    expect(result.exitCode).toBe(0);
    // Ensure demuxStream was used
    expect(docker.modem.demuxStream).toHaveBeenCalled();
  });
});

