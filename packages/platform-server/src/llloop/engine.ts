import type { OpenAIClient, ToolRegistry, LoopState, LoopContext, LoopRuntime, MemoryConnector } from './types.js';
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
    ctx?: LoopContext;
  }): Promise<LoopState> {
    const ctx: LoopContext = args.ctx ?? {};
    const reducers = [new SummarizeReducer(), new CallModelReducer(), new ToolsReducer(), new EnforceReducer(), new RouteReducer()];
    const runtime: LoopRuntime = {
      getLLM: () => this.deps.openai,
      getTools: () => this.deps.tools,
      getLogger: () => this.logger,
      getMemory: (): MemoryConnector | undefined => this.deps.memory,
    };
    const finalState = await dispatchInvoke({ runtime, reducers, state: args.state, ctx, logger: this.logger });
    return finalState;
  }
}
