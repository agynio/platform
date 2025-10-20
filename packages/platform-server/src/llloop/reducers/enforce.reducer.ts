import type { Reducer, ReduceResult, LoopState, LeanCtx } from '../types.js';
import type { Logger } from '../../types/logger.js';

export class EnforceReducer implements Reducer {
  constructor(private readonly logger: Logger) {}
  name(): string {
    return 'enforce';
  }

  async reduce(state: LoopState, _ctx: LeanCtx): Promise<ReduceResult> {
    const cfg = state.restriction;
    if (!cfg?.enabled) return { state: { ...state }, next: 'route' };
    const injections = Math.max(1, Math.min(cfg.maxInjections ?? 1, (cfg.injections ?? 0) + 1));
    const injected: typeof state.messages = [...state.messages];
    for (let i = 0; i < injections; i++) injected.push({ role: 'system', contentText: cfg.message });
    const nextState: LoopState = { ...state, messages: injected, restriction: { ...cfg, injections } };
    return { state: nextState, next: 'call_model' };
  }
}
