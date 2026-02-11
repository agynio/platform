import { LLM } from '@agyn/llm';
import { Inject, Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { ConfigService } from '../../core/services/config.service';
import { LLMProvisioner } from './llm.provisioner';
import { LiteLLMKeyStore } from './litellm.key.store';

type ProvisionContext = 'startup' | 'refresh' | 'auth_error';
type VirtualKeyState = { key: string; expiresAt: Date | null };

const MIN_REFRESH_DELAY_MS = 60_000;
const REFRESH_GRACE_MS = 5 * 60_000;
const REFRESH_RETRY_BASE_DELAY_MS = 15_000;
const REFRESH_RETRY_MAX_DELAY_MS = 5 * 60_000;

@Injectable()
export class LiteLLMProvisioner extends LLMProvisioner {
  private readonly logger = new Logger(LiteLLMProvisioner.name);
  private readonly fetchImpl: typeof fetch;
  private readonly keyStore: LiteLLMKeyStore;
  private readonly keyAlias: string;

  private llm?: LLM;
  private readyPromise?: Promise<void>;
  private refreshPromise?: Promise<void>;
  private refreshTimer?: NodeJS.Timeout;
  private currentKey?: VirtualKeyState;
  private readonly shutdownHandlers: Array<{ signal: NodeJS.Signals; handler: () => void }> = [];
  private baseUrl?: string;

  constructor(
    @Inject(ConfigService) private readonly cfg: ConfigService,
    @Inject(LiteLLMKeyStore) keyStore: LiteLLMKeyStore,
    fetchImpl?: typeof fetch,
  ) {
    super();
    ConfigService.assertInitialized(cfg);
    if (!keyStore) {
      throw new Error('LiteLLMProvisioner missing LiteLLMKeyStore dependency');
    }
    this.keyStore = keyStore;
    this.fetchImpl = fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.keyAlias = 'agyn_key';
  }

  init(): Promise<void> {
    if (!this.readyPromise) {
      this.readyPromise = this.initialize();
    }
    return this.readyPromise;
  }

  async getLLM(): Promise<LLM> {
    await this.init();
    if (!this.llm) throw new Error('litellm_llm_uninitialized');
    return this.llm;
  }

  async teardown(): Promise<void> {
    this.clearRefreshTimer();
    this.removeShutdownHooks();
  }

  private async initialize(): Promise<void> {
    this.ensureLiteLLMConfig();
    await this.bootstrapVirtualKey();
    this.registerShutdownHooks();
  }

  private ensureLiteLLMConfig(): void {
    if (!this.cfg.litellmBaseUrl || !this.cfg.litellmMasterKey) {
      throw new Error('litellm_missing_config');
    }
    this.baseUrl = `${this.cfg.litellmBaseUrl.replace(/\/$/, '')}/v1`;
  }

  private async bootstrapVirtualKey(): Promise<void> {
    const persisted = await this.keyStore.load(this.keyAlias);
    if (persisted?.key) {
      await this.revokeKey(persisted.key, 'startup');
    }

    const state = await this.generateAndPersistKey('startup');
    this.applyKeyState(state);
    this.ensureOpenAIClient();
  }

  private ensureOpenAIClient(): void {
    if (this.llm) return;
    if (!this.baseUrl) throw new Error('litellm_missing_base_url');
    const client = new OpenAI({
      apiKey: 'virtual-key-managed-by-agents',
      baseURL: this.baseUrl,
      fetch: this.buildOpenAIFetch(),
    });
    this.llm = new LLM(client);
  }

  private buildOpenAIFetch(): typeof fetch {
    return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const sourceRequest = new Request(input as RequestInfo, init);
      const firstAttempt = this.cloneWithAuthorization(sourceRequest.clone(), this.requireActiveKey());
      let response = await this.fetchImpl(firstAttempt);

      if (this.shouldRetry(response.status)) {
        const reProvisioned = await this.handleAuthFailure(response.status);
        if (reProvisioned) {
          const retryRequest = this.cloneWithAuthorization(sourceRequest.clone(), this.requireActiveKey());
          response = await this.fetchImpl(retryRequest);
        }
      }

      return response;
    };
  }

  private cloneWithAuthorization(request: Request, key: string): Request {
    const headers = new Headers(request.headers);
    headers.set('authorization', `Bearer ${key}`);
    return new Request(request, { headers });
  }

  private shouldRetry(status: number): boolean {
    return status === 401 || status === 403;
  }

  private async handleAuthFailure(status: number): Promise<boolean> {
    try {
      this.logger.warn(`LiteLLM auth failure detected, reprovisioning ${JSON.stringify({ status })}`);
      await this.refreshKey('auth_error');
      return true;
    } catch (error) {
      this.logger.error('LiteLLM reprovisioning after auth failure failed', error);
      return false;
    }
  }

  private requireActiveKey(): string {
    if (!this.currentKey?.key) {
      throw new Error('litellm_active_key_missing');
    }
    return this.currentKey.key;
  }

  private async refreshKey(trigger: ProvisionContext): Promise<void> {
    if (this.refreshPromise) {
      return this.refreshPromise;
    }
    this.refreshPromise = this.performRefresh(trigger).finally(() => {
      this.refreshPromise = undefined;
    });
    await this.refreshPromise;
  }

  private async performRefresh(trigger: ProvisionContext): Promise<void> {
    const previousKey = this.currentKey?.key;
    const state = await this.generateAndPersistKey(trigger);
    this.applyKeyState(state);
    if (previousKey) {
      await this.revokeKey(previousKey, `rotation:${trigger}`);
    }
  }

  private applyKeyState(state: VirtualKeyState): void {
    this.currentKey = state;
    this.scheduleRefresh(state.expiresAt);
    this.ensureOpenAIClient();
  }

  private scheduleRefresh(expiresAt: Date | null): void {
    this.clearRefreshTimer();
    if (!expiresAt) return;

    const msUntilExpiry = expiresAt.getTime() - Date.now();
    const delay = Math.max(MIN_REFRESH_DELAY_MS, msUntilExpiry - REFRESH_GRACE_MS);
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = undefined;
      void this.runScheduledRefresh('refresh', 0);
    }, delay);
  }

  private async runScheduledRefresh(trigger: ProvisionContext, attempt: number): Promise<void> {
    try {
      await this.refreshKey(trigger);
    } catch (error) {
      this.logger.error(
        `LiteLLM scheduled refresh failed ${JSON.stringify({ attempt, trigger, error: this.describeError(error) })}`,
      );
      const nextDelay = Math.min(
        REFRESH_RETRY_MAX_DELAY_MS,
        REFRESH_RETRY_BASE_DELAY_MS * Math.pow(2, attempt),
      );
      this.refreshTimer = setTimeout(() => {
        this.refreshTimer = undefined;
        void this.runScheduledRefresh(trigger, attempt + 1);
      }, nextDelay);
    }
  }

  private async generateAndPersistKey(context: ProvisionContext): Promise<VirtualKeyState> {
    const generated = await this.generateVirtualKey();
    await this.keyStore.save({ alias: this.keyAlias, key: generated.key, expiresAt: generated.expiresAt });
    this.logger.debug(`LiteLLM virtual key issued ${JSON.stringify({ alias: this.keyAlias, context })}`);
    return generated;
  }

  private async generateVirtualKey(): Promise<VirtualKeyState> {
    if (!this.cfg.litellmBaseUrl || !this.cfg.litellmMasterKey) {
      throw new Error('litellm_missing_config');
    }

    const base = this.cfg.litellmBaseUrl.replace(/\/$/, '');
    const url = `${base}/key/generate`;
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      authorization: `Bearer ${this.cfg.litellmMasterKey}`,
    };
    const body: Record<string, unknown> = {
      key_alias: this.keyAlias,
      models: this.toList(process.env.LITELLM_MODELS, ['all-team-models']),
      duration: process.env.LITELLM_KEY_DURATION || '30d',
    };

    const setNumeric = (value: string | undefined, key: string) => {
      if (!value) return;
      const parsed = Number(value);
      if (Number.isFinite(parsed) && parsed >= 0) {
        body[key] = parsed;
      }
    };

    setNumeric(process.env.LITELLM_MAX_BUDGET, 'max_budget');
    setNumeric(process.env.LITELLM_RPM_LIMIT, 'rpm_limit');
    setNumeric(process.env.LITELLM_TPM_LIMIT, 'tpm_limit');

    if (process.env.LITELLM_TEAM_ID) {
      body.team_id = process.env.LITELLM_TEAM_ID;
    }

    const maxAttempts = 3;
    const baseDelayMs = 300;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const response = await this.fetchImpl(url, { method: 'POST', headers, body: JSON.stringify(body) });
        if (!response.ok) {
          await this.handleProvisionNonOk(response, attempt, maxAttempts, baseDelayMs);
          continue;
        }

        const data = (await this.safeReadJson(response)) as { key?: string; expires?: string } | undefined;
        if (!data?.key || typeof data.key !== 'string') {
          throw new Error('litellm_provision_invalid_response');
        }
        const expiresAt = this.parseExpiry(data.expires);
        return { key: data.key, expiresAt };
      } catch (error) {
        if (attempt >= maxAttempts) {
          this.logger.error('LiteLLM provisioning failed after retries', error);
          throw error;
        }
        this.logger.debug(
          `LiteLLM provisioning attempt failed ${JSON.stringify({ attempt, error: this.describeError(error) })}`,
        );
        await this.delay(baseDelayMs * Math.pow(2, attempt - 1));
      }
    }
    throw new Error('litellm_provision_failed');
  }

  private async handleProvisionNonOk(
    resp: Response,
    attempt: number,
    maxAttempts: number,
    baseDelayMs: number,
  ): Promise<void> {
    const text = await this.safeReadText(resp);
    this.logger.error(
      `LiteLLM provisioning failed ${JSON.stringify({ status: String(resp.status), body: this.redact(text) })}`,
    );
    if (resp.status >= 500 && attempt < maxAttempts) {
      await this.delay(baseDelayMs * Math.pow(2, attempt - 1));
      return;
    }
    throw new Error(`litellm_provision_failed_${resp.status}`);
  }

  private parseExpiry(candidate: string | undefined): Date | null {
    if (!candidate) return null;
    const ts = Date.parse(candidate);
    return Number.isFinite(ts) ? new Date(ts) : null;
  }

  private async revokeKey(key: string, context: string): Promise<void> {
    if (!this.cfg.litellmBaseUrl || !this.cfg.litellmMasterKey) return;
    const base = this.cfg.litellmBaseUrl.replace(/\/$/, '');
    const url = `${base}/key/delete`;
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      authorization: `Bearer ${this.cfg.litellmMasterKey}`,
    };

    try {
      const resp = await this.fetchImpl(url, { method: 'POST', headers, body: JSON.stringify({ keys: [key] }) });
      if (resp.status === 404) {
        this.logger.debug(`LiteLLM key already revoked ${JSON.stringify({ context })}`);
        return;
      }
      if (!resp.ok) {
        const text = await this.safeReadText(resp);
        this.logger.warn(
          `LiteLLM key revoke failed ${JSON.stringify({ context, status: resp.status, body: this.redact(text) })}`,
        );
      }
    } catch (error) {
      this.logger.warn(`LiteLLM key revoke error ${JSON.stringify({ context, error: this.describeError(error) })}`);
    }
  }

  private registerShutdownHooks(): void {
    const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
    for (const signal of signals) {
      const handler = () => {
        void this.revokeCurrentKey('shutdown');
      };
      process.once(signal, handler);
      this.shutdownHandlers.push({ signal, handler });
    }
  }

  private async revokeCurrentKey(context: string): Promise<void> {
    if (!this.currentKey?.key) return;
    await this.revokeKey(this.currentKey.key, context);
  }

  private removeShutdownHooks(): void {
    for (const { signal, handler } of this.shutdownHandlers.splice(0)) {
      process.off(signal, handler);
    }
  }

  private clearRefreshTimer(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = undefined;
    }
  }

  private toList(v: string | undefined, fallback: string[]): string[] {
    const parts = (v || '')
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean);
    return parts.length ? parts : fallback;
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

  private redact(value: string): string {
    return value?.replace(/(sk-[A-Za-z0-9_-]{6,})/g, '[REDACTED]') ?? value;
  }

  private describeError(error: unknown): string {
    if (!error) return 'unknown';
    if (typeof error === 'string') return error;
    if (typeof error === 'object' && 'message' in error) {
      return String((error as { message?: unknown }).message);
    }
    return String(error);
  }

  private async delay(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}
