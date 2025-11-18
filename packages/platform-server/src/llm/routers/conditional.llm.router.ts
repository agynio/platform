import { Router } from '@agyn/llm';
import { LLMContext, LLMState } from '../types';
import { Injectable } from '@nestjs/common';

@Injectable()
export class ConditionalLLMRouter extends Router<LLMState, LLMContext> {
  private _next?: (state: LLMState, ctx: LLMContext) => string | null;

  init(next: (state: LLMState, ctx: LLMContext) => string | null) {
    this._next = next;
    return this;
  }

  private get next() {
    if (!this._next) throw new Error('ConditionalLLMRouter not initialized');
    return this._next;
  }

  async route(state: LLMState, ctx: LLMContext) {
    if (ctx.terminateSignal.isActive) {
      return { state, next: null };
    }
    return { state, next: this.next(state, ctx) };
  }
}
