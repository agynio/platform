import type { OpenAIClient, ToolRegistry, LoopState, LeanCtx } from './types.js';
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
    const ctx: LeanCtx = {
      summarizerConfig: args.ctx?.summarizerConfig,
      memory: this.deps.memory,
    };
    const reducers = [
      new SummarizeReducer(this.logger),
      new CallModelReducer(this.deps.openai, this.logger),
      new ToolsReducer(this.deps.tools, this.logger),
      new EnforceReducer(this.logger),
      new RouteReducer(this.logger),
    ];
    const finalState = await dispatchInvoke({ reducers, state: args.state, ctx, logger: this.logger });
    return finalState;
  }
}
