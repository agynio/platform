import { LLM } from '@agyn/llm';
import { Injectable } from '@nestjs/common';
import OpenAI from 'openai';
import { ConfigService } from '../../core/services/config.service';
import { LLMProvisioner } from './llm.provisioner';

@Injectable()
export class OpenAILLMProvisioner extends LLMProvisioner {
  private llm?: LLM;
  constructor(private cfg: ConfigService) {
    // Explicit injection for tsx runtime without emitDecoratorMetadata
    // ConfigService is provided by CoreModule
    // Nest resolves via token, not string
    // no-op
    super();
  }

  async getLLM(): Promise<LLM> {
    if (this.llm) return this.llm;

    const apiKey = this.cfg.openaiApiKey;
    if (!apiKey) throw new Error('openai_provider_missing_key');
    const baseUrl = this.cfg.openaiBaseUrl;
    const client = new OpenAI({ apiKey, baseURL: baseUrl });
    this.llm = new LLM(client);
    return this.llm;
  }
}
