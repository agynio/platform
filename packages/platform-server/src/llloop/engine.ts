import type { OpenAIClient, ToolRegistry, LoopState, LeanCtx, Message } from './types.js';
import type { Logger } from '../types/logger.js';
import { invoke as dispatchInvoke } from './dispatcher.js';
import { SummarizeReducer } from './reducers/summarize.reducer.js';
import { CallModelReducer } from './reducers/call_model.reducer.js';
import { ToolsReducer } from './reducers/tools.reducer.js';
import { EnforceReducer } from './reducers/enforce.reducer.js';
import { RouteReducer } from './reducers/route.reducer.js';
import { SnapshotStore } from '../services/snapshot.service.js';
import { withAgent, withLLM, withToolCall, withSummarize } from '@agyn/tracing';

export class LLLoop {
  constructor(
    private logger: Logger,
    private deps: { openai: OpenAIClient; tools?: ToolRegistry; summarizer?: import('./types.js').Summarizer; memory?: import('./types.js').MemoryConnector },
  ) {}

  // Compute appended messages from before -> after (replace-only semantics)
  private diffAppended(before: Message[], after: Message[]): Message[] {
    const eq = (a: Message, b: Message): boolean =>
      a.role === b.role &&
      (a.contentText ?? null) === (b.contentText ?? null) &&
      JSON.stringify(a.contentJson ?? null) === JSON.stringify(b.contentJson ?? null) &&
      (a.name ?? null) === (b.name ?? null) &&
      (a.toolCallId ?? null) === (b.toolCallId ?? null);
    let i = 0;
    const max = Math.min(before.length, after.length);
    while (i < max && eq(before[i]!, after[i]!)) i++;
    return after.slice(i);
  }

  async invoke(args: {
    nodeId?: string;
    threadId?: string;
    state: LoopState;
    ctx?: { summarizerConfig?: { keepTokens: number; maxTokens: number; note?: string }; abortSignal?: AbortSignal; maxIterations?: number };
    snapshotStore?: SnapshotStore;
  }): Promise<{ state: LoopState; appended: Message[] }> {
    const ctx: LeanCtx & { abortSignal?: AbortSignal; maxIterations?: number } = {
      summarizerConfig: args.ctx?.summarizerConfig,
      memory: this.deps.memory,
      threadId: args.threadId,
      runId: undefined,
      abortSignal: args.ctx?.abortSignal,
      maxIterations: args.ctx?.maxIterations,
    };
    const reducers = [
      new SummarizeReducer(this.logger),
      new CallModelReducer(this.deps.openai, this.logger),
      new ToolsReducer(this.deps.tools, this.logger),
      new EnforceReducer(this.logger),
      new RouteReducer(this.logger),
    ];
    // Load snapshot and merge inbound messages (replace-only)
    let baseState = args.state;
    if (args.snapshotStore && args.nodeId && args.threadId) {
      const snap = await args.snapshotStore.getSnapshot(args.nodeId, args.threadId);
      if (snap) {
        baseState = { ...snap, model: args.state.model, messages: [...snap.messages, ...args.state.messages] };
      }
    }
    const before = baseState.messages;
    const finalState = await withAgent(
      { threadId: args.threadId || 'unknown', agentName: args.nodeId || 'llloop' },
      async () => dispatchInvoke({ reducers, state: baseState, ctx, logger: this.logger }),
    );
    if (args.snapshotStore && args.nodeId && args.threadId) {
      await args.snapshotStore.upsertSnapshot(args.nodeId, args.threadId, finalState);
    }
    const appended = this.diffAppended(before, finalState.messages);
    return { state: finalState, appended };
  }
}
