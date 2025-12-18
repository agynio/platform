import { LLM } from '@agyn/llm';
import { Inject, Injectable } from '@nestjs/common';
import OpenAI from 'openai';
import { LLMProvisioner } from './llm.provisioner';
import { ConfigService } from '../../core/services/config.service';

@Injectable()
export class OpenAILLMProvisioner extends LLMProvisioner {
  private llm?: LLM;
  constructor(@Inject(ConfigService) private readonly cfg: ConfigService) {
    super();
    ConfigService.assertInitialized(cfg);
  }

  async init(): Promise<void> {
    await this.getLLM();
  }

  async getLLM(): Promise<LLM> {
    if (this.llm) return this.llm;

    const apiKey = this.cfg.openaiApiKey;
    if (!apiKey) throw new Error('openai_provider_missing_key');
    const baseUrl = this.cfg.openaiBaseUrl;
    const client = new OpenAI({ apiKey, baseURL: baseUrl ?? undefined });
    this.llm = new LLM(client);
    return this.llm;
  }

  async teardown(): Promise<void> {
    this.llm = undefined;
  }
}
