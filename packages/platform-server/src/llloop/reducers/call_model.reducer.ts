import { callModel } from '../openai/client.js';
import type { Reducer, ReduceResult, LoopState, LeanCtx, OpenAIClient } from '../types.js';
import type { Logger } from '../../types/logger.js';

export class CallModelReducer implements Reducer {
  constructor(private readonly openai: OpenAIClient, private readonly logger: Logger) {}
  name(): string {
    return 'call_model';
  }

  async reduce(state: LoopState, _ctx: LeanCtx): Promise<ReduceResult> {
    const res = await callModel({ client: this.openai, model: state.model, messages: state.messages, tools: undefined });
    const nextState: LoopState = { ...state, messages: [...state.messages, res.assistant], pendingToolCalls: res.toolCalls };
    return { state: nextState, next: 'route' };
  }
}
