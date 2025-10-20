import type { Logger } from '../types/logger.js';
import type { Reducer, LoopState, LoopContext, ReduceResult, LoopRuntime } from './types.js';

export async function invoke(args: {
  runtime: LoopRuntime;
  reducers: Reducer[];
  state: LoopState;
  ctx: LoopContext;
  logger: Logger;
}): Promise<LoopState> {
  const { runtime, reducers, state: initial, ctx, logger } = args;
  const map = new Map<string, Reducer>(reducers.map((r) => [r.name(), r]));
  let state: LoopState = { ...initial };
  let next = reducers[0]?.name() ?? null;

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
      const res: ReduceResult = await reducer.reduce(state, ctx, runtime);
      state = res.state;
      next = res.next;
    } catch (e: unknown) {
      logger.error(`reducer ${String(next)} failed`, e);
      break;
    }
  }
  return { ...state };
}
