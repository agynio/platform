import { describe, it, expect, vi } from 'vitest';
import { ContainerService } from '../../src/infra/container/container.service';
import type { ContainerRegistry } from '../../src/infra/container/container.registry';
import { LoggerService } from '../../src/core/services/logger.service.js';
import { ExecIdleTimeoutError } from '../../src/utils/execTimeout';

describe('ContainerService idle timeout with killOnTimeout=false', () => {
  it('does not stop container on idle timeout when killOnTimeout=false', async () => {
    const svc = new ContainerService(new LoggerService(), undefined as unknown as ContainerRegistry);
    const docker: any = {
      getContainer: vi.fn((id: string) => ({
        inspect: vi.fn(async () => ({ Id: id, State: { Running: true } })),
        stop: vi.fn(async () => {}),
        exec: vi.fn(async (_opts: any) => ({
          start: (_: any, cb: any) => cb(undefined, { on: () => {}, once: () => {}, pipe: () => {}, end: () => {} }),
          inspect: vi.fn(async () => ({})),
        })),
      })),
      modem: { demuxStream: () => {} },
    };
    (svc as any).docker = docker;
    const idleErr = new ExecIdleTimeoutError(123, '', '');
    vi.spyOn(svc as any, 'startAndCollectExec').mockRejectedValue(idleErr);

    await expect(
      svc.execContainer('cid', 'echo', { idleTimeoutMs: 123, killOnTimeout: false }),
    ).rejects.toBe(idleErr);

    // Should only call getContainer once (inspect) and not stop
    expect(docker.getContainer).toHaveBeenCalledTimes(1);
    const stoppedCalled = docker.getContainer.mock.results.some((r: any) => r.value.stop.mock.calls.length > 0);
    expect(stoppedCalled).toBe(false);
  });
});
