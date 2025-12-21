import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TerminalSessionsService } from '../src/infra/container/terminal.sessions.service';
import type { WorkspaceProvider } from '../src/workspace/providers/workspace.provider';

describe('TerminalSessionsService', () => {
  let provider: Pick<WorkspaceProvider, 'exec'>;
  let service: TerminalSessionsService;

  beforeEach(() => {
    vi.useFakeTimers();
    provider = {
      exec: vi.fn().mockResolvedValue({ stdout: '/bin/bash\n', stderr: '', exitCode: 0 }) as unknown,
    } as Pick<WorkspaceProvider, 'exec'>;
    service = new TerminalSessionsService(provider as WorkspaceProvider);
  });

  afterEach(() => {
    service.onModuleDestroy();
    vi.useRealTimers();
  });

  it('creates sessions with detected shell and validates tokens', async () => {
    const result = await service.createSession('abc123', { cols: 80, rows: 24 });
    expect(result.sessionId).toBeTruthy();
    expect(result.wsUrl).toContain(result.sessionId);
    expect(result.negotiated.shell).toBe('/bin/bash');
    expect(provider.exec).toHaveBeenCalledWith('abc123', {
      command: ['/bin/sh', '-lc', expect.stringContaining('command -v bash')],
      timeoutMs: expect.any(Number),
    });

    const record = service.validate(result.sessionId, result.token);
    expect(record.workspaceId).toBe('abc123');
    service.markConnected(result.sessionId);
    service.touch(result.sessionId);
    expect(service.get(result.sessionId)).toBeDefined();
  });

  it('prunes sessions exceeding idle timeout', async () => {
    const result = await service.createSession('cid', {});
    const record = service.get(result.sessionId);
    expect(record).toBeDefined();
    if (record) {
      record.lastActivityAt -= record.idleTimeoutMs + 1_000;
    }

    // Trigger the internal prune loop manually
    (service as unknown as { prune(): void }).prune();

    expect(service.get(result.sessionId)).toBeUndefined();
  });

  it('throws when validating with wrong token', async () => {
    const result = await service.createSession('cid', {});
    expect(() => service.validate(result.sessionId, 'bad-token')).toThrow('invalid_token');
  });
});
