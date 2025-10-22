import OpenAI from 'openai';
import { ConfigService } from './config.service';
import { LLM } from '@agyn/llm';

export class LLMFactoryService {
  constructor(private configService: ConfigService) {}

  createLLM() {
    if (this.configService.openaiApiKey) {
      return new LLM(new OpenAI({ apiKey: this.configService.openaiApiKey }));
    }

    const apiKey = this.configService.openaiApiKey ?? this.configService.litellmMasterKey;
    const baseURL = this.configService.openaiBaseUrl;
    return new LLM(new OpenAI({ baseURL, apiKey }));
  }
}
