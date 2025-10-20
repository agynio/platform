import type { OpenAIClient, ToolRegistry, LoopState, LeanCtx, Message } from './types.js';
import type { Logger } from '../types/logger.js';
import { invoke as dispatchInvoke } from './dispatcher.js';
import { SummarizeReducer } from './reducers/summarize.reducer.js';
import { CallModelReducer } from './reducers/call_model.reducer.js';
import { ToolsReducer } from './reducers/tools.reducer.js';
import { EnforceReducer } from './reducers/enforce.reducer.js';
import { RouteReducer } from './reducers/route.reducer.js';
import { SnapshotStore } from '../services/snapshot.service.js';
import { getCheckpointWritesGlobal } from '../services/checkpointWrites.service.js';
import { withAgent } from '@agyn/tracing';

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
    const ctx: (LeanCtx & { abortSignal?: AbortSignal; maxIterations?: number }) & { tools?: ToolRegistry } = {
      summarizerConfig: args.ctx?.summarizerConfig,
      memory: this.deps.memory,
      threadId: args.threadId,
      runId: undefined,
      abortSignal: args.ctx?.abortSignal,
      maxIterations: args.ctx?.maxIterations,
      tools: this.deps.tools,
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
    // Emit checkpoint_writes-compatible events for UI continuity (best-effort)
    try {
      const dbWriter = getCheckpointWritesGlobal();
      if (dbWriter && args.threadId && args.nodeId && appended.length) {
        let idx = 0;
        for (const m of appended) {
          await dbWriter.append({
            thread_id: args.threadId,
            checkpoint_id: args.threadId,
            task_id: `${args.nodeId}:${Date.now()}`,
            idx: idx++,
            channel: 'messages',
            type: 'message',
            value: m,
            agentId: args.nodeId,
          });
        }
      }
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      this.logger.error('Failed to emit checkpoint_writes events', err);
    }
    return { state: finalState, appended };
  }
}
