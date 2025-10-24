import { LLM } from '@agyn/llm';
import OpenAI from 'openai';
import { ConfigService } from '../../core/services/config.service';
import { LoggerService } from '../../core/services/logger.service';
import { LLMProvisioner } from './llm.provisioner';
import { Injectable } from '@nestjs/common';

type ProvisionResult = { apiKey?: string; baseUrl?: string };

@Injectable()
export class LiteLLMProvisioner extends LLMProvisioner {
  private llm?: LLM;

  constructor(
    private cfg: ConfigService,
    private logger: LoggerService,
  ) {
  private llm?: LLM;

  constructor(
    private cfg: ConfigService,
    private logger: LoggerService,
  ) {
    super();
  }

  async getLLM(): Promise<LLM> {
    if (this.llm) return this.llm;

    const { apiKey, baseUrl } = await this.fetchOrCreateKeysInternal();
    const client = new OpenAI({ apiKey, baseURL: baseUrl });
    this.llm = new LLM(client);
    return this.llm;
  }

  private async fetchOrCreateKeysInternal(): Promise<{ apiKey: string; baseUrl?: string }> {
    // Prefer direct OpenAI if available
    if (this.cfg.openaiApiKey) {
      return { apiKey: this.cfg.openaiApiKey, baseUrl: this.cfg.openaiBaseUrl };
    }

    // Otherwise require LiteLLM config to be present for provisioning
    if (!this.cfg.litellmBaseUrl || !this.cfg.litellmMasterKey) {
      throw new Error('litellm_missing_config');
    }

    const { apiKey: provKey, baseUrl } = await this.provisionWithRetry();
    if (provKey) return { apiKey: provKey, baseUrl };

    // Fallback to configured envs
    const fallbackKey = this.cfg.litellmMasterKey as string; // ensureKeys guarantees presence
    const base =
      this.cfg.openaiBaseUrl ||
      (this.cfg.litellmBaseUrl ? `${this.cfg.litellmBaseUrl.replace(/\/$/, '')}/v1` : undefined);
    return { apiKey: fallbackKey, baseUrl: base };
  }

  private async provisionWithRetry(): Promise<ProvisionResult> {
    const base = this.cfg.litellmBaseUrl;
    const master = this.cfg.litellmMasterKey;
    if (!base || !master) return {};

    const models = this.toList(process.env.LITELLM_MODELS, ['all-team-models']);
    const duration = process.env.LITELLM_KEY_DURATION || '30d';
    const keyAlias = process.env.LITELLM_KEY_ALIAS || `agents-${process.pid}`;
    const maxBudget = process.env.LITELLM_MAX_BUDGET;
    const rpm = process.env.LITELLM_RPM_LIMIT;
    const tpm = process.env.LITELLM_TPM_LIMIT;
    const teamId = process.env.LITELLM_TEAM_ID;

    const url = `${base.replace(/\/$/, '')}/key/generate`;
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      authorization: `Bearer ${master}`,
    };
    const body: Record<string, unknown> = { models, duration, key_alias: keyAlias };
    const num = (s?: string) => {
      if (!s) return undefined;
      const n = Number(s);
      return Number.isFinite(n) && n >= 0 ? n : undefined;
    };
    const mb = num(maxBudget);
    const r = num(rpm);
    const t = num(tpm);
    if (mb !== undefined) body.max_budget = mb;
    if (r !== undefined) body.rpm_limit = r;
    if (t !== undefined) body.tpm_limit = t;
    if (typeof teamId === 'string' && teamId.length > 0) body.team_id = teamId;

    const maxAttempts = 3;
    const baseDelayMs = 300;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const resp = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
        if (!resp.ok) {
          const text = await this.safeReadText(resp);
          this.logger.error('LiteLLM provisioning failed: status=%s, body=%s', String(resp.status), this.redact(text));
          if (resp.status >= 500 && attempt < maxAttempts) {
            await this.delay(baseDelayMs * Math.pow(2, attempt - 1));
            continue;
          }
          throw new Error(`litellm_provision_failed_${resp.status}`);
        }
        const data = (await this.safeReadJson(resp)) as { key?: string } | undefined;
        const key = data?.key;
        if (!key || typeof key !== 'string') throw new Error('litellm_provision_invalid_response');
        const baseUrl = this.cfg.openaiBaseUrl || `${base.replace(/\/$/, '')}/v1`;
        return { apiKey: key, baseUrl };
      } catch (e: any) {
        if (attempt < maxAttempts) {
          this.logger.debug('LiteLLM provisioning attempt %d failed: %s', attempt, e?.message || String(e));
          await this.delay(baseDelayMs * Math.pow(2, attempt - 1));
          continue;
        }
        this.logger.error('LiteLLM provisioning failed after %d attempts', maxAttempts);
        return {};
      }
    }
    return {};
  }

  private toList(v: string | undefined, dflt: string[]): string[] {
    const parts = (v || '')
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean);
    return parts.length ? parts : dflt;
  }
  private async safeReadText(resp: Response): Promise<string> {
    try {
      return await resp.text();
    } catch {
      return '';
    }
  }
  private async safeReadJson(resp: Response): Promise<unknown> {
    try {
      return await resp.json();
    } catch {
      return undefined;
    }
  }
  private redact(s: string): string {
    if (!s) return s;
    return s.replace(/(sk-[A-Za-z0-9_\-]{6,})/g, '[REDACTED]');
  }
  private async delay(ms: number) {
    await new Promise((res) => setTimeout(res, ms));
  }
}
