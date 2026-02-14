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
});
