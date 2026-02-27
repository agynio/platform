import { PassThrough } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';

import { ContainerService } from '../src/lib/container.service';

describe('ContainerService execContainer', () => {
  it('runs string commands through /bin/sh -lc to preserve shell semantics', async () => {
    const service = new ContainerService();

    const mockStream = new PassThrough();
    const execInspect = vi
      .fn()
      .mockResolvedValueOnce({ ProcessConfig: { tty: true } })
      .mockResolvedValueOnce({ ExitCode: 0 });
    const execStart = vi.fn((_opts, cb: (err: unknown, stream?: NodeJS.ReadableStream | null) => void) => {
      cb(null, mockStream);
      setImmediate(() => {
        mockStream.emit('data', Buffer.from('bar\n'));
        mockStream.emit('end');
        mockStream.emit('close');
      });
    });

    const containerExec = vi.fn(async (opts: { Cmd: string[] }) => {
      expect(opts.Cmd).toEqual(['/bin/sh', '-lc', 'export FOO=bar && echo $FOO']);
      return {
        start: execStart,
        inspect: execInspect,
      } as unknown as DockerodeExec;
    });

    const containerInspect = vi.fn().mockResolvedValue({ Id: 'cid-1234567890ab', State: { Running: true } });

    type DockerodeExec = {
      start: typeof execStart;
      inspect: typeof execInspect;
    };

    const dockerMock = {
      getContainer: () => ({
        inspect: containerInspect,
        exec: containerExec,
      }),
      modem: {},
    };

    (service as unknown as { docker: typeof dockerMock }).docker = dockerMock;

    const result = await service.execContainer('cid-1234567890ab', 'export FOO=bar && echo $FOO');

    expect(result.stdout.trim()).toBe('bar');
    expect(result.stderr).toBe('');
    expect(containerInspect).toHaveBeenCalledTimes(1);
  });

  it('sends signals to exec process group when terminating after timeout', async () => {
    const service = new ContainerService();
    const killSpy = vi
      .spyOn(process, 'kill')
      .mockImplementation(() => true as unknown as ReturnType<typeof process.kill>);
    try {
      const exec = {
        inspect: vi.fn(async () => ({ ID: 'exec-xyz', Pid: 4321 })),
      } as unknown as { inspect: () => Promise<{ ID: string; Pid: number }> };

      Reflect.set(service as unknown as object, 'delay', vi.fn(async () => undefined));
      Reflect.set(service as unknown as object, 'isProcessAlive', vi.fn(() => true));

      type TerminateExecProcessFn = (
        execLike: { inspect: () => Promise<{ ID: string; Pid: number }> },
        context: { containerId: string; reason: 'timeout' | 'idle_timeout'; timeoutMs?: number; idleTimeoutMs?: number },
      ) => Promise<void>;
      const terminateExecProcess = Reflect.get(service as unknown as object, 'terminateExecProcess') as TerminateExecProcessFn;

      await terminateExecProcess.call(service, exec, {
        containerId: 'cid-xyz',
        reason: 'timeout',
        timeoutMs: 500,
      });

      expect(killSpy).toHaveBeenCalledWith(-4321, 'SIGTERM');
      expect(killSpy).toHaveBeenCalledWith(4321, 'SIGTERM');
      expect(killSpy).toHaveBeenCalledWith(-4321, 'SIGKILL');
      expect(killSpy).toHaveBeenCalledWith(4321, 'SIGKILL');
    } finally {
      killSpy.mockRestore();
    }
  });
});
