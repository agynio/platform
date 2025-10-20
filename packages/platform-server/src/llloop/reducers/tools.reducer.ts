import type { Reducer, ReduceResult, LoopState, LeanCtx, ToolRegistry, ToolFinishSignal } from '../types.js';
import type { Logger } from '../../types/logger.js';

export class ToolsReducer implements Reducer {
  constructor(private readonly tools: ToolRegistry | undefined, private readonly logger: Logger) {}
  name(): string {
    return 'tools';
  }

  async reduce(state: LoopState, ctx: LeanCtx & { abortSignal?: AbortSignal }): Promise<ReduceResult> {
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
      const r = await tool.invoke(tc.input, { logger: this.logger, signal: ctx.abortSignal, threadId: ctx.threadId });
      if (typeof r === 'string') {
        outMessages.push({ role: 'tool', contentText: r, toolCallId: tc.id });
      } else if (isFinishSignal(r)) {
        const rr = r;
        finish = true;
        finishReason = typeof rr.reason === 'string' ? rr.reason : undefined;
        finishData = rr.data;
        outMessages.push({ role: 'tool', contentJson: r, toolCallId: tc.id });
        break;
      } else if (isOutputPayload(r)) {
        const o = r;
        if (typeof o.outputText === 'string') outMessages.push({ role: 'tool', contentText: o.outputText, toolCallId: tc.id });
        else outMessages.push({ role: 'tool', contentJson: o.outputJson, toolCallId: tc.id });
      } else {
        // Fallback: stringify unknown object result safely
        let text = '';
        try { text = JSON.stringify(r as unknown); } catch { text = String(r); }
        outMessages.push({ role: 'tool', contentText: text, toolCallId: tc.id });
      }
    }

    const nextState: LoopState = { ...state, messages: outMessages, pendingToolCalls: [], finish, finishReason, finishData };
    return { state: nextState, next: 'route' };
  }
}

function isFinishSignal(v: unknown): v is ToolFinishSignal {
  if (!v || typeof v !== 'object') return false;
  return (v as { finish?: unknown }).finish === true;
}

function isOutputPayload(v: unknown): v is { outputText?: string; outputJson?: unknown } {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return 'outputText' in o || 'outputJson' in o;
}
