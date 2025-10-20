import type { Logger } from '../types/logger.js';
import type { Reducer, LoopState, ReduceResult, LeanCtx } from './types.js';

export async function invoke(args: {
  reducers: Reducer[];
  state: LoopState;
  ctx: LeanCtx;
  logger: Logger;
}): Promise<LoopState> {
  const { reducers, state: initial, ctx, logger } = args;
  const map = new Map<string, Reducer>(reducers.map((r) => [r.name(), r]));
  let state: LoopState = { ...initial };
  let next = reducers[0]?.name() ?? null;

  while (next) {
    const reducer = map.get(next);
    if (!reducer) {
      logger.error(`unknown reducer: ${next}`);
      break;
    }
    try {
      const res: ReduceResult = await reducer.reduce(state, ctx);
      state = res.state;
      next = res.next;
    } catch (e: unknown) {
      logger.error(`reducer ${String(next)} failed`, e);
      break;
    }
  }
  return { ...state };
}
