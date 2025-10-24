import { Router } from '@agyn/llm';
import { LLMContext, LLMState } from '../types';
import { Injectable } from '@nestjs/common';

// StaticRouter: returns fixed next; does not own reducer
@Injectable()
export class StaticLLMRouter extends Router<LLMState, LLMContext> {
  constructor(private nextId: string | null) {
    super();
  }

  async route(state: LLMState, _ctx: LLMContext) {
    return { state, next: this.nextId };
  }
}
