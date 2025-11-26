import { describe, it, expect, vi } from 'vitest';
import { ContainerService } from '../../src/infra/container/container.service';
import { LoggerService } from '../../src/core/services/logger.service';
import type { ContainerRegistry } from '../../src/infra/container/container.registry';

const makeRegistry = () => ({
  registerStart: vi.fn(async () => undefined),
  updateLastUsed: vi.fn(async () => undefined),
  markStopped: vi.fn(async () => undefined),
  markTerminating: vi.fn(async () => undefined),
  claimForTermination: vi.fn(async () => true),
  recordTerminationFailure: vi.fn(async () => undefined),
  findByVolume: vi.fn(async () => null),
  listByThread: vi.fn(async () => []),
  ensureIndexes: vi.fn(async () => undefined),
} satisfies Partial<ContainerRegistry>) as ContainerRegistry;

describe('ContainerService idle timeout disable', () => {
  it('does not trigger idle timeout when idleTimeoutMs=0', async () => {
    const svc = new ContainerService(makeRegistry(), new LoggerService());

    const fakeStream: any = {
      on: vi.fn((evt: string, cb: (...args: unknown[]) => unknown) => {
        if (evt === 'end') {
          // end soon after start
          setTimeout(() => cb(), 50);
        }
        return fakeStream;
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
      modem: { demuxStream: vi.fn(() => {}) },
    };

    (svc as any).docker = docker;
    const res = await svc.execContainer('cid', 'echo test', { timeoutMs: 2000, idleTimeoutMs: 0 });
    expect(res.exitCode).toBe(0);
  });
});
