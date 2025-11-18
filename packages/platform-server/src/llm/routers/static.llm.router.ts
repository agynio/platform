import { Router } from '@agyn/llm';
import { LLMContext, LLMState } from '../types';
import { Injectable } from '@nestjs/common';

// StaticRouter: returns fixed next; does not own reducer
@Injectable()
export class StaticLLMRouter extends Router<LLMState, LLMContext> {
  private _nextId?: string;

  init(nextId: string) {
    this._nextId = nextId;
    return this;
  }

  get nextId() {
    if (!this._nextId) throw new Error('StaticLLMRouter not initialized with nextId');
    return this._nextId;
  }

  async route(state: LLMState, ctx: LLMContext) {
    if (ctx.terminateSignal.isActive) {
      return { state, next: null };
    }
    return { state, next: this.nextId };
  }
}
