import { mkdir, readFile, rename, unlink, writeFile, chmod, open, stat } from 'fs/promises';
import { constants as fsConstants } from 'fs';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { setTimeout as delay } from 'timers/promises';
import { hostname as resolveHostname } from 'os';
import { randomUUID } from 'crypto';
import { Logger } from '@nestjs/common';
import { z } from 'zod';

export interface StoredLiteLLMServiceToken {
  token: string;
  alias: string;
  team_id?: string;
  base_url?: string;
  created_at?: string;
}

const tokenSchema = z.object({
  token: z.string().min(1),
  alias: z.string().min(1),
  team_id: z.string().min(1).optional(),
  base_url: z.string().min(1).optional(),
  created_at: z.string().min(1).optional(),
});

export interface LiteLLMTokenStorePaths {
  tokenPath: string;
  lockPath: string;
}

export interface LiteLLMTokenStoreOptions {
  paths?: Partial<LiteLLMTokenStorePaths>;
  lockMaxAttempts?: number;
  lockBaseDelayMs?: number;
  lockStaleThresholdMs?: number;
  logger?: Logger;
}

const DEFAULT_TOKEN_PATH = fileURLToPath(
  new URL('../../../config/secrets/litellm/service_token.json', import.meta.url),
);
const DEFAULT_LOCK_PATH = fileURLToPath(
  new URL('../../../config/secrets/litellm/service_token.lock', import.meta.url),
);

export class LiteLLMTokenStore {
  private readonly tokenPath: string;
  private readonly lockPath: string;
  private readonly maxAttempts: number;
  private readonly baseDelayMs: number;
  private readonly staleThresholdMs: number;
  private readonly hostname: string;
  private readonly instanceId: string;
  private readonly logger?: Logger;

  constructor(options: LiteLLMTokenStoreOptions = {}) {
    const {
      paths,
      lockMaxAttempts = 40,
      lockBaseDelayMs = 50,
      lockStaleThresholdMs = 60_000,
      logger,
    } = options;
    this.tokenPath = paths?.tokenPath ?? DEFAULT_TOKEN_PATH;
    this.lockPath = paths?.lockPath ?? DEFAULT_LOCK_PATH;
    this.maxAttempts = lockMaxAttempts;
    this.baseDelayMs = lockBaseDelayMs;
    this.staleThresholdMs = lockStaleThresholdMs;
    this.hostname = resolveHostname();
    this.instanceId = randomUUID();
    this.logger = logger;
  }

  get paths(): LiteLLMTokenStorePaths {
    return { tokenPath: this.tokenPath, lockPath: this.lockPath };
  }

  async read(): Promise<StoredLiteLLMServiceToken | undefined> {
    try {
      const raw = await readFile(this.tokenPath, 'utf8');
      const parsed = JSON.parse(raw) as unknown;
      return tokenSchema.parse(parsed);
    } catch (error) {
      if (this.isNotFound(error)) return undefined;
      throw error;
    }
  }

  async write(record: StoredLiteLLMServiceToken): Promise<void> {
    tokenSchema.parse(record);
    await this.ensureDirectory();
    const tempPath = `${this.tokenPath}.${process.pid}.${Date.now()}.tmp`;
    const data = `${JSON.stringify(record, null, 2)}\n`;
    await writeFile(tempPath, data, { mode: 0o600, flag: 'w' });
    await chmod(tempPath, 0o600);
    await rename(tempPath, this.tokenPath);
    await chmod(this.tokenPath, 0o600);
  }

  async remove(): Promise<void> {
    try {
      await unlink(this.tokenPath);
    } catch (error) {
      if (this.isNotFound(error)) return;
      throw error;
    }
  }

  async withLock<T>(fn: () => Promise<T>): Promise<T> {
    await this.ensureDirectory();
    const handle = await this.acquireLock();
    try {
      return await fn();
    } finally {
      await handle.close().catch(() => {});
      await unlink(this.lockPath).catch(() => {});
    }
  }

  private async ensureDirectory(): Promise<void> {
    const dir = dirname(this.tokenPath);
    await mkdir(dir, { recursive: true, mode: 0o700 });
  }

  private async acquireLock(): Promise<import('fs/promises').FileHandle> {
    const dir = dirname(this.lockPath);
    await mkdir(dir, { recursive: true, mode: 0o700 });
    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      try {
        const handle = await open(
          this.lockPath,
          fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_RDWR,
          0o600,
        );
        await this.writeLockMetadata(handle);
        return handle;
      } catch (error) {
        if (!this.isAlreadyExists(error)) throw error;
        const recovered = await this.tryRecoverStaleLock();
        if (recovered) {
          // Try again immediately after cleanup
          attempt -= 1;
          continue;
        }
        if (attempt === this.maxAttempts) {
          throw new Error('litellm_service_token_lock_timeout');
        }
        const sleep = this.baseDelayMs * attempt;
        await delay(sleep);
      }
    }
    throw new Error('litellm_service_token_lock_timeout');
  }

  private async writeLockMetadata(handle: import('fs/promises').FileHandle): Promise<void> {
    const metadata: LockMetadata = {
      pid: process.pid,
      hostname: this.hostname,
      acquired_at: new Date().toISOString(),
      instance_id: this.instanceId,
    };
    await handle.truncate(0).catch(() => {});
    await handle.writeFile(`${JSON.stringify(metadata)}\n`);
    await handle.sync().catch(() => {});
  }

  private async tryRecoverStaleLock(): Promise<boolean> {
    try {
      const raw = await readFile(this.lockPath, 'utf8');
      const meta = this.safeParseMetadata(raw);
      const ageMs = await this.computeLockAge(meta?.acquired_at);
      const sameHost = meta?.hostname && meta.hostname === this.hostname;

      const staleByAge = ageMs !== undefined && ageMs > this.staleThresholdMs;
      const staleByDeadPid =
        sameHost && typeof meta?.pid === 'number' && meta.pid > 0 && !this.isProcessAlive(meta.pid);

      if (staleByDeadPid || staleByAge) {
        await unlink(this.lockPath).catch(() => {});
        this.logger?.warn(
          `LiteLLM token lock recovered ${JSON.stringify({
            reason: staleByDeadPid ? 'dead_pid' : 'stale_age',
            pid: meta?.pid,
            hostname: meta?.hostname,
            age_ms: ageMs,
            instance_id: meta?.instance_id,
          })}`,
        );
        return true;
      }
    } catch (error) {
      const ageMs = await this.computeLockAge();
      if (ageMs !== undefined && ageMs > this.staleThresholdMs) {
        await unlink(this.lockPath).catch(() => {});
        this.logger?.warn(
          `LiteLLM token lock recovered ${JSON.stringify({ reason: 'unreadable', age_ms: ageMs })}`,
        );
        return true;
      }
      if (this.isNotFound(error)) {
        return false;
      }
      // If read failed for another reason and not stale, surface last error
      this.logger?.warn(
        `LiteLLM token lock read failed ${JSON.stringify({ error: this.describeError(error) })}`,
      );
    }
    return false;
  }

  private safeParseMetadata(raw: string | undefined): LockMetadata | undefined {
    if (!raw) return undefined;
    try {
      const parsed = JSON.parse(raw) as LockMetadata;
      if (!parsed || typeof parsed !== 'object') return undefined;
      return parsed;
    } catch {
      return undefined;
    }
  }

  private async computeLockAge(acquiredAt?: string): Promise<number | undefined> {
    if (acquiredAt) {
      const parsed = Date.parse(acquiredAt);
      if (!Number.isNaN(parsed)) {
        return Date.now() - parsed;
      }
    }
    try {
      const stats = await stat(this.lockPath);
      return Date.now() - stats.mtimeMs;
    } catch (error) {
      if (this.isNotFound(error)) return undefined;
      return undefined;
    }
  }

  private isProcessAlive(pid: number): boolean {
    try {
      process.kill(pid, 0);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code === 'ESRCH') return false;
      // Lack of permission implies process exists but inaccessible
      return true;
    }
  }

  private isNotFound(error: unknown): boolean {
    return Boolean((error as NodeJS.ErrnoException)?.code === 'ENOENT');
  }

  private isAlreadyExists(error: unknown): boolean {
    return Boolean((error as NodeJS.ErrnoException)?.code === 'EEXIST');
  }

  private describeError(error: unknown): string {
    if (error instanceof Error) return error.message;
    if (typeof error === 'string') return error;
    return JSON.stringify(error);
  }
}

interface LockMetadata {
  pid: number;
  hostname: string;
  acquired_at: string;
  instance_id?: string;
}
