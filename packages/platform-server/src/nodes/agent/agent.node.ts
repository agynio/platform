import { AIMessage, BaseMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';
import { RunnableConfig } from '@langchain/core/runnables';
import { tool as lcTool } from '@langchain/core/tools';
import { Annotation, AnnotationRoot, CompiledStateGraph, END, START, StateGraph } from '@langchain/langgraph';
import type { LangGraphRunnableConfig } from '@langchain/langgraph';
import { ChatOpenAI } from '@langchain/openai';
import { last } from 'lodash-es';
import { McpServer, McpTool } from '../../mcp';
import { isDynamicConfigurable, type StaticConfigurable } from '../../graph/capabilities';
import { inferArgsSchema } from '../../mcp/jsonSchemaToZod';
import { CallModelNode, type MemoryConnector } from '../../lgnodes/callModel.lgnode';
import { ToolsNode } from '../../lgnodes/tools.lgnode';
import { CheckpointerService } from '../../services/checkpointer.service';
import { ConfigService } from '../../services/config.service';
import { LoggerService } from '../../services/logger.service';
import { BaseTool } from '../../tools/base.tool';
import { LangChainToolAdapter } from '../../tools/langchainTool.adapter';
import { SummarizationNode } from '../../lgnodes/summarization.lgnode';
import { NodeOutput } from '../../types';
import { z } from 'zod';
import type { JSONSchema } from 'zod/v4/core';
import { EnforceRestrictionNode } from '../../lgnodes/enforceRestriction.lgnode';
import { stringify as toYaml } from 'yaml';
import { buildMcpToolError } from '../../mcp/errorUtils';
import { TriggerListener, TriggerMessage, isSystemTrigger } from '../../triggers/base.trigger';
import { withAgent } from '@agyn/tracing';
import { MessagesBuffer, ProcessBuffer } from '../../agents/messagesBuffer';
import type { AgentRunService } from '../../services/run.service';

// Ambient declaration for optional global run service
declare global {
  // eslint-disable-next-line no-var
  var __agentRunsService: import('../../services/run.service').AgentRunService | undefined;
}

// Inlined BaseAgent and related types (moved from previous base.agent.ts)

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
  reject: (e: unknown) => void;
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
      .strict();
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
      const inflight = s.inFlight;
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
      } catch (e: unknown) {
        // Failure: reject awaiters for tokens tied to this run; leave others pending
        const run = s.inFlight;
        const affected = run?.includedCounts ? Array.from(run.includedCounts.keys()) : [];
        const err = e instanceof Error ? e : new Error(String(e));
        this.logger.error(`Run ${(run && run.runId) || 'unknown'} failed for thread ${thread}: ${err.message}`);
      for (const tokenId of affected) {
        const token = s.tokens.get(tokenId);
        if (!token) continue;
        try {
          token.reject(err);
        } catch {}
        s.tokens.delete(tokenId);
      }
      // Ensure no stale parts remain for these tokens in the buffer
      if (affected.length) this.buffer.dropTokens(thread, affected);
    } finally {
      // Persist termination (best-effort)
      try {
        const nodeId = this.getNodeId();
        const currentRunId = s.inFlight?.runId ?? runId;
        if (nodeId && this.runService) await this.runService.markTerminated(nodeId, currentRunId);
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
      const rid = s.inFlight?.runId;
      void (async () => { try { if (nodeId && this.runService && rid) await this.runService.markTerminating(nodeId, rid); } catch {} })();
      return 'ok';
    } catch {
      return 'not_running';
    }
  }

  abstract setConfig(_cfg: Record<string, unknown>): void | Promise<void>;
}

/**
 * Zod schema describing static configuration for Agent.
 * Keep this colocated with the implementation so updates stay in sync.
 */
export const AgentStaticConfigSchema = z
  .object({
    title: z
      .string()
      .optional()
      .describe('Display name for this agent (UI only).'),
    model: z.string().default('gpt-5').describe('LLM model identifier to use for this agent (provider-specific name).'),
    systemPrompt: z
      .string()
      .default('You are a helpful AI assistant.')
      .describe('System prompt injected at the start of each conversation turn.')
      .meta({ 'ui:widget': 'textarea', 'ui:options': { rows: 6 } }),
    // Agent-side message buffer handling (exposed for Agent static config)
    debounceMs: z
      .number()
      .int()
      .min(0)
      .default(0)
      .describe('Debounce window (ms) for agent-side message buffer.'),
    whenBusy: z
      .enum(['wait', 'injectAfterTools'])
      .default('wait')
      .describe(
        "When agent is busy: 'wait' queues new messages for next run; 'injectAfterTools' injects them into the current run after tools stage.",
      )
      .meta({ 'ui:widget': 'select' }),
    processBuffer: z
      .enum(['allTogether', 'oneByOne'])
      .default('allTogether')
      .describe('Drain mode: process all queued messages together vs one message per run.')
      .meta({ 'ui:widget': 'select' }),
    summarizationKeepTokens: z
      .number()
      .int()
      .min(0)
      .default(0)
      .describe('Number of most-recent tokens to keep verbatim when summarizing context.'),
    summarizationMaxTokens: z
      .number()
      .int()
      .min(1)
      .default(512)
      .describe('Maximum token budget for generated summaries.'),
    restrictOutput: z
      .boolean()
      .default(false)
      .describe('When true, enforce calling a tool before finishing the turn.'),
    restrictionMessage: z
      .string()
      .default(
        "Do not produce a final answer directly. Before finishing, call a tool. If no tool is needed, call the 'finish' tool.",
      )
      .describe('Instruction injected to steer the model when restrictOutput=true.')
      .meta({ 'ui:widget': 'textarea', 'ui:options': { rows: 4 } }),
    restrictionMaxInjections: z
      .number()
      .int()
      .min(0)
      .default(0)
      .describe('Max enforcement injections per turn (0 = unlimited).'),
  })
  .strict();

export type AgentStaticConfig = z.infer<typeof AgentStaticConfigSchema>;
export class Agent extends BaseAgent {
  private callModelNode!: CallModelNode;
  private toolsNode!: ToolsNode;
  // Track tools registered per MCP server so we can remove them on detachment
  private mcpServerTools: Map<McpServer, BaseTool[]> = new Map();
  // Persist the underlying ChatOpenAI instance so we can update its model dynamically
  private llm!: ChatOpenAI;

  private summarizationKeepTokens?: number; // token budget for verbatim tail
  private summarizationMaxTokens?: number;
  private summarizeNode!: SummarizationNode;
  private enforceNode!: EnforceRestrictionNode;

  // Restriction config (static-config driven)
  private restrictOutput: boolean = false;
  private restrictionMessage: string =
    "Do not produce a final answer directly. Before finishing, call a tool. If no tool is needed, call the 'finish' tool.";
  private restrictionMaxInjections: number = 0; // 0 = unlimited per turn

  // Lifecycle/config propagation helpers
  private lifecycleStarted = false;
  private lifecycleConfigSnapshot: Partial<AgentStaticConfig> = {};
  // Allowed config keys for propagation; keep in sync with setConfig filtering
  private static readonly allowedConfigKeysArray = [
    'title',
    'model',
    'systemPrompt',
    'debounceMs',
    'whenBusy',
    'processBuffer',
    'summarizationKeepTokens',
    'summarizationMaxTokens',
    'restrictOutput',
    'restrictionMessage',
    'restrictionMaxInjections',
  ] as const satisfies readonly (keyof AgentStaticConfig)[];
  private static readonly allowedConfigKeys = new Set<typeof Agent.allowedConfigKeysArray[number]>(
    Agent.allowedConfigKeysArray,
  );

  constructor(
    private configService: ConfigService,
    private loggerService: LoggerService,
    private checkpointerService: CheckpointerService,
    private agentId?: string,
  ) {
    super(loggerService);
    this.init();
  }

  // Centralized ChatOpenAI instantiation to avoid duplication and env fallbacks
  private createLLM(model: string): ChatOpenAI {
    const apiKey = this.configService.openaiApiKey;
    const baseURL = this.configService.openaiBaseUrl;
    return new ChatOpenAI({
      model,
      apiKey,
      ...(baseURL ? { baseURL } : {}),
    });
  }

  // Expose nodeId for instrumentation (used by BaseAgent.withAgent wrapper)
  protected override getNodeId(): string | undefined {
    return this.agentId;
  }

  protected state() {
    return Annotation.Root({
      messages: Annotation<BaseMessage[], NodeOutput['messages']>({
        reducer: (left, right) => (!right ? left : right.method === 'append' ? [...left, ...right.items] : right.items),
        default: () => [],
      }),
      summary: Annotation<string, string>({
        reducer: (left, right) => right ?? left,
        default: () => '',
      }),
      done: Annotation<boolean, boolean>({
        reducer: (left, right) => right ?? left,
        default: () => false,
      }),
      restrictionInjectionCount: Annotation<number, number>({
        reducer: (left, right) => right ?? left,
        default: () => 0,
      }),
      restrictionInjected: Annotation<boolean, boolean>({
        reducer: (left, right) => right ?? left,
        default: () => false,
      }),
    });
  }

  init(config: RunnableConfig = { recursionLimit: 2500 }) {
    if (!this.agentId) throw new Error('agentId is required to initialize Agent');

    this._config = config;

    // Instantiate ChatOpenAI via factory; rely solely on ConfigService for credentials/base URL.
    this.llm = this.createLLM('gpt-5');

    this.callModelNode = new CallModelNode([], this.llm);
    // Pass this agent's node id to ToolsNode for span attribution
    this.toolsNode = new ToolsNode([], this.agentId);
    this.summarizeNode = new SummarizationNode(this.llm, {
      keepTokens: this.summarizationKeepTokens ?? 0,
      maxTokens: this.summarizationMaxTokens ?? 0,
    });

    // Read restriction config from static config and store locally for closures
    const cfgUnknown = this._staticConfig;
    const cfg =
      cfgUnknown && typeof cfgUnknown === 'object' ? (cfgUnknown as Partial<AgentStaticConfig>) : undefined;
    this.restrictOutput = !!cfg?.restrictOutput;
    this.restrictionMessage =
      cfg?.restrictionMessage ||
      "Do not produce a final answer directly. Before finishing, call a tool. If no tool is needed, call the 'finish' tool.";
    this.restrictionMaxInjections = cfg?.restrictionMaxInjections ?? 0;

    this.enforceNode = new EnforceRestrictionNode(
      () => this.restrictOutput,
      () => this.restrictionMessage,
      () => this.restrictionMaxInjections,
    );

    const builder = new StateGraph(
      {
        stateSchema: this.state(),
      },
      this.configuration(),
    )
      .addNode('summarize', async (state: { messages: BaseMessage[]; summary?: string }) => {
        const res = await this.summarizeNode.action(state);
        // Reset restriction counters per new turn
        return { ...res, restrictionInjectionCount: 0, restrictionInjected: false };
      })
      .addNode('call_model', this.callModelNode.action.bind(this.callModelNode))
      .addNode('tools', this.toolsNode.action.bind(this.toolsNode))
      .addNode('enforce', this.enforceNode.action.bind(this.enforceNode))
      .addEdge(START, 'summarize')
      .addEdge('summarize', 'call_model')
      .addConditionalEdges(
        'call_model',
        (state) => (last(state.messages as AIMessage[])?.tool_calls?.length ? 'tools' : 'enforce'),
        {
          tools: 'tools',
          enforce: 'enforce',
        },
      )
      .addConditionalEdges('enforce', (state) => (state.restrictionInjected === true ? 'call_model' : END), {
        call_model: 'call_model',
        [END]: END,
      })
      .addConditionalEdges('tools', (state) => (state.done === true ? END : 'summarize'), {
        [END]: END,
        summarize: 'summarize',
      });

    // Compile with a plain MongoDBSaver; scoping is handled via configurable.checkpoint_ns
    this._graph = builder.compile({
      checkpointer: this.checkpointerService.getCheckpointer(this.agentId),
    }) as CompiledStateGraph<unknown, unknown>;

    // Attach run service if runtime provided one via global. Best effort; no casts.
    try {
      const runSvc = globalThis.__agentRunsService;
      if (runSvc) {
        this.setRunService(runSvc);
      }
    } catch {}

    // Apply runtime scheduling defaults (debounce=0, whenBusy=wait) already set in BaseAgent; allow overrides from agentId namespace if needed later
    return this;
  }

  // Attach/detach a memory connector into the underlying CallModel
  attachMemoryConnector(
    mem?:
      | MemoryConnector
      | { getConnector?: () => MemoryConnector | undefined; createConnector?: () => MemoryConnector },
  ) {
    // Accept either a connector-like object or a provider exposing getConnector/createConnector
    type MemoryConnectorProvider = {
      getConnector?: () => MemoryConnector | undefined;
      createConnector?: () => MemoryConnector | undefined;
    };
    const isMemoryConnector = (obj: unknown): obj is MemoryConnector => {
      if (!obj || typeof obj !== 'object') return false;
      const rec = obj as Record<string, unknown>;
      return typeof rec.renderMessage === 'function' && typeof rec.getPlacement === 'function';
    };
    const isProvider = (obj: unknown): obj is MemoryConnectorProvider => {
      if (!obj || typeof obj !== 'object') return false;
      const rec = obj as Record<string, unknown>;
      return typeof rec.getConnector === 'function' || typeof rec.createConnector === 'function';
    };
    let connector: MemoryConnector | undefined = undefined;
    if (isMemoryConnector(mem)) {
      connector = mem;
    } else if (isProvider(mem)) {
      connector = mem.getConnector?.();
      if (!connector) connector = mem.createConnector?.();
    }
    this.callModelNode.setMemoryConnector(connector);
    this.loggerService.info('Agent memory connector attached');
  }
  detachMemoryConnector() {
    this.callModelNode.setMemoryConnector(undefined);
    this.loggerService.info('Agent memory connector detached');
  }

  addTool(tool: BaseTool) {
    // using any to avoid circular import issues if BaseTool is extended differently later
    this.callModelNode.addTool(tool);
    this.toolsNode.addTool(tool);
    this.loggerService.info(`Tool added to Agent: ${tool?.constructor?.name || 'UnknownTool'}`);
  }

  removeTool(tool: BaseTool) {
    this.callModelNode.removeTool(tool);
    this.toolsNode.removeTool(tool);
    this.loggerService.info(`Tool removed from Agent: ${tool?.constructor?.name || 'UnknownTool'}`);
  }

  /**
   * Attach an MCP server: starts it (idempotent), lists tools, and registers them as namespaced LangChain tools.
   */
  async addMcpServer(server: McpServer): Promise<void> {
    const namespace = server.namespace;
    if (this.mcpServerTools.has(server)) {
      this.loggerService.debug?.(`MCP server ${namespace} already added; skipping duplicate add.`);
      return;
    }
    this.mcpServerTools.set(server, []);
    // Track whether the initial (on 'ready') registration has completed. We ignore
    // dynamic config change events until this finishes to avoid a race where both
    // the initial registration and the dynamic sync attempt to add the same set
    // of tools concurrently, producing duplicates. (Observed symptom: inflated
    // Total tool count such as 111 when expecting 98 = 93 MCP + 5 static.)
    let initialRegistrationDone = false;

    // Registration function now only invoked on explicit ready event to avoid triggering
    // duplicate discovery flows (removes eager listTools() call which previously raced with start()).
    const getThreadId = (config?: LangGraphRunnableConfig): string | undefined => {
      const cfg = config?.configurable as Record<string, unknown> | undefined;
      if (!cfg) return undefined;
      const tid = cfg.thread_id as unknown;
      return tid == null ? undefined : String(tid);
    };

    const registerTools = async () => {
      try {
        const tools = await server.listTools();
        if (!tools.length) {
          this.loggerService.info(`No MCP tools discovered for namespace ${namespace}`);
        }
        const registered: BaseTool[] = [];
        for (const t of tools) {
          const schema = inferArgsSchema(t.inputSchema);
          const dynamic = lcTool(
            async (raw, config?: LangGraphRunnableConfig) => {
              this.loggerService.info(
                `Calling MCP tool ${t.name} in namespace ${namespace} with input: ${JSON.stringify(raw)}`,
              );
              const threadId = getThreadId(config);
              const res = await server.callTool(t.name, raw, { threadId });
              if (res.isError) {
                const { message, cause } = buildMcpToolError(res);
                throw new Error(message, { cause });
              }
              // Normalize structured content formatting across call sites (YAML)
              if (res.structuredContent) return toYaml(res.structuredContent);
              return res.content || '';
            },
            {
              name: `${namespace}_${t.name}`,
              description: t.description || `MCP tool ${t.name}`,
              schema,
            },
          );
          const adapted = new LangChainToolAdapter(dynamic, this.loggerService);
          // Defensive: skip if already present (e.g. if a dynamic sync slipped through).
          const existingNames = new Set(this.toolsNode.listTools().map((tool) => tool.init().name));
          if (existingNames.has(dynamic.name)) {
            this.loggerService.debug?.(
              `Skipping duplicate MCP tool registration ${dynamic.name} (initial register phase)`,
            );
          } else {
            this.addTool(adapted);
            registered.push(adapted);
          }
        }
        this.loggerService.info(
          `Registered ${tools.length} MCP tools for namespace ${namespace}. Total: ${this.toolsNode.listTools().length}`,
        );
        const existing = this.mcpServerTools.get(server) || [];
        this.mcpServerTools.set(server, existing.concat(registered));
        initialRegistrationDone = true;
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e));
        this.loggerService.error(`Failed to register MCP tools for ${namespace}: ${err.message}`);
      }
    };

    server.on('ready', () => registerTools());
    server.on('error', (err: unknown) => {
      const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
      this.loggerService.error(`MCP server ${namespace} error before tool registration: ${msg}`);
    });

    // Dynamic config synchronization: if server supports DynamicConfigurable, re-sync tool list
    if (isDynamicConfigurable<Record<string, boolean>>(server)) {
      server.onDynamicConfigChanged(async () => {
        // Ignore dynamic sync events until after initial registration to prevent duplicate adds.
        if (!initialRegistrationDone) {
          this.loggerService.debug?.(
            `Dynamic config change for ${namespace} received before initial registration complete; ignoring (will be captured by initial listTools filter).`,
          );
          return;
        }
        // Re-list tools (already filtered by server dynamic config) and diff against currently registered
        try {
          const tools: McpTool[] = await server.listTools();
          const desiredNames = new Set(tools.map((t) => `${namespace}_${t.name}`));
          const existing = this.mcpServerTools.get(server) || [];
          const existingByName = new Map(existing.map((tool) => [tool.init().name, tool]));

          const existingNames = new Set(existingByName.keys());
          const removedNames: string[] = [];
          const addedNames: string[] = [];
          for (const name of existingNames) if (!desiredNames.has(name)) removedNames.push(name);
          for (const name of desiredNames) if (!existingNames.has(name)) addedNames.push(name);
          if (addedNames.length || removedNames.length) {
            this.loggerService.info(
              `Dynamic MCP tool sync (${namespace}) diff: +[${addedNames.join(', ')}] -[${removedNames.join(', ')}]`,
            );
          } else {
            this.loggerService.debug?.(`Dynamic MCP tool sync (${namespace}) no changes`);
          }

          // Remove tools no longer enabled
          for (const [name, tool] of existingByName.entries()) {
            if (!desiredNames.has(name)) {
              this.removeTool(tool);
              this.mcpServerTools.set(
                server,
                (this.mcpServerTools.get(server) || []).filter((t) => t !== tool),
              );
            }
          }
          // Add newly enabled tools not present
          for (const t of tools) {
            const toolName = `${namespace}_${t.name}`;
            if (!existingByName.has(toolName)) {
              const schema = inferArgsSchema(t.inputSchema);
              const dynamic = lcTool(
                async (raw, config?: LangGraphRunnableConfig) => {
                  this.loggerService.info(
                    `Calling MCP tool ${t.name} in namespace ${namespace} with input: ${JSON.stringify(raw)}`,
                  );
                  const threadId = getThreadId(config);
                  const res = await server.callTool(t.name, raw, { threadId });
                  if (res.isError) {
                    const { message, cause } = buildMcpToolError(res);
                    throw new Error(message, { cause });
                  }
                  // Normalize structured content formatting across call sites (YAML)
                  if (res.structuredContent) return toYaml(res.structuredContent);
                  return res.content || '';
                },
                {
                  name: toolName,
                  description: t.description || `MCP tool ${t.name}`,
                  schema,
                },
              );
              const adapted = new LangChainToolAdapter(dynamic, this.loggerService);
              this.addTool(adapted);
              const updated = this.mcpServerTools.get(server) || [];
              updated.push(adapted);
              this.mcpServerTools.set(server, updated);
            }
          }
        } catch (e) {
          const err = e instanceof Error ? e : new Error(String(e));
          this.loggerService.error(`Failed dynamic MCP tool sync for ${namespace}: ${err.message}`);
        }
      });
    }
  }

  /**
   * Dynamically set configuration values like the system prompt.
   */
  // Overload preserves BaseAgent signature while exposing a more precise config shape for callers.
  setConfig(config: Partial<AgentStaticConfig> & Record<string, unknown>): void;
  setConfig(config: Record<string, unknown>): void {
    // Validate using strict partial schema against provided config; throws ZodError on unknown keys or invalid input
    const parsedConfig = AgentStaticConfigSchema.partial().strict().parse(config) as Partial<AgentStaticConfig>;

    // Apply agent-side scheduling config
    this.applyRuntimeConfig(config);

    // Only update fields explicitly provided by caller; rely on Zod-parsed values for type safety
    if (Object.prototype.hasOwnProperty.call(config, 'systemPrompt') && parsedConfig.systemPrompt !== undefined) {
      this.callModelNode.setSystemPrompt(parsedConfig.systemPrompt);
      this.loggerService.info('Agent system prompt updated');
    }

    if (Object.prototype.hasOwnProperty.call(config, 'model') && parsedConfig.model) {
      // Recreate ChatOpenAI via factory with provided model, then rebind
      const newLLM = this.createLLM(parsedConfig.model);
      this.llm = newLLM;
      this.callModelNode.setLLM(newLLM);
      this.summarizeNode.setLLM(newLLM);
      this.loggerService.info(`Agent model updated to ${parsedConfig.model}`);
    }

    // Summarization options: rely on Zod validation and apply only provided fields
    const updates: { keepTokens?: number; maxTokens?: number } = {};
    if (
      Object.prototype.hasOwnProperty.call(config, 'summarizationKeepTokens') &&
      parsedConfig.summarizationKeepTokens !== undefined
    ) {
      this.summarizationKeepTokens = parsedConfig.summarizationKeepTokens;
      updates.keepTokens = parsedConfig.summarizationKeepTokens;
    }
    if (
      Object.prototype.hasOwnProperty.call(config, 'summarizationMaxTokens') &&
      parsedConfig.summarizationMaxTokens !== undefined
    ) {
      this.summarizationMaxTokens = parsedConfig.summarizationMaxTokens;
      updates.maxTokens = parsedConfig.summarizationMaxTokens;
    }
    if (updates.keepTokens !== undefined || updates.maxTokens !== undefined) {
      this.summarizeNode.setOptions(updates);
      this.loggerService.info('Agent summarization options updated');
    }

    // Apply restriction-related config without altering system prompt
    if (Object.prototype.hasOwnProperty.call(config, 'restrictOutput') && parsedConfig.restrictOutput !== undefined)
      this.restrictOutput = !!parsedConfig.restrictOutput;
    if (Object.prototype.hasOwnProperty.call(config, 'restrictionMessage') && parsedConfig.restrictionMessage !== undefined)
      this.restrictionMessage = parsedConfig.restrictionMessage;
    if (
      Object.prototype.hasOwnProperty.call(config, 'restrictionMaxInjections') &&
      parsedConfig.restrictionMaxInjections !== undefined
    )
      this.restrictionMaxInjections = parsedConfig.restrictionMaxInjections;
  }

  // ----- Node: configure/start/stop/delete -----
  configure(cfg: Record<string, unknown>): void {
    // Keep only allowed keys; do not inject defaults; store snapshot for start() and diff updates
    const incoming = Object.fromEntries(
      Object.entries(cfg || {}).filter(([k]) =>
        Agent.allowedConfigKeys.has(k as (typeof Agent.allowedConfigKeysArray)[number]),
      ),
    ) as Partial<AgentStaticConfig> & Record<string, unknown>;
    if (!this.lifecycleStarted) {
      // Before start: replace snapshot
      this.lifecycleConfigSnapshot = { ...incoming };
      return;
    }
    // After start: compute delta and apply only changed keys to avoid resetting unspecified fields
    const delta: Record<string, unknown> = {};
    const prev = this.lifecycleConfigSnapshot;
    let changed = false;
    for (const [k, v] of Object.entries(incoming)) {
      const before = (prev as Partial<AgentStaticConfig> & Record<string, unknown>)[k];
      const same = JSON.stringify(before) === JSON.stringify(v);
      if (!same) {
        delta[k] = v;
        changed = true;
      }
    }
    // Merge snapshot
    this.lifecycleConfigSnapshot = { ...prev, ...incoming };
    if (changed) this.setConfig(delta);
  }

  async start(): Promise<void> {
    if (this.lifecycleStarted) return; // idempotent
    this.lifecycleStarted = true;
    const cfg = this.lifecycleConfigSnapshot;
    if (cfg && Object.keys(cfg).length > 0) {
      // Propagate all stored keys immediately
      this.setConfig(cfg);
    }
  }

  async stop(): Promise<void> {
    // no-op for now
  }

  async delete(): Promise<void> {
    await this.destroy();
  }

  /**
   * Detach MCP server: unregister its tools and stop/destroy it if it has lifecycle methods.
   */
  async removeMcpServer(server: McpServer): Promise<void> {
    const tools = this.mcpServerTools.get(server);
    if (tools && tools.length) {
      for (const tool of tools) {
        this.removeTool(tool);
      }
    }
    this.mcpServerTools.delete(server);
    // Attempt to call stop/destroy lifecycle if available using type guards
    try {
      if ('destroy' in server && typeof (server as any).destroy === 'function') {
        await (server as any).destroy();
      } else if ('stop' in server && typeof (server as any).stop === 'function') {
        await (server as any).stop();
      }
    } catch (e: unknown) {
      const err = e instanceof Error ? e : new Error(String(e));
      const msg = `${err.name}: ${err.message}`;
      this.loggerService.error(`Error destroying MCP server ${server.namespace}: ${msg}`);
    }
  }
}
