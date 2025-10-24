import { LLM } from '@agyn/llm';

// Abstract token for DI and contract for lazy LLM provision.
export abstract class LLMProvisioner {
  // Lazily obtain a ready LLM instance
  abstract getLLM(): Promise<LLM>;
}

