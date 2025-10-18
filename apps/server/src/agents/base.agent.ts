import { BaseMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';
import { RunnableConfig } from '@langchain/core/runnables';
import { Annotation, AnnotationRoot, CompiledStateGraph } from '@langchain/langgraph';
import { LoggerService } from '../services/logger.service';
import { TriggerListener, TriggerMessage, isSystemTrigger } from '../triggers/base.trigger';
import { NodeOutput } from '../types';
import { withAgent } from '@hautech/obs-sdk';
import type { StaticConfigurable } from '../graph/capabilities';
import { z } from 'zod';
import { JSONSchema } from 'zod/v4/core';
import { MessagesBuffer, ProcessBuffer } from './messagesBuffer';
import type { AgentRunService } from '../services/run.service';

export type WhenBusyMode = 'wait' | 'injectAfterTools';

// Minimal interface exposed to nodes to request agent-controlled injections.
export interface InjectionProvider {
  // Nodes call this during a run to request agent-controlled injection. Returns only messages;
  // the agent tracks token associations internally for proper awaiter resolution.
  getInjectedMessages(thread: string): BaseMessage[];
}

type InvocationToken = {
  id: string;
  total: number; // number of messages contributed by this invocation
  resolve: (m: BaseMessage | undefined) => void;
  reject: (e: any) => void;
};

type ThreadState = {
  running: boolean;
  seq: number;
  tokens: Map<string, InvocationToken>;
  inFlight?: { runId: string; includedCounts: Map<string, number>; abortController: AbortController; status: 'running' | 'terminating' };
  timer?: NodeJS.Timeout;
};

export abstract class BaseAgent implements TriggerListener, StaticConfigurable, InjectionProvider {
  protected _graph: CompiledStateGraph<unknown, unknown> | undefined;
  protected _config: RunnableConfig | undefined;
  // Optional static config injected by the runtime; typed loosely on purpose.
  protected _staticConfig: Record<string, unknown> | undefined;

  // Agent-owned trigger buffer and scheduling flags
  protected buffer = new MessagesBuffer({ debounceMs: 0 });
  private whenBusy: WhenBusyMode = 'wait';
  private processBuffer: ProcessBuffer = ProcessBuffer.AllTogether;

  // Per-thread scheduler state
  private threads: Map<string, ThreadState> = new Map();
  // Optional persistence hook for run state listing/termination
  private runService?: AgentRunService;

  get graph() {
    if (!this._graph) {
      throw new Error('Agent not initialized. Graph is undefined.');
    }
    return this._graph;
  }

  get config() {
    if (!this._config) {
      throw new Error('Agent not initialized. Config is undefined.');
    }
    return this._config;
  }

  constructor(private logger: LoggerService) {}

  // Allow subclasses to expose their runtime nodeId for instrumentation
  // Default: undefined (not bound to a graph node)
  protected getNodeId(): string | undefined {
    return undefined;
  }

  // Public helper: expose node id (if any) for external naming/status
  public getAgentNodeId(): string | undefined {
    return this.getNodeId();
  }

  // Inject AgentRunService to enable persistence of run state
  setRunService(svc?: AgentRunService) {
    this.runService = svc;
  }

  protected state(): AnnotationRoot<{}> {
    return Annotation.Root({
      messages: Annotation<BaseMessage[], NodeOutput['messages']>({
        reducer: (left, right) => (!right ? left : right.method === 'append' ? [...left, ...right.items] : right.items),
        default: () => [],
      }),
      summary: Annotation<string, string>({
        reducer: (left, right) => right ?? left,
        default: () => '',
      }),
    });
  }

  protected configuration(): AnnotationRoot<{}> {
    return Annotation.Root({
      // systemPrompt: Annotation<string>(),
    });
  }

  getConfigSchema(): JSONSchema.BaseSchema {
    const schema = z
      .object({
        systemPrompt: z.string().optional(),
        summarizationKeepLast: z.number().int().min(0).optional(),
        summarizationMaxTokens: z.number().int().min(1).optional(),
        debounceMs: z.number().int().min(0).default(0).describe('Debounce window for agent-side buffer.'),
        whenBusy: z
          .enum(['wait', 'injectAfterTools'])
          .default('wait')
          .describe("Agent behavior when a run is active: 'wait' queues, 'injectAfterTools' injects after tools."),
        processBuffer: z
          .enum(['allTogether', 'oneByOne'])
          .default('allTogether')
          .describe('Drain mode for buffer: deliver all queued or one message at a time.'),
      })
      .passthrough();
    return z.toJSONSchema(schema);
  }

  /**
   * Allow subclasses to apply runtime scheduling config conveniently.
   */
  protected applyRuntimeConfig(cfg: Record<string, unknown>): void {
    const SchedulingCfg = z
      .object({
        debounceMs: z.number().int().min(0).optional(),
        whenBusy: z.enum(['wait', 'injectAfterTools']).optional(),
        processBuffer: z.enum(['allTogether', 'oneByOne']).optional(),
      })
      .passthrough();
    const parsed = SchedulingCfg.safeParse(cfg);
    if (!parsed.success) return;
    const c = parsed.data;
    if (typeof c.debounceMs === 'number') this.buffer.setDebounceMs(c.debounceMs);
    if (c.whenBusy) this.whenBusy = c.whenBusy;
    if (c.processBuffer === 'allTogether') this.processBuffer = ProcessBuffer.AllTogether;
    if (c.processBuffer === 'oneByOne') this.processBuffer = ProcessBuffer.OneByOne;
  }

  async invoke(thread: string, messages: TriggerMessage[] | TriggerMessage): Promise<BaseMessage | undefined> {
    return await withAgent({ threadId: thread, nodeId: this.getNodeId(), inputParameters: [{ thread }, { messages }] }, async () => {
      const batch = Array.isArray(messages) ? messages : [messages];
      // Log minimal, non-sensitive metadata about the batch
      const kinds = batch.reduce(
        (acc, m) => {
          if (isSystemTrigger(m)) acc.system += 1;
          else acc.human += 1;
          return acc;
        },
        { human: 0, system: 0 },
      );
      this.logger.info(
        `New trigger event in thread ${thread} (messages=${batch.length}, human=${kinds.human}, system=${kinds.system})`,
      );
      const s = this.ensureThread(thread);

      // Edge case: If OneByOne mode and caller enqueued multiple messages, split into per-message tokens.
      if (this.processBuffer === ProcessBuffer.OneByOne && batch.length > 1) {
        const promises: Promise<BaseMessage | undefined>[] = [];
        for (const msg of batch) {
          const tid = `${thread}:${++s.seq}`;
          this.buffer.enqueueWithToken(thread, tid, [msg]);
          promises.push(
            new Promise<BaseMessage | undefined>((resolve, reject) => {
              s.tokens.set(tid, { id: tid, total: 1, resolve, reject });
            }),
          );
        }
        this.maybeStart(thread);
        const results = await Promise.all(promises);
        const last = results[results.length - 1];
        this.logger.info(`Agent response in thread ${thread}: ${last?.text}`);
        return last;
      }

      const tokenId = `${thread}:${++s.seq}`;
      // Tag queued messages with this invocation's token id for later resolution
      this.buffer.enqueueWithToken(thread, tokenId, batch);
      // Return a promise that resolves/rejects when the run that processes these messages completes
      const p = new Promise<BaseMessage | undefined>((resolve, reject) => {
        s.tokens.set(tokenId, { id: tokenId, total: batch.length, resolve, reject });
      });
      this.maybeStart(thread);
      const result = await p;
      this.logger.info(`Agent response in thread ${thread}: ${result?.text}`);
      return result;
    });
  }

  // Scheduling helpers
  private ensureThread(thread: string): ThreadState {
    let s = this.threads.get(thread);
    if (!s) {
      const created: ThreadState = { running: false, seq: 0, tokens: new Map() };
      this.threads.set(thread, created);
      return created;
    }
    return s;
  }

  private scheduleOrRun(thread: string) {
    const s = this.ensureThread(thread);
    if (s.running) return;
    const drained = this.buffer.tryDrainDescriptor(thread, this.processBuffer);
    if (!drained.messages.length) {
      const at = this.buffer.nextReadyAt(thread);
      if (at === undefined) return;
      const delay = Math.max(0, at - Date.now());
      if (s.timer) clearTimeout(s.timer);
      s.timer = setTimeout(() => {
        s.timer = undefined;
        this.scheduleOrRun(thread);
      }, delay);
      return;
    }
    this.startRun(thread, drained.messages, drained.tokenParts);
  }

  private maybeStart(thread: string) {
    this.scheduleOrRun(thread);
  }

  private startNext(thread: string) {
    this.scheduleOrRun(thread);
  }

  private async startRun(
    thread: string,
    batch: TriggerMessage[],
    tokenParts: { tokenId: string; count: number }[],
  ): Promise<void> {
    const s = this.ensureThread(thread);
    s.running = true;
    const runId = `${thread}/run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const ac = new AbortController();
    s.inFlight = { runId, includedCounts: new Map(tokenParts.map((p) => [p.tokenId, p.count])), abortController: ac, status: 'running' };
    this.logger.info(`Starting run ${runId} with ${batch.length} message(s)`);
    // Persist start (best-effort)
    try {
      const nodeId = this.getNodeId();
      if (nodeId && this.runService) await this.runService.startRun(nodeId, thread, runId);
    } catch {}
    try {
      const last = await this.runGraph(thread, batch, runId, ac.signal);
      // Success: resolve tokens fully included in this run
      const resolved: string[] = [];
      const inflight = s.inFlight as { includedCounts: Map<string, number> } | undefined;
      for (const [tokenId, included] of (inflight?.includedCounts || new Map<string, number>()).entries()) {
        const token = s.tokens.get(tokenId);
        if (!token) continue;
        if (included >= token.total) {
          try {
            token.resolve(last);
          } catch {}
          resolved.push(tokenId);
          s.tokens.delete(tokenId);
        }
      }
      this.logger.info(`Completed run ${runId}; resolved tokens: [${resolved.join(', ')}]`);
      } catch (e: any) {
        // Failure: reject awaiters for tokens tied to this run; leave others pending
        const run = s.inFlight as { includedCounts?: Map<string, number>; runId?: string } | undefined;
        const affected = run?.includedCounts ? Array.from(run.includedCounts.keys()) : [];
        this.logger.error(`Run ${(run && run.runId) || 'unknown'} failed for thread ${thread}: ${e?.message || e}`);
      for (const tokenId of affected) {
        const token = s.tokens.get(tokenId);
        if (!token) continue;
        try {
          token.reject(e);
        } catch {}
        s.tokens.delete(tokenId);
      }
      // Ensure no stale parts remain for these tokens in the buffer
      if (affected.length) this.buffer.dropTokens(thread, affected);
    } finally {
      // Persist termination (best-effort)
      try {
        const nodeId = this.getNodeId();
        if (nodeId && this.runService) await this.runService.markTerminated(nodeId, (s.inFlight && (s.inFlight as any).runId) || runId);
      } catch {}
      s.inFlight = undefined;
      s.running = false;
      this.startNext(thread);
    }
  }

  private async runGraph(thread: string, batch: TriggerMessage[], runId: string, abortSignal?: AbortSignal): Promise<BaseMessage | undefined> {
    // Preserve system vs human message kind when serializing for the model
    const items = batch.map((msg) =>
      isSystemTrigger(msg) ? new SystemMessage(JSON.stringify(msg)) : new HumanMessage(JSON.stringify(msg)),
    );
    const response = (await this.graph.invoke(
      { messages: { method: 'append', items } },
      {
        ...this.config,
        configurable: {
          ...this.config?.configurable,
          thread_id: thread,
          caller_agent: this as InjectionProvider,
          run_id: runId,
          abort_signal: abortSignal,
        },
      },
    )) as { messages: BaseMessage[] };
    return response.messages?.[response.messages.length - 1];
  }

  // Public injection surface: nodes may ask for injected messages to include in the same turn.
  getInjectedMessages(thread: string): BaseMessage[] {
    if (this.whenBusy !== 'injectAfterTools') return [];
    const s = this.ensureThread(thread);
    // If no in-flight run, do not drain for injection
    if (!s.running || !s.inFlight) return [];
    const drained = this.buffer.tryDrainDescriptor(thread, this.processBuffer);
    if (!drained.messages.length) return [];
    // Record token parts injected into this run for proper resolution
    for (const part of drained.tokenParts) {
      const prev = s.inFlight.includedCounts.get(part.tokenId) || 0;
      s.inFlight.includedCounts.set(part.tokenId, prev + part.count);
    }
    // Preserve message kind when injecting
    return drained.messages.map((m) =>
      isSystemTrigger(m) ? new SystemMessage(JSON.stringify(m)) : new HumanMessage(JSON.stringify(m)),
    );
  }

  // New universal teardown hook for graph runtime
  async destroy(): Promise<void> {
    // Resolve any pending awaiters to avoid hangs on teardown
    for (const [, s] of this.threads) {
      if (s.timer) clearTimeout(s.timer);
      for (const [, token] of s.tokens) {
        try {
          token.resolve(undefined);
        } catch {}
      }
      s.tokens.clear();
    }
    this.buffer.destroy();
    this.threads.clear();
  }

  // Expose current run id for a thread (for admin endpoints)
  getCurrentRunId(thread: string): string | undefined {
    const s = this.threads.get(thread);
    return s?.inFlight?.runId;
  }

  // Public helper: list active (running) thread ids, optionally filtered by prefix
  public listActiveThreads(prefix?: string): string[] {
    const out: string[] = [];
    for (const [threadId, state] of this.threads.entries()) {
      if (prefix && !threadId.startsWith(prefix)) continue;
      if (state.running) out.push(threadId);
    }
    return out;
  }

  // Cooperative termination: mark current run as terminating and abort signal
  terminateRun(thread: string, runId?: string): 'ok' | 'not_running' | 'not_found' {
    const s = this.threads.get(thread);
    if (!s || !s.running || !s.inFlight) return 'not_running';
    if (runId && s.inFlight.runId !== runId) return 'not_found';
    try {
      s.inFlight.status = 'terminating';
      s.inFlight.abortController.abort();
      // Persist transition best-effort
      const nodeId = this.getNodeId();
      void (async () => { try { if (nodeId && this.runService) await this.runService.markTerminating(nodeId, s.inFlight!.runId); } catch {} })();
      return 'ok';
    } catch {
      return 'not_running';
    }
  }

  abstract setConfig(_cfg: Record<string, unknown>): void | Promise<void>;
}
