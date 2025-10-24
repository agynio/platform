import OpenAI from 'openai';
import { LLMProvisioner } from './types';
import { ConfigService } from '../../core/services/config.service';

export class OpenAILLMProvisioner implements LLMProvisioner {
  private client: OpenAI | null = null;
  constructor(private cfg: ConfigService) {}

  async getOpenAIClient(): Promise<OpenAI> {
    if (this.client) return this.client;
    const apiKey = this.cfg.openaiApiKey;
    const baseURL = this.cfg.openaiBaseUrl;
    // For direct OpenAI, apiKey must be present.
    if (!apiKey) throw new Error('openai_provider_missing_key');
    this.client = new OpenAI({ apiKey, baseURL });
    return this.client;
  }
}

