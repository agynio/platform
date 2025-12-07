import { LLM } from '@agyn/llm';
import OpenAI from 'openai';
import { ConfigService } from '../../core/services/config.service';
import { LLMProvisioner } from './llm.provisioner';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { LiteLLMTokenStore, StoredLiteLLMServiceToken } from './litellm.token-store';
import { LiteLLMAdminClient } from './litellm.admin-client';

interface LiteLLMProvisionerOverrides {
  tokenStore?: LiteLLMTokenStore;
  now?: () => Date;
  fetchImpl?: typeof fetch;
}

@Injectable()
export class LiteLLMProvisioner extends LLMProvisioner {
  private readonly logger = new Logger(LiteLLMProvisioner.name);
  private readonly tokenStore: LiteLLMTokenStore;
  private readonly now: () => Date;
  private readonly fetchImpl?: typeof fetch;
  private llm?: LLM;

  constructor(@Inject(ConfigService) private cfg: ConfigService, overrides: LiteLLMProvisionerOverrides = {}) {
    super();
    this.tokenStore =
      overrides.tokenStore ??
      new LiteLLMTokenStore({
        lockStaleThresholdMs: cfg.litellmTokenLockStaleMs,
        logger: this.logger,
      });
    this.now = overrides.now ?? (() => new Date());
    this.fetchImpl = overrides.fetchImpl;
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

    if (!this.cfg.litellmBaseUrl || !this.cfg.litellmMasterKey) {
      throw new Error('litellm_missing_config');
    }

    return this.resolveServiceToken();
  }

  private async resolveServiceToken(): Promise<{ apiKey: string; baseUrl: string }> {
    const base = this.sanitizeBaseUrl(this.cfg.litellmBaseUrl as string);
    const master = this.cfg.litellmMasterKey as string;
    const inferenceBase = this.cfg.openaiBaseUrl || `${base}/v1`;
    const admin = this.createAdminClient(base, master);

    const initialRecord = await this.tokenStore.read();
    const reused = await this.tryReuseToken(admin, inferenceBase, initialRecord);
    if (reused) return reused;

    return this.tokenStore.withLock(async () => {
      const currentRecord = await this.tokenStore.read();
      const lockedReuse = await this.tryReuseToken(admin, inferenceBase, currentRecord);
      if (lockedReuse) return lockedReuse;
      return this.provisionNewToken(admin, base, inferenceBase, currentRecord);
    });
  }

  private createAdminClient(base: string, masterKey: string): LiteLLMAdminClient {
    return new LiteLLMAdminClient(masterKey, base, {
      logger: this.logger,
      maxAttempts: this.cfg.litellmKeyApiRetryMax,
      baseDelayMs: this.cfg.litellmKeyApiRetryBaseMs,
      fetchImpl: this.fetchImpl,
    });
  }

  private sanitizeBaseUrl(base: string): string {
    return base.replace(/\/+$/, '');
  }

  private async tryReuseToken(
    admin: LiteLLMAdminClient,
    inferenceBase: string,
    record?: StoredLiteLLMServiceToken,
  ): Promise<{ apiKey: string; baseUrl: string } | undefined> {
    if (!record) return undefined;
    try {
      const valid = await admin.validateKey(record.token, this.cfg.litellmKeyValidationTimeoutMs);
      if (valid) {
        return { apiKey: record.token, baseUrl: inferenceBase };
      }
      this.logger.warn(
        `LiteLLM service token invalid; regenerating ${JSON.stringify({ alias: record.alias })}`,
      );
      return undefined;
    } catch (error) {
      this.logger.error(
        `LiteLLM service token validation failed ${JSON.stringify({ alias: record.alias, error: this.toErrorMessage(error) })}`,
      );
      throw error;
    }
  }

  private async provisionNewToken(
    admin: LiteLLMAdminClient,
    adminBase: string,
    inferenceBase: string,
    previous?: StoredLiteLLMServiceToken,
  ): Promise<{ apiKey: string; baseUrl: string }> {
    const alias = this.cfg.litellmServiceKeyAlias;
    if (this.cfg.litellmCleanupOldKeys) {
      await admin.deleteByAlias(alias).catch((error) => this.logCleanupFailure('delete_by_alias', error));
    }

    const teamId = await this.ensureServiceTeam(admin, previous);
    const generated = await admin.generateKey({
      alias,
      teamId,
      models: this.cfg.litellmServiceModels,
      duration: this.cfg.litellmServiceKeyDuration,
    });

    const record: StoredLiteLLMServiceToken = {
      token: generated.key,
      alias,
      team_id: teamId ?? generated.teamId ?? previous?.team_id,
      base_url: adminBase,
      created_at: this.now().toISOString(),
    };
    await this.tokenStore.write(record);

    if (this.cfg.litellmCleanupOldKeys && previous?.token && previous.token !== generated.key) {
      await admin.deleteKeys([previous.token]).catch((error) => this.logCleanupFailure('delete_previous', error));
    }

    return { apiKey: record.token, baseUrl: inferenceBase };
  }

  private async ensureServiceTeam(
    admin: LiteLLMAdminClient,
    previous?: StoredLiteLLMServiceToken,
  ): Promise<string | undefined> {
    const alias = this.cfg.litellmServiceTeamAlias;
    if (previous?.team_id) {
      const existing = await admin.fetchTeamById(previous.team_id);
      if (existing) return existing.id;
    }
    const existingByAlias = await admin.fetchTeamByAlias(alias);
    if (existingByAlias) return existingByAlias.id;
    const created = await admin.createTeam(alias);
    return created.id;
  }

  private logCleanupFailure(action: string, error: unknown): void {
    this.logger.warn(
      `LiteLLM cleanup failed ${JSON.stringify({ action, error: this.toErrorMessage(error) })}`,
    );
  }

  private toErrorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    if (typeof error === 'string') return error;
    try {
      return JSON.stringify(error);
    } catch {
      return 'unknown_error';
    }
  }
}
