import type { Reducer, ReduceResult, LoopState, LoopContext } from '../types.js';

export class ToolsReducer implements Reducer {
  name(): string {
    return 'tools';
  }

  async reduce(state: LoopState, ctx: LoopContext, runtime: Parameters<Reducer['reduce']>[2]): Promise<ReduceResult> {
    const tools = runtime.getTools();
    const logger = runtime.getLogger();
    const outMessages = [...state.messages];
    let finish = state.finish ?? false;
    let finishReason = state.finishReason;
    let finishData = state.finishData;

    if (!state.pendingToolCalls || state.pendingToolCalls.length === 0 || !tools) {
      return { state: { ...state, messages: outMessages, next: 'route' }, next: 'route' };
    }

    for (const tc of state.pendingToolCalls) {
      const tool = tools.get(tc.name);
      if (!tool) continue;
      const result = await tool.call(tc.input, { signal: ctx.abortSignal, logger });

      if (typeof result === 'string') {
        outMessages.push({ role: 'tool', contentText: result, toolCallId: tc.id });
        continue;
      }
      if (result && typeof result === 'object' && 'finish' in result) {
        finish = true;
        const r = result as Record<string, unknown>;
        finishReason = typeof r.reason === 'string' ? r.reason : finishReason;
        finishData = 'data' in r ? (r.data as unknown) : finishData;
        outMessages.push({ role: 'tool', contentJson: r, toolCallId: tc.id });
        break;
      }
      const asObj = result as { outputText?: string; outputJson?: unknown };
      if (asObj.outputText !== undefined) outMessages.push({ role: 'tool', contentText: asObj.outputText, toolCallId: tc.id });
      else outMessages.push({ role: 'tool', contentJson: asObj.outputJson, toolCallId: tc.id });
    }

    const nextState: LoopState = { ...state, messages: outMessages, pendingToolCalls: [], finish, finishReason, finishData };
    return { state: nextState, next: 'route' };
  }
}
