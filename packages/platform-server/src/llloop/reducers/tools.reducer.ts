import type { Reducer, ReduceResult, LoopState, LeanCtx, ToolRegistry, Message } from '../types.js';
import type { Logger } from '../../types/logger.js';

export class ToolsReducer implements Reducer {
  constructor(private readonly tools: ToolRegistry | undefined, private readonly logger: Logger) {}
  name(): string {
    return 'tools';
  }

  async reduce(state: LoopState, ctx: LeanCtx): Promise<ReduceResult> {
    const outMessages = [...state.messages];
    let finish = state.finish ?? false;
    let finishReason = state.finishReason;
    let finishData = state.finishData;

    if (!state.pendingToolCalls || state.pendingToolCalls.length === 0 || !this.tools) {
      return { state: { ...state, messages: outMessages, next: 'route' }, next: 'route' };
    }

    for (const tc of state.pendingToolCalls) {
      const tool = this.tools.get(tc.name);
      if (!tool) continue;
      const r = await tool.call(tc.input, { logger: this.logger });
      if (typeof r === 'string') {
        outMessages.push({ role: 'tool', contentText: r, toolCallId: tc.id });
      } else if (r && typeof r === 'object' && 'finish' in r) {
        const rr = r as Record<string, unknown>;
        finish = true;
        finishReason = typeof rr.reason === 'string' ? rr.reason : undefined;
        finishData = rr.data;
        outMessages.push({ role: 'tool', contentJson: r, toolCallId: tc.id });
        break;
      } else {
        const o = r as { outputText?: string; outputJson?: unknown };
        if (o.outputText !== undefined) outMessages.push({ role: 'tool', contentText: o.outputText, toolCallId: tc.id });
        else outMessages.push({ role: 'tool', contentJson: o.outputJson, toolCallId: tc.id });
      }
    }

    const nextState: LoopState = { ...state, messages: outMessages, pendingToolCalls: [], finish, finishReason, finishData };
    return { state: nextState, next: 'route' };
  }
}
