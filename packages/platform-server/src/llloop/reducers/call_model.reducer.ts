import { callModel } from '../openai/client.js';
import type { Reducer, ReduceResult, LoopState, LeanCtx } from '../types.js';

export class CallModelReducer implements Reducer {
  name(): string {
    return 'call_model';
  }

  async reduce(state: LoopState, ctx: LeanCtx): Promise<ReduceResult> {
    // Use the LeanCtx.callModel abstraction
    const res = await ctx.callModel({ messages: state.messages, tools: undefined });
    const nextState: LoopState = { ...state, messages: [...state.messages, res.assistant], pendingToolCalls: res.toolCalls };
    return { state: nextState, next: 'route' };
  }
}
