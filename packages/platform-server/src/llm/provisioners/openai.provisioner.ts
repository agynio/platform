import { LLM } from '@agyn/llm';
import { Injectable } from '@nestjs/common';
import OpenAI from 'openai';
import { LLMProvisioner } from './llm.provisioner';

@Injectable()
export class OpenAILLMProvisioner extends LLMProvisioner {
  private llm?: LLM;
  constructor() {
    super();
  }

  async getLLM(): Promise<LLM> {
    if (this.llm) return this.llm;

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('openai_provider_missing_key');
    const baseUrl = process.env.OPENAI_BASE_URL;
    const client = new OpenAI({ apiKey, baseURL: baseUrl });
    this.llm = new LLM(client);
    return this.llm;
  }
}
