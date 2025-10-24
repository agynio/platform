import OpenAI from 'openai';
import { LLMProvisioner } from '../llm.provisioner';
import { LLM } from '@agyn/llm';
import { ConfigService } from '../../core/services/config.service';

export class OpenAILLMProvisioner extends LLMProvisioner {
  private client: OpenAI | null = null;
  constructor(private cfg: ConfigService) {
    super();
  }

  async getLLM(): Promise<LLM> {
    if (!this.client) {
      const apiKey = this.cfg.openaiApiKey;
      const baseURL = this.cfg.openaiBaseUrl;
      if (!apiKey) throw new Error('openai_provider_missing_key');
      this.client = new OpenAI({ apiKey, baseURL });
    }
    return new LLM(this.client as any);
  }
}
