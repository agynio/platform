import type { OpenAIClient, ToolRegistry, LoopState, LeanCtx, MemoryConnector, Tool, ToolCall, Message } from './types.js';
import type { Logger } from '../types/logger.js';
import { invoke as dispatchInvoke } from './dispatcher.js';
import { SummarizeReducer } from './reducers/summarize.reducer.js';
import { CallModelReducer } from './reducers/call_model.reducer.js';
import { ToolsReducer } from './reducers/tools.reducer.js';
import { EnforceReducer } from './reducers/enforce.reducer.js';
import { RouteReducer } from './reducers/route.reducer.js';

export class LLLoop {
  constructor(
    private logger: Logger,
    private deps: { openai: OpenAIClient; tools?: ToolRegistry; summarizer?: import('./types.js').Summarizer; memory?: import('./types.js').MemoryConnector },
  ) {}

  async invoke(args: {
    state: LoopState;
    ctx?: { summarizerConfig?: { keepTokens: number; maxTokens: number; note?: string } };
  }): Promise<LoopState> {
    const abortController = new AbortController();
    const ctx: LeanCtx = {
      summarizerConfig: args.ctx?.summarizerConfig,
      memory: this.deps.memory,
      callModel: async ({ messages, tools }) => {
        // Reuse existing callModel wrapper for OpenAI Responses API
        const toolDefs = tools?.map((t) => ({ name: t.name, description: undefined, schema: { type: 'object' } }));
        const { callModel } = await import('./openai/client.js');
        const res = await callModel({ client: this.deps.openai, model: args.state.model, messages, tools: toolDefs, signal: abortController.signal });
        return { assistant: res.assistant as Message, toolCalls: res.toolCalls as ToolCall[], raw: res.rawResponse };
      },
      executeTools: async (calls) => {
        const results: Message[] = [];
        let finish: { reason?: string; data?: unknown } | undefined;
        for (const tc of calls) {
          const tool = this.deps.tools?.get(tc.name);
          if (!tool) continue;
          const r = await tool.call(tc.input, { signal: abortController.signal, logger: this.logger });
          if (typeof r === 'string') {
            results.push({ role: 'tool', contentText: r, toolCallId: tc.id });
          } else if (r && typeof r === 'object' && 'finish' in r) {
            const rr = r as Record<string, unknown>;
            finish = { reason: typeof rr.reason === 'string' ? rr.reason : undefined, data: rr.data };
            results.push({ role: 'tool', contentJson: r, toolCallId: tc.id });
            break;
          } else {
            const o = r as { outputText?: string; outputJson?: unknown };
            if (o.outputText !== undefined) results.push({ role: 'tool', contentText: o.outputText, toolCallId: tc.id });
            else results.push({ role: 'tool', contentJson: o.outputJson, toolCallId: tc.id });
          }
        }
        return { results, finish };
      },
      log: this.logger,
    };
    const reducers = [new SummarizeReducer(), new CallModelReducer(), new ToolsReducer(), new EnforceReducer(), new RouteReducer()];
    const finalState = await dispatchInvoke({ reducers, state: args.state, ctx, logger: this.logger });
    return finalState;
  }
}
