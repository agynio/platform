import type { Reducer, ReduceResult, LoopState, LeanCtx } from '../types.js';

export class RouteReducer implements Reducer {
  name(): string {
    return 'route';
  }

  async reduce(state: LoopState, _ctx: LeanCtx): Promise<ReduceResult> {
    // Termination if finish signaled
    if (state.finish) return { state: { ...state }, next: null };

    // If there are tool calls, go run tools
    if (state.pendingToolCalls && state.pendingToolCalls.length > 0) {
      return { state: { ...state }, next: 'tools' };
    }

    // If restriction enabled and last assistant had no tool calls (detected because pendingToolCalls empty), enforce
    if (state.restriction?.enabled) {
      return { state: { ...state }, next: 'enforce' };
    }

    // Otherwise, call model again to continue dialog
    return { state: { ...state }, next: 'call_model' };
  }
}
