import type { Reducer, ReduceResult, LoopState, LeanCtx } from '../types.js';

export class ToolsReducer implements Reducer {
  name(): string {
    return 'tools';
  }

  async reduce(state: LoopState, ctx: LeanCtx): Promise<ReduceResult> {
    const logger = ctx.log;
    const outMessages = [...state.messages];
    let finish = state.finish ?? false;
    let finishReason = state.finishReason;
    let finishData = state.finishData;

    if (!state.pendingToolCalls || state.pendingToolCalls.length === 0) {
      return { state: { ...state, messages: outMessages, next: 'route' }, next: 'route' };
    }

    const exec = await ctx.executeTools(state.pendingToolCalls);
    for (const m of exec.results) {
      outMessages.push(m);
    }

    if (exec.finish) {
      finish = true;
      finishReason = exec.finish.reason;
      finishData = exec.finish.data;
    }

    const nextState: LoopState = { ...state, messages: outMessages, pendingToolCalls: [], finish, finishReason, finishData };
    return { state: nextState, next: 'route' };
  }
}
