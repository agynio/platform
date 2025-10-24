import OpenAI from 'openai';
import { LLM } from '@agyn/llm';
import { LLMProvisioner } from '../llm.provisioner';
import { ConfigService } from '../../core/services/config.service';

export class OpenAILLMProvisioner extends LLMProvisioner {
  private llm: LLM | null = null;
  constructor(private cfg: ConfigService) { super(); }

  async getLLM(): Promise<LLM> {
    if (this.llm) return this.llm;
    const apiKey = this.cfg.openaiApiKey;
    if (!apiKey) throw new Error('openai_provider_missing_key');
    const baseUrl = this.cfg.openaiBaseUrl;
    const client = new OpenAI({ apiKey, baseURL: baseUrl });
    this.llm = new LLM(client as any);
    return this.llm;
  }
}
