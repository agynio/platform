import { LLM } from '@agyn/llm';
import OpenAI from 'openai';
import { ConfigService } from '../../core/services/config.service';
import { LLMProvisioner } from './llm.provisioner';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { LiteLLMAdminClient } from './litellm.admin-client';

interface LiteLLMProvisionerOverrides {
  fetchImpl?: typeof fetch;
}

@Injectable()
export class LiteLLMProvisioner extends LLMProvisioner {
  private readonly logger = new Logger(LiteLLMProvisioner.name);
  private readonly fetchImpl?: typeof fetch;
  private llm?: LLM;

  constructor(@Inject(ConfigService) private cfg: ConfigService, overrides: LiteLLMProvisionerOverrides = {}) {
    super();
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

    return this.provisionLiteLLMToken();
  }

  private async provisionLiteLLMToken(): Promise<{ apiKey: string; baseUrl: string }> {
    const base = this.sanitizeBaseUrl(this.cfg.litellmBaseUrl as string);
    const master = this.cfg.litellmMasterKey as string;
    const inferenceBase = this.cfg.openaiBaseUrl || `${base}/v1`;
    const admin = this.createAdminClient(base, master);

    await admin
      .deleteByAlias(SERVICE_KEY_ALIAS)
      .catch((error) => this.logger.warn(`LiteLLM delete alias failed ${this.toErrorMessage(error)}`));

    const generated = await admin.generateKey({
      alias: SERVICE_KEY_ALIAS,
      models: this.parseModels(process.env.LITELLM_MODELS),
    });

    return { apiKey: generated.key, baseUrl: inferenceBase };
  }

  private createAdminClient(base: string, masterKey: string): LiteLLMAdminClient {
    return new LiteLLMAdminClient(masterKey, base, {
      logger: this.logger,
      maxAttempts: 1,
      baseDelayMs: 1,
      fetchImpl: this.fetchImpl,
    });
  }

  private sanitizeBaseUrl(base: string): string {
    return base.replace(/\/+$/, '');
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

  private parseModels(raw: string | undefined): string[] {
    const list = (raw || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    return list.length > 0 ? list : DEFAULT_SERVICE_MODELS;
  }
}

const SERVICE_KEY_ALIAS = 'agents-service';
const DEFAULT_SERVICE_MODELS = ['all-team-models'];
