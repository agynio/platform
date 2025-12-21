import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { randomBytes, randomUUID } from 'node:crypto';
import { WorkspaceProvider } from '../../workspace/providers/workspace.provider';

const DEFAULT_IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const DEFAULT_MAX_DURATION_MS = 30 * 60 * 1000; // 30 minutes
const MIN_COLS = 40;
const MAX_COLS = 400;
const MIN_ROWS = 10;
const MAX_ROWS = 200;

type SessionState = 'pending' | 'connected';

export type TerminalSessionRecord = {
  sessionId: string;
  token: string;
  workspaceId: string;
  shell: string;
  cols: number;
  rows: number;
  createdAt: number;
  lastActivityAt: number;
  idleTimeoutMs: number;
  maxDurationMs: number;
  state: SessionState;
};

type CreateSessionOptions = {
  cols?: number;
  rows?: number;
  shell?: string;
};

@Injectable()
export class TerminalSessionsService implements OnModuleDestroy {
  private readonly sessions = new Map<string, TerminalSessionRecord>();
  private readonly cleanupTimer: NodeJS.Timeout;
  private readonly logger = new Logger(TerminalSessionsService.name);

  constructor(@Inject(WorkspaceProvider) private readonly workspaceProvider: WorkspaceProvider) {
    this.cleanupTimer = setInterval(() => {
      try {
        this.prune();
      } catch (err) {
        this.logger.warn('terminal session prune failure', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }, 60_000);
    if (typeof this.cleanupTimer.unref === 'function') this.cleanupTimer.unref();
  }

  async createSession(
    workspaceId: string,
    options: CreateSessionOptions = {},
  ): Promise<{
    sessionId: string;
    token: string;
    wsUrl: string;
    expiresAt: string;
    negotiated: { shell: string; cols: number; rows: number };
  }> {
    const cols = clamp(Math.trunc(options.cols ?? 120), MIN_COLS, MAX_COLS);
    const rows = clamp(Math.trunc(options.rows ?? 32), MIN_ROWS, MAX_ROWS);

    const shell = (await this.determineShell(workspaceId, options.shell)).trim();
    if (!shell) throw new Error('shell_detection_failed');

    const sessionId = randomUUID();
    const token = randomBytes(24).toString('hex');
    const now = Date.now();
    const record: TerminalSessionRecord = {
      sessionId,
      token,
      workspaceId,
      shell,
      cols,
      rows,
      createdAt: now,
      lastActivityAt: now,
      idleTimeoutMs: DEFAULT_IDLE_TIMEOUT_MS,
      maxDurationMs: DEFAULT_MAX_DURATION_MS,
      state: 'pending',
    };

    this.sessions.set(sessionId, record);

    const wsUrl = `/api/containers/${workspaceId}/terminal/ws?sessionId=${sessionId}&token=${token}`;
    const expiresAt = new Date(now + record.maxDurationMs).toISOString();
    return {
      sessionId,
      token,
      wsUrl,
      expiresAt,
      negotiated: { shell, cols, rows },
    };
  }

  validate(sessionId: string, token: string): TerminalSessionRecord {
    const record = this.sessions.get(sessionId);
    if (!record) throw new Error('session_not_found');
    if (record.token !== token) throw new Error('invalid_token');
    const now = Date.now();
    if (now - record.createdAt >= record.maxDurationMs) {
      this.sessions.delete(sessionId);
      throw new Error('session_expired');
    }
    if (now - record.lastActivityAt >= record.idleTimeoutMs) {
      this.sessions.delete(sessionId);
      throw new Error('session_idle_timeout');
    }
    return record;
  }

  get(sessionId: string): TerminalSessionRecord | undefined {
    return this.sessions.get(sessionId);
  }

  markConnected(sessionId: string): void {
    const record = this.sessions.get(sessionId);
    if (!record) throw new Error('session_not_found');
    if (record.state === 'connected') throw new Error('session_already_connected');
    record.state = 'connected';
    record.lastActivityAt = Date.now();
    this.sessions.set(sessionId, record);
  }

  touch(sessionId: string): void {
    const record = this.sessions.get(sessionId);
    if (!record) return;
    record.lastActivityAt = Date.now();
    this.sessions.set(sessionId, record);
  }

  close(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  onModuleDestroy(): void {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
    this.sessions.clear();
  }

  private prune(): void {
    const now = Date.now();
    for (const [sessionId, record] of this.sessions.entries()) {
      const expired = now - record.createdAt >= record.maxDurationMs;
      const idle = now - record.lastActivityAt >= record.idleTimeoutMs;
      if (expired || idle) {
        this.logger.log('pruning terminal session', {
          sessionId,
          workspaceId: record.workspaceId.substring(0, 12),
          reason: expired ? 'max_duration' : 'idle_timeout',
        });
        this.sessions.delete(sessionId);
      }
    }
  }

  private async determineShell(workspaceId: string, preferred?: string): Promise<string> {
    const trimmed = preferred?.trim();
    if (trimmed) return trimmed;
    const fallback = '/bin/sh';
    const detectScript = `if [ -x /bin/bash ]; then echo /bin/bash; ` +
      `elif command -v bash >/dev/null 2>&1; then command -v bash; ` +
      `elif command -v sh >/dev/null 2>&1; then command -v sh; ` +
      `else echo ${fallback}; fi`;
    try {
      const { stdout } = await this.workspaceProvider.exec(workspaceId, {
        command: ['/bin/sh', '-lc', detectScript],
        timeoutMs: 5_000,
      });
      const detected = stdout.split('\n').map((line) => line.trim()).filter(Boolean)[0];
      return detected || fallback;
    } catch (err) {
      this.logger.warn('terminal shell detection failed', {
        workspaceId: workspaceId.substring(0, 12),
        error: err instanceof Error ? err.message : String(err),
      });
      if (err instanceof Error && err.message.includes('not running')) throw err;
      return fallback;
    }
  }
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}
