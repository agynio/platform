import type { LLM } from '@agyn/llm';
import { Injectable } from '@nestjs/common';

@Injectable()
export abstract class LLMProvisioner {
  abstract getLLM(): Promise<LLM>;
}
