import { readFile } from 'node:fs/promises';
import { LoggerService } from './logger.service';
import { ConfigService } from './config.service';

const KEY_RE = /^[A-Za-z0-9._-]+:[A-Za-z0-9+/=]+$/;

export class NcpsKeyService {
  private currentKey?: string;
  private previousKey?: string;
  private prevUntil?: number; // epoch ms when dual-key grace ends
  private timer?: NodeJS.Timeout;
  private inited = false;

  constructor(private cfg: ConfigService, private logger = new LoggerService()) {}

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
      this.fetchWithRetries().catch((e) =>
        this.logger.error('NcpsKeyService refresh error: %s', (e as Error)?.message || String(e)),
      );
    }, interval).unref?.();
  }

  private async fetchWithRetries(): Promise<boolean> {
    const maxRetries = Math.max(0, Number(this.cfg.ncpsStartupMaxRetries) || 0);
    const base = Math.max(1, Number(this.cfg.ncpsRetryBackoffMs) || 500);
    const factor = Math.max(1, Number(this.cfg.ncpsRetryBackoffFactor) || 2);
    let attempt = 0;
    while (true) {
      attempt++;
      try {
        const key = await this.fetchOnce();
        if (key && key !== this.currentKey) {
          // rotate
          if (this.currentKey) {
            this.previousKey = this.currentKey;
            const minutes = Math.max(0, Number(this.cfg.ncpsRotationGraceMinutes) || 0);
            this.prevUntil = minutes > 0 ? Date.now() + minutes * 60_000 : 0;
          }
          this.currentKey = key;
          this.logger.info('NcpsKeyService updated key (length=%d)', key.length);
        }
        return !!key;
      } catch (e) {
        const msg = (e as Error)?.message || String(e);
        const nextDelay = base * Math.pow(factor, attempt - 1);
        if (attempt > maxRetries) {
          this.logger.error('NcpsKeyService fetch failed: %s (giving up)', msg);
          return false;
        }
        this.logger.debug('NcpsKeyService fetch failed (attempt %d/%d): %s; retrying in %dms', attempt, maxRetries, msg, nextDelay);
        await new Promise((r) => setTimeout(r, nextDelay));
      }
    }
  }

  private async fetchOnce(): Promise<string> {
    const url = `${this.cfg.ncpsUrl}${this.cfg.ncpsPubkeyPath}`;
    const ac = new AbortController();
    const tid = setTimeout(() => ac.abort(), this.cfg.ncpsFetchTimeoutMs);
    try {
      const headers: Record<string, string> = { Accept: 'text/plain' };
      // Optional auth header or token
      if (this.cfg.ncpsAuthHeader && this.cfg.ncpsAuthToken) {
        headers[this.cfg.ncpsAuthHeader] = this.cfg.ncpsAuthToken;
      }

      // Optional custom CA bundle for https
      let agent: any = undefined;
      if (/^https:/i.test(url) && this.cfg.ncpsCaBundle) {
        const pem = await readFile(this.cfg.ncpsCaBundle, 'utf8');
        const https = await import('node:https');
        agent = new https.Agent({ ca: pem });
      }

      const res = await fetch(url, { signal: ac.signal, headers, // @ts-ignore node-fetch supports agent
        agent });
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(`http_${res.status}:${txt.slice(0, 200)}`);
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

