import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { LoggerService } from '../core/services/logger.service';
import { ConfigService } from '../core/services/config.service';

// Typed KV v2 response shapes
type KvV2MountsResponse = Record<string, { type?: string; options?: { version?: string | number } }>;
type KvV2ListPathsResponse = { data?: { keys?: string[] } };
type KvV2ReadResponse = { data?: { data?: Record<string, unknown> } };
type KvV2WriteResponse = { data?: { metadata?: { version?: number | string } } };

export const VaultConfigSchema = z
  .object({
    enabled: z.boolean().default(false),
    addr: z.string().url().optional().describe('Vault base URL, e.g. http://localhost:8200'),
    token: z.string().optional(),
    timeoutMs: z.number().int().positive().optional().default(5000),
    defaultMounts: z.array(z.string()).optional().default(['secret']),
  })
  .strict();

export type VaultConfig = z.infer<typeof VaultConfigSchema>;

export type VaultRef = { mount: string; path: string; key: string };

// Minimal Vault KV v2 client used by server endpoints and runtime secret resolution.
// Notes:
// - Endpoints only return lists/metadata (never secret values).
// - getSecret returns a single key's value for server-side injection only.
@Injectable()
export class VaultService {
  constructor(
    @Inject(ConfigService) private configService: ConfigService,
    @Inject(LoggerService) private logger: LoggerService,
  ) {}

  private get base(): string {
    if (!this.configService.vaultAddr) throw new Error('Vault address not configured');
    return this.configService.vaultAddr;
  }

  private get headers(): Record<string, string> {
    if (!this.configService.vaultToken) throw new Error('Vault token not configured');
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    h['X-Vault-Token'] = this.configService.vaultToken;
    return h;
  }

  private async http<T>(path: string, init?: RequestInit): Promise<T> {
    const url = `${this.base}${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const res = await fetch(url, {
        ...init,
        signal: controller.signal,
        headers: { ...(init?.headers || {}), ...this.headers },
      });
      if (!res.ok) {
        const body = await safeJson(res);
        const err = new Error(`Vault HTTP ${res.status}: ${JSON.stringify(body || {})}`) as Error & {
          statusCode?: number;
        };
        err.statusCode = res.status;
        throw err;
      }
      const data = (await safeJson(res)) as T;
      return data;
    } finally {
      clearTimeout(timer);
    }
  }

  // List KV v2 mounts by inspecting sys/mounts
  async listKvV2Mounts(): Promise<string[]> {
    try {
      const resp = await this.http<KvV2MountsResponse>('/v1/sys/mounts', { method: 'GET' });
      const items: string[] = [];
      for (const [name, meta] of Object.entries(resp || {})) {
        // name ends with '/'
        const n = name.replace(/\/$/, '');
        const type = meta?.type;
        const version = meta?.options?.version;
        if (type === 'kv' && String(version) === '2') items.push(n);
      }
      items.sort();
      return items;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger?.debug?.('Vault list mounts failed: %s', msg);
      return [];
    }
  }

  // List metadata paths under a KV v2 mount. Returns folder-like names as Vault emits them (may end with '/').
  async listPaths(mount: string, prefix: string): Promise<string[]> {
    const m = (mount || 'secret').replace(/\/$/, '');
    const p = (prefix || '').replace(/^\//, '');
    try {
      const resp = await this.http<KvV2ListPathsResponse>(
        `/v1/${encodeURIComponent(m)}/metadata/${encodePath(p)}?list=true`,
        {
          method: 'GET',
        },
      );
      const keys: string[] = Array.isArray(resp?.data?.keys) ? resp.data!.keys! : [];
      return keys;
    } catch (e: unknown) {
      // 404 for non-existent folder -> return empty list
      const sc = (e as { statusCode?: number }).statusCode;
      if (sc === 404) return [];
      const msg = e instanceof Error ? e.message : String(e);
      this.logger?.debug?.('Vault list paths failed: %s', msg);
      return [];
    }
  }

  // List key names within a specific secret object without returning values.
  async listKeys(mount: string, path: string): Promise<string[]> {
    const m = (mount || 'secret').replace(/\/$/, '');
    const p = (path || '').replace(/^\//, '');
    try {
      const resp = await this.http<KvV2ReadResponse>(`/v1/${encodeURIComponent(m)}/data/${encodePath(p)}`, {
        method: 'GET',
      });
      const obj = resp?.data?.data || {};
      return Object.keys(obj).sort();
    } catch (e: unknown) {
      const sc = (e as { statusCode?: number }).statusCode;
      if (sc === 404) return [];
      const msg = e instanceof Error ? e.message : String(e);
      this.logger?.debug?.('Vault list keys failed: %s', msg);
      return [];
    }
  }

  // Resolve a single key value for server-side use only.
  async getSecret(ref: VaultRef): Promise<string | undefined> {
    const m = (ref.mount || 'secret').replace(/\/$/, '');
    const p = (ref.path || '').replace(/^\//, '');
    try {
      const resp = await this.http<KvV2ReadResponse>(`/v1/${encodeURIComponent(m)}/data/${encodePath(p)}`, {
        method: 'GET',
      });
      const obj = resp?.data?.data || {};
      const v = obj[ref.key];
      if (v == null) return undefined;
      return typeof v === 'string' ? v : String(v);
    } catch (e: unknown) {
      // Surface minimal info; callers may choose fallback behavior.
      const err = new Error('Vault secret read failed') as Error & { statusCode?: number };
      err.statusCode = (e as { statusCode?: number }).statusCode;
      throw err;
    }
  }

  // Write-only update for a single key in a KV v2 secret object. Returns metadata version.
  async setSecret(ref: VaultRef, value: string): Promise<{ version: number }> {
    const m = (ref.mount || 'secret').replace(/\/$/, '');
    const p = (ref.path || '').replace(/^\//, '');
    let existing: Record<string, unknown> = {};
    try {
      const resp = await this.http<KvV2ReadResponse>(`/v1/${encodeURIComponent(m)}/data/${encodePath(p)}`, {
        method: 'GET',
      });
      existing = resp?.data?.data || {};
    } catch (e: unknown) {
      const sc = (e as { statusCode?: number }).statusCode;
      if (sc !== 404) {
        const err = new Error('Vault secret read failed') as Error & { statusCode?: number };
        err.statusCode = sc;
        throw err;
      }
      existing = {};
    }

    // Merge without logging secret value
    const next = { ...existing, [ref.key]: value } as Record<string, unknown>;
    const writeResp = await this.http<KvV2WriteResponse>(`/v1/${encodeURIComponent(m)}/data/${encodePath(p)}`, {
      method: 'POST',
      body: JSON.stringify({ data: next }),
    });
    const versionRaw = writeResp?.data?.metadata?.version;
    const version = typeof versionRaw === 'number' ? versionRaw : Number(versionRaw || 0) || 0;
    return { version };
  }
}

async function safeJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return undefined;
  }
}

function encodePath(p: string): string {
  // Encode each segment but preserve '/'
  return p
    .split('/')
    .filter((s) => s.length > 0)
    .map((s) => encodeURIComponent(s))
    .join('/');
}
