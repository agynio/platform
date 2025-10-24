import { Router } from '@agyn/llm';
import { LLMContext, LLMState } from '../types';

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
