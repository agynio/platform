import OpenAI from 'openai';

export type LLMProvider = 'openai' | 'litellm' | 'auto';

export interface LLMProvisioner {
  // Lazily obtain a ready OpenAI-compatible client
  getOpenAIClient(): Promise<OpenAI>;
}

