import { Inject, Injectable } from '@nestjs/common';
import { LoggerService } from '../../core/services/logger.service';
import { ConfigService } from '../../core/services/config.service';
import type { Dispatcher } from 'undici';
import { Agent } from 'undici';
import { readFileSync } from 'node:fs';

const KEY_RE = /^[A-Za-z0-9._-]+:[A-Za-z0-9+/=]+$/;

@Injectable()
export class NcpsKeyService {
  private currentKey?: string;
  private previousKey?: string;
  private prevUntil?: number; // epoch ms when dual-key grace ends
  private timer?: NodeJS.Timeout;
  private inited = false;
  private isRefreshing = false;
  private _fetch: (
    input: RequestInfo | URL,
    init?: RequestInit & { dispatcher?: import('undici').Dispatcher },
  ) => Promise<Response> = (input, init) => fetch(input, init);

  constructor(
    @Inject(ConfigService) private cfg: ConfigService,
    @Inject(LoggerService) private logger: LoggerService,
  ) {}

  hasKey(): boolean {
    return typeof this.currentKey === 'string' && this.currentKey.length > 0;
  }

  getCurrentKey(): string | undefined {
    return this.currentKey;
  }

  getKeysForInjection(): string[] {
    const keys: string[] = [];
    if (this.currentKey) keys.push(this.currentKey);
    if (this.previousKey && typeof this.prevUntil === 'number' && Date.now() < this.prevUntil) {
      // inject previous key during rotation grace
      if (!keys.includes(this.previousKey)) keys.unshift(this.previousKey);
    }
    return keys;
  }

  async init(): Promise<void> {
    if (!this.cfg.ncpsEnabled) {
      this.logger.info('NcpsKeyService disabled by config');
      this.inited = true;
      return;
    }
    const ok = await this.fetchWithRetries();
    if (!ok) {
      const allow = this.cfg.ncpsAllowStartWithoutKey !== false;
      const msg = 'NcpsKeyService failed to obtain key during startup';
      if (allow) this.logger.error(`${msg}; continuing without injection`);
      else throw new Error(msg);
    }
    this.scheduleRefresh();
    this.inited = true;
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  private scheduleRefresh(): void {
    const interval = this.cfg.ncpsRefreshIntervalMs;
    if (!Number.isFinite(interval) || interval <= 0) return;
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => {
      if (this.isRefreshing) return;
      this.isRefreshing = true;
      this.fetchWithRetries()
        .catch((e) => this.logger.error('NcpsKeyService refresh error: %s', (e as Error)?.message || String(e)))
        .finally(() => {
          this.isRefreshing = false;
        });
    }, interval).unref?.();
  }

  private async fetchWithRetries(): Promise<boolean> {
    const maxRetries = Math.max(0, this.cfg.ncpsStartupMaxRetries);
    const base = Math.max(1, this.cfg.ncpsRetryBackoffMs);
    const factor = Math.max(1, this.cfg.ncpsRetryBackoffFactor);
    let attempt = 0;
    while (true) {
      attempt++;
      try {
        const key = await this.fetchOnce();
        if (key && key !== this.currentKey) {
          this.rotateKey(key);
        }
        return !!key;
      } catch (e) {
        const msg = (e as Error)?.message || String(e);
        const nextDelay = base * Math.pow(factor, attempt - 1);
        if (attempt > maxRetries) {
          this.logger.error('NcpsKeyService fetch failed: %s (giving up)', msg);
          return false;
        }
        this.logger.debug(
          'NcpsKeyService fetch failed (attempt %d/%d): %s; retrying in %dms',
          attempt,
          maxRetries,
          msg,
          nextDelay,
        );
        await new Promise((r) => setTimeout(r, nextDelay));
      }
    }
  }

  private rotateKey(key: string): void {
    if (this.currentKey) {
      this.previousKey = this.currentKey;
      const minutes = Math.max(0, this.cfg.ncpsRotationGraceMinutes);
      this.prevUntil = minutes > 0 ? Date.now() + minutes * 60_000 : 0;
    }
    this.currentKey = key;
    this.logger.info('NcpsKeyService updated key (length=%d)', key.length);
  }

  // Allow tests to inject a fetch shim with an undici dispatcher
  setFetchImpl(
    fn: (
      input: RequestInfo | URL,
      init?: RequestInit & { dispatcher?: import('undici').Dispatcher },
    ) => Promise<Response>,
  ) {
    this._fetch = fn;
  }
  async triggerRefreshOnce(): Promise<boolean> {
    if (this.isRefreshing) return false;
    this.isRefreshing = true;
    try {
      return await this.fetchWithRetries();
    } finally {
      this.isRefreshing = false;
    }
  }
  seedKeyForTest(key: string) {
    this.currentKey = key;
  }

  private buildDispatcher(url: string, caPath?: string): Dispatcher | undefined {
    if (!/^https:/i.test(url)) return undefined;
    if (!caPath) return undefined;
    const pem = readFileSync(caPath, 'utf8');
    return new Agent({ connect: { ca: pem } });
  }

  private async fetchOnce(): Promise<string> {
    // Always use the server-reachable URL for runtime HTTP requests
    const url = `${this.cfg.ncpsUrlServer}${this.cfg.ncpsPubkeyPath}`;
    const ac = new AbortController();
    const tid = setTimeout(() => ac.abort(), this.cfg.ncpsFetchTimeoutMs);
    try {
      const headers: Record<string, string> = { Accept: 'text/plain' };
      // Optional auth header or token
      if (this.cfg.ncpsAuthHeader && this.cfg.ncpsAuthToken) {
        headers[this.cfg.ncpsAuthHeader] = this.cfg.ncpsAuthToken;
      }

      const dispatcher = this.buildDispatcher(url, this.cfg.ncpsCaBundle);
      const res = await this._fetch(url, { signal: ac.signal, headers, dispatcher });
      if (!res.ok) {
        // Do not include response body in error to avoid leaking
        throw new Error(`http_${res.status}`);
      }
      const text = (await res.text()).trim();
      // Validate
      if (text.length === 0) throw new Error('empty_response');
      if (text.length > 4096) throw new Error('oversize');
      if (!KEY_RE.test(text)) throw new Error('invalid_format');
      return text;
    } finally {
      clearTimeout(tid);
    }
  }
}
