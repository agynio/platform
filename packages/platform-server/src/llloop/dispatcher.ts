import type { Logger } from '../types/logger.js';
import type { OpenAIClient, Reducer, LoopState, LoopContext, ReduceResult, ToolRegistry, Summarizer, MemoryConnector } from './types.js';

export async function invoke(args: {
  llm: OpenAIClient;
  reducers: Reducer[];
  state: LoopState;
  ctx: LoopContext;
  logger: Logger;
  deps?: { tools?: ToolRegistry; summarizer?: Summarizer; memory?: MemoryConnector };
}): Promise<LoopState> {
  const { llm, reducers, state: initial, ctx, logger } = args;
  const deps = args.deps ?? {};
  const map = new Map<string, Reducer>(reducers.map((r) => [r.name(), r]));
  let state: LoopState = { ...initial };
  let next = state.next ?? reducers[0]?.name() ?? null;

  const sharedDeps = { llm, tools: deps.tools, logger, summarizer: deps.summarizer, memory: deps.memory };

  while (next) {
    if (ctx.abortSignal?.aborted) {
      logger.error('invoke aborted');
      break;
    }
    const reducer = map.get(next);
    if (!reducer) {
      logger.error(`unknown reducer: ${next}`);
      break;
    }
    try {
      const res: ReduceResult = await reducer.reduce(state, ctx, sharedDeps);
      state = res.state;
      next = res.next;
    } catch (e) {
      logger.error(`reducer ${next} failed`, e);
      break;
    }
  }
  return { ...state, next: null };
}
