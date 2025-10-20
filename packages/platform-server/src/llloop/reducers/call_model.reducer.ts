import { callModel } from '../openai/client.js';
import { withLLM } from '@agyn/tracing';
import type { Reducer, ReduceResult, LoopState, LeanCtx, OpenAIClient } from '../types.js';
import type { Logger } from '../../types/logger.js';

export class CallModelReducer implements Reducer {
  constructor(private readonly openai: OpenAIClient, private readonly logger: Logger) {}
  name(): string {
    return 'call_model';
  }

  async reduce(state: LoopState, ctx: LeanCtx & { abortSignal?: AbortSignal }): Promise<ReduceResult> {
    const res = await withLLM(
      { context: state.messages as any, model: state.model },
      async () => callModel({ client: this.openai, model: state.model, messages: state.messages, tools: undefined, signal: ctx.abortSignal }),
    );
    const nextState: LoopState = { ...state, messages: [...state.messages, res.assistant], pendingToolCalls: res.toolCalls };
    return { state: nextState, next: 'route' };
  }
}
