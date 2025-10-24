import type { LLM } from '@agyn/llm';

export type LLMProvider = 'openai' | 'litellm' | 'auto';

// Simplified abstract provisioner: only expose LLM
export abstract class LLMProvisioner {
  abstract getLLM(): Promise<LLM>;
}

