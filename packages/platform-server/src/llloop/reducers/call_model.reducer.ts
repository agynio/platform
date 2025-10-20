import { callModel } from '../openai/client.js';
import { withLLM, LLMResponse, type ChatMessageInput } from '@agyn/tracing';
import type { Reducer, ReduceResult, LoopState, LeanCtx, OpenAIClient, ToolRegistry } from '../types.js';
import type { Logger } from '../../types/logger.js';

export class CallModelReducer implements Reducer {
  constructor(private readonly openai: OpenAIClient, private readonly logger: Logger) {}
  name(): string {
    return 'call_model';
  }

  async reduce(state: LoopState, ctx: (LeanCtx & { abortSignal?: AbortSignal }) & { tools?: ToolRegistry }): Promise<ReduceResult> {
    const tools = this.toolsFromRegistry(ctx);
    const res = await withLLM(
      { context: (state.messages as unknown) as ChatMessageInput[], model: state.model },
      async () => new LLMResponse({ raw: await callModel({ client: this.openai, model: state.model, messages: state.messages, tools, signal: ctx.abortSignal }) }),
    );
    const cm = res as { assistant: LoopState['messages'][number]; toolCalls: NonNullable<LoopState['pendingToolCalls']> };
    const nextState: LoopState = { ...state, messages: [...state.messages, cm.assistant], pendingToolCalls: cm.toolCalls };
    return { state: nextState, next: 'route' };
  }

  private toolsFromRegistry(ctx: { tools?: ToolRegistry } | undefined): Array<{ name: string; description?: string; schema: object }> | undefined {
    const reg = ctx?.tools;
    if (!reg) return undefined;
    try {
      const arr = reg.list();
      if (!arr.length) return undefined;
      return arr.map((t) => ({ name: t.name, description: t.description, schema: t.schema.toJSON?.() ?? {} }));
    } catch {
      return undefined;
    }
  }
}
