import { describe, it, expect, vi } from 'vitest';
import { LoggerService } from '../src/core/services/logger.service';
import { ContainerService } from '../src/infra/container/container.service';
import { PassThrough } from 'node:stream';

function makeFrame(type: number, payload: Buffer) {
  const header = Buffer.alloc(8);
  header[0] = type; // 1=stdout,2=stderr
  // bytes 1-3 reserved
  header.writeUInt32BE(payload.length, 4);
  return Buffer.concat([header, payload]);
}

describe('ContainerService.startAndCollectExec stream handling', () => {
  it('decodes UTF-8 split across chunk boundaries (TTY=true path)', async () => {
    const logger = new LoggerService();
    const svc = new ContainerService(logger);
    const out = new PassThrough();

    const docker: any = {
      getContainer: vi.fn(() => ({
        inspect: vi.fn(async () => ({ Id: 'abc', State: { Running: true } })),
        exec: vi.fn(async () => ({
          start: (_: any, cb: any) => {
            // Emit split emoji across chunks
            const sushi = Buffer.from('🍣', 'utf8'); // 4 bytes
            out.write(Buffer.from('start-'));
            out.write(sushi.subarray(0, 2));
            setTimeout(() => {
              out.write(sushi.subarray(2));
              out.end();
            }, 5);
            cb(undefined, out);
          },
          inspect: vi.fn(async () => ({ ProcessConfig: { tty: true }, ExitCode: 0 })),
        })),
      })),
      modem: { demuxStream: vi.fn() },
    };
    (svc as any).docker = docker;

    const res = await svc.execContainer('abc', 'echo', { timeoutMs: 2000, idleTimeoutMs: 0, tty: true });
    expect(res.exitCode).toBe(0);
    expect(res.stderr).toBe('');
    expect(res.stdout).toContain('start-');
    expect(res.stdout).toContain('🍣');
  });

  it('demuxes multiplexed stream when TTY=false (stdout/stderr separation)', async () => {
    const logger = new LoggerService();
    const svc = new ContainerService(logger);
    const hijacked = new PassThrough();

    const stdoutPayload = Buffer.from('hello-');
    const sushi = Buffer.from('🍣', 'utf8');
    const stderrPayload = Buffer.from('warn');

    const docker: any = {
      getContainer: vi.fn(() => ({
        inspect: vi.fn(async () => ({ Id: 'cid', State: { Running: true } })),
        exec: vi.fn(async () => ({
          start: (_: any, cb: any) => {
            // Write two frames: stdout with split utf8 over two frames, then stderr
            const f1 = makeFrame(1, Buffer.concat([stdoutPayload, sushi.subarray(0, 2)]));
            const f2 = makeFrame(1, sushi.subarray(2));
            const fErr = makeFrame(2, stderrPayload);
            hijacked.write(f1);
            setTimeout(() => {
              hijacked.write(f2);
              hijacked.write(fErr);
              hijacked.end();
            }, 5);
            cb(undefined, hijacked as any);
          },
          inspect: vi.fn(async () => ({ ProcessConfig: { tty: false }, ExitCode: 0 })),
        })),
      })),
      modem: {
        demuxStream: vi.fn((stream: any, out: any, err: any) => {
          // Emulate docker's demux by parsing frames as our manual helper would
          stream.on('data', (chunk: Buffer) => {
            let buf = chunk;
            while (buf.length >= 8) {
              const type = buf[0];
              const len = buf.readUInt32BE(4);
              if (buf.length < 8 + len) return;
              const payload = buf.subarray(8, 8 + len);
              if (type === 1) out.write(payload);
              else if (type === 2) err.write(payload);
              buf = buf.subarray(8 + len);
            }
          });
          stream.on('end', () => { out.end(); err.end(); });
        }),
      },
    };
    (svc as any).docker = docker;
    const res = await svc.execContainer('cid', 'echo', { timeoutMs: 2000, idleTimeoutMs: 0, tty: false });
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toContain('hello-');
    expect(res.stdout).toContain('🍣');
    expect(res.stderr).toBe('warn');
  });

  it('falls back safely when header invalid (treat raw as stdout)', async () => {
    const logger = new LoggerService();
    const svc = new ContainerService(logger);
    const hijacked = new PassThrough();

    const docker: any = {
      getContainer: vi.fn(() => ({
        inspect: vi.fn(async () => ({ Id: 'x', State: { Running: true } })),
        exec: vi.fn(async () => ({
          start: (_: any, cb: any) => {
            hijacked.write(Buffer.from('plain-text-without-headers'));
            hijacked.end();
            cb(undefined, hijacked as any);
          },
          inspect: vi.fn(async () => ({ ProcessConfig: { tty: false }, ExitCode: 0 })),
        })),
      })),
      modem: {
        demuxStream: vi.fn(() => { throw new Error('no demux available'); }),
      },
    };
    (svc as any).docker = docker;
    const res = await svc.execContainer('x', 'echo', { timeoutMs: 2000, idleTimeoutMs: 0, tty: false });
    expect(res.exitCode).toBe(0);
    expect(res.stderr).toBe('');
    expect(res.stdout).toContain('plain-text-without-headers');
  });

  it('handles large output streams without garbling', async () => {
    const logger = new LoggerService();
    const svc = new ContainerService(logger);
    const out = new PassThrough();

    const docker: any = {
      getContainer: vi.fn(() => ({
        inspect: vi.fn(async () => ({ Id: 'big', State: { Running: true } })),
        exec: vi.fn(async () => ({
          start: (_: any, cb: any) => {
            const line = 'x'.repeat(1024);
            for (let i = 0; i < 100; i++) out.write(line);
            out.end();
            cb(undefined, out);
          },
          inspect: vi.fn(async () => ({ ProcessConfig: { tty: true }, ExitCode: 0 })),
        })),
      })),
      modem: { demuxStream: vi.fn() },
    };
    (svc as any).docker = docker;
    const res = await svc.execContainer('big', 'echo', { timeoutMs: 2000, idleTimeoutMs: 0, tty: true });
    expect(res.exitCode).toBe(0);
    expect(res.stdout.length).toBe(1024 * 100);
  });

  it('preserves ANSI escape sequences (TTY=true)', async () => {
    const logger = new LoggerService();
    const svc = new ContainerService(logger);
    const out = new PassThrough();

    const ANSI = "\x1b[31mred\x1b[0m normal";
    const docker: any = {
      getContainer: vi.fn(() => ({
        inspect: vi.fn(async () => ({ Id: 'ansi', State: { Running: true } })),
        exec: vi.fn(async () => ({
          start: (_: any, cb: any) => {
            out.write(ANSI);
            out.end();
            cb(undefined, out);
          },
          inspect: vi.fn(async () => ({ ProcessConfig: { tty: true }, ExitCode: 0 })),
        })),
      })),
      modem: { demuxStream: vi.fn() },
    };
    (svc as any).docker = docker;

    const res = await svc.execContainer('ansi', 'echo', { timeoutMs: 2000, idleTimeoutMs: 0, tty: true });
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toBe(ANSI);
  });

  it('flushes decoder on overall timeout with partial multibyte and destroys stream', async () => {
    const logger = new LoggerService();
    const svc = new ContainerService(logger);
    const out = new PassThrough();

    let hijacked: PassThrough | null = null;
    const sushi = Buffer.from('🍣', 'utf8'); // 4 bytes
    const docker: any = {
      getContainer: vi.fn(() => ({
        inspect: vi.fn(async () => ({ Id: 'tmo', State: { Running: true } })),
        exec: vi.fn(async () => ({
          start: (_: any, cb: any) => {
            hijacked = out;
            out.write('pre-');
            out.write(sushi.subarray(0, 2)); // partial sequence
            // do not end; let timeout trigger
            cb(undefined, out);
          },
          inspect: vi.fn(async () => ({ ProcessConfig: { tty: true }, ExitCode: null })),
        })),
      })),
      modem: { demuxStream: vi.fn() },
    };
    (svc as any).docker = docker;

    await expect(
      svc.execContainer('tmo', 'echo', { timeoutMs: 25, idleTimeoutMs: 0, tty: true })
    ).rejects.toThrowError(/Exec timed out after/);

    // Ensure stream destroyed
    expect((hijacked as any).destroyed).toBe(true);
  });

  it('flushes decoder on idle timeout with partial multibyte and destroys stream', async () => {
    const logger = new LoggerService();
    const svc = new ContainerService(logger);
    const out = new PassThrough();
    let hijacked: PassThrough | null = null;
    const sushi = Buffer.from('🍣', 'utf8');
    const docker: any = {
      getContainer: vi.fn(() => ({
        inspect: vi.fn(async () => ({ Id: 'idle', State: { Running: true } })),
        exec: vi.fn(async () => ({
          start: (_: any, cb: any) => {
            hijacked = out;
            out.write('pre-');
            out.write(sushi.subarray(0, 2));
            // remain idle to trigger idle timeout
            cb(undefined, out);
          },
          inspect: vi.fn(async () => ({ ProcessConfig: { tty: true }, ExitCode: null })),
        })),
      })),
      modem: { demuxStream: vi.fn() },
    };
    (svc as any).docker = docker;

    await expect(
      svc.execContainer('idle', 'echo', { timeoutMs: 0, idleTimeoutMs: 25, tty: true })
    ).rejects.toThrowError(/Exec idle timed out after/);
    expect((hijacked as any).destroyed).toBe(true);
  });

  it('manual demux handles header split across chunk boundaries', async () => {
    const logger = new LoggerService();
    const svc = new ContainerService(logger);
    const hijacked = new PassThrough();

    const payload = Buffer.from('hello');
    const header = Buffer.alloc(8);
    header[0] = 1; // stdout
    header.writeUInt32BE(payload.length, 4);

    const docker: any = {
      getContainer: vi.fn(() => ({
        inspect: vi.fn(async () => ({ Id: 'split', State: { Running: true } })),
        exec: vi.fn(async () => ({
          start: (_: any, cb: any) => {
            // Force manual demux by throwing from modem.demuxStream
            // Emit header split across two chunks, then payload
            hijacked.write(header.subarray(0, 3));
            setTimeout(() => {
              hijacked.write(header.subarray(3));
              hijacked.write(payload);
              hijacked.end();
            }, 5);
            cb(undefined, hijacked as any);
          },
          inspect: vi.fn(async () => ({ ProcessConfig: { tty: false }, ExitCode: 0 })),
        })),
      })),
      modem: { demuxStream: vi.fn(() => { throw new Error('no demux'); }) },
    };
    (svc as any).docker = docker;
    const res = await svc.execContainer('split', 'echo', { timeoutMs: 2000, idleTimeoutMs: 0, tty: false });
    expect(res.stdout).toBe('hello');
    expect(res.stderr).toBe('');
  });

  it('invalid header switches to passthrough for subsequent chunks', async () => {
    const logger = new LoggerService();
    const svc = new ContainerService(logger);
    const hijacked = new PassThrough();

    const docker: any = {
      getContainer: vi.fn(() => ({
        inspect: vi.fn(async () => ({ Id: 'raw', State: { Running: true } })),
        exec: vi.fn(async () => ({
          start: (_: any, cb: any) => {
            hijacked.write(Buffer.from('plain-'));
            setTimeout(() => {
              hijacked.write(Buffer.from('text-followup'));
              hijacked.end();
            }, 5);
            cb(undefined, hijacked as any);
          },
          inspect: vi.fn(async () => ({ ProcessConfig: { tty: false }, ExitCode: 0 })),
        })),
      })),
      modem: { demuxStream: vi.fn(() => { throw new Error('no demux available'); }) },
    };
    (svc as any).docker = docker;
    const res = await svc.execContainer('raw', 'echo', { timeoutMs: 2000, idleTimeoutMs: 0, tty: false });
    expect(res.exitCode).toBe(0);
    expect(res.stderr).toBe('');
    expect(res.stdout).toContain('plain-text-followup');
  });
});
