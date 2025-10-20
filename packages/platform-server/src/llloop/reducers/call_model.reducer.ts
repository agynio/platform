import { callModel } from '../openai/client.js';
import type { Reducer, ReduceResult, LoopState, LoopContext } from '../types.js';

export class CallModelReducer implements Reducer {
  name(): string {
    return 'call_model';
  }

  async reduce(state: LoopState, ctx: LoopContext, runtime: Parameters<Reducer['reduce']>[2]): Promise<ReduceResult> {
    const llm = runtime.getLLM();
    const tools = runtime.getTools();
    const toolDefs = tools?.list().map((t) => ({ name: t.name, description: undefined, schema: { type: 'object' } }));
    const res = await callModel({ client: llm, model: state.model, messages: state.messages, tools: toolDefs, signal: ctx.abortSignal });
    const nextState: LoopState = {
      ...state,
      messages: [...state.messages, res.assistant],
      pendingToolCalls: res.toolCalls,
      rawRequest: res.rawRequest,
      rawResponse: res.rawResponse,
    };
    return { state: nextState, next: 'route' };
  }
}
