import { Reducer, Router } from '@agyn/llm';
import { LLMContext, LLMState } from '../types';

export class StaticLLMRouter extends Router<LLMState, LLMContext> {
  constructor(
    private reducer: Reducer<LLMState, LLMContext>,
    private next: string,
  ) {
    super();
  }

  async invoke(state: LLMState, ctx: LLMContext) {
    return { state: await this.reducer.invoke(state, ctx), next: this.next };
  }
}
