import { Reducer, Router } from '@agyn/llm';
import { LLMContext, LLMState } from '../types';

export class ConditionalLLMRouter extends Router<LLMState, LLMContext> {
  constructor(
    private reducer: Reducer<LLMState, LLMContext>,
    private next: (state: LLMState, ctx: LLMContext) => string | null,
  ) {
    super();
  }

  async invoke(state: LLMState, ctx: LLMContext) {
    const newState = await this.reducer.invoke(state, ctx);
    return { state: newState, next: this.next(newState, ctx) };
  }
}
