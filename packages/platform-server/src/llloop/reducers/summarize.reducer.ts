import type { Reducer, ReduceResult, LoopState, LeanCtx } from '../types.js';

export class SummarizeReducer implements Reducer {
  name(): string {
    return 'summarize';
  }

  async reduce(state: LoopState, ctx: LeanCtx): Promise<ReduceResult> {
    const logger = ctx.log;
    const memory = ctx.memory;
    const cfg = ctx.summarizerConfig;
    if (!cfg) return { state: { ...state }, next: 'call_model' };

    try {
      // Prepend memory summary message if exists (if LeanCtx includes enough info to fetch it)
      const working: typeof state.messages = [...state.messages];

      // Simplified summarization helper using model token budgeting hints from ctx
      // For now, this is a placeholder; actual token counting would require tokenizer support.
      const res = { summary: undefined as string | undefined, messages: working };
      const out: LoopState = { ...state, messages: res.messages };
      if (res.summary && ctx.threadId && memory?.updateSummary) {
        await memory.updateSummary(ctx.threadId, res.summary);
        out.summary = res.summary;
        // Prepend a compact summary system message for subsequent steps
        out.messages = [{ role: 'system', contentText: `Summary so far: ${res.summary}` }, ...out.messages];
      }
      return { state: out, next: 'call_model' };
    } catch (e) {
      logger.error('summarize reducer failed', e);
      return { state: { ...state }, next: 'call_model' };
    }
  }
}
