import type { LLM } from '@agyn/llm';
import { Injectable } from '@nestjs/common';

@Injectable()
export abstract class LLMProvisioner {
  abstract init(): Promise<void>;
  abstract getLLM(): Promise<LLM>;
  abstract teardown(): Promise<void>;
}
