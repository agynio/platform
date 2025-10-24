import { Router } from '@agyn/llm';
import { LLMContext, LLMState } from '../types';
import { Injectable } from '@nestjs/common';

@Injectable()
export class ConditionalLLMRouter extends Router<LLMState, LLMContext> {
  constructor(
    private next: (state: LLMState, ctx: LLMContext) => string | null,
  ) {
    super();
  }

  async route(state: LLMState, ctx: LLMContext) {
    return { state, next: this.next(state, ctx) };
  }
}
