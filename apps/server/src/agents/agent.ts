import { AIMessage, BaseMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';
import { RunnableConfig } from '@langchain/core/runnables';
import { tool as lcTool } from '@langchain/core/tools';
import { Annotation, AnnotationRoot, CompiledStateGraph, END, START, StateGraph } from '@langchain/langgraph';
import { ChatOpenAI } from '@langchain/openai';
import { last } from 'lodash-es';
import { McpServer, McpTool } from '../mcp';
import { isDynamicConfigurable, type StaticConfigurable } from '../graph/capabilities';
import { inferArgsSchema } from '../mcp/jsonSchemaToZod';
import { CallModelNode, type MemoryConnector } from '../lgnodes/callModel.lgnode';
import { ToolsNode } from '../lgnodes/tools.lgnode';
import { CheckpointerService } from '../services/checkpointer.service';
import { ConfigService } from '../services/config.service';
import { LoggerService } from '../services/logger.service';
import { BaseTool } from '../tools/base.tool';
import { LangChainToolAdapter } from '../tools/langchainTool.adapter';
import { SummarizationNode } from '../lgnodes/summarization.lgnode';
import { EnforceRestrictionNode } from '../lgnodes/enforceRestriction.lgnode';
import { NodeOutput } from '../types';
import { z } from 'zod';
import { stringify as toYaml } from 'yaml';
import { buildMcpToolError } from '../mcp/errorUtils';
import { withAgent } from '@hautech/obs-sdk';
import { TriggerListener, TriggerMessage, isSystemTrigger } from '../triggers/base.trigger';
import { JSONSchema } from 'zod/v4/core';
import { MessagesBuffer, ProcessBuffer } from './messages-buffer';

export type WhenBusyMode = 'wait' | 'injectAfterTools';

// Minimal interface exposed to nodes to request agent-controlled injections.
export interface InjectionProvider {
  getInjectedMessages(thread: string): BaseMessage[];
}

type InvocationToken = {
  id: string;
  total: number; // number of messages contributed by this invocation
  resolve: (m: BaseMessage | undefined) => void;
  reject: (e: any) => void;
};

// Static config schema (public)
export const AgentStaticConfigSchema = z
  .object({
    title: z.string().optional().describe('Display name (UI only).'),
    model: z.string().default('gpt-5').describe('LLM model identifier'),
    systemPrompt: z
      .string()
      .default('You are a helpful AI assistant.')
      .describe('System prompt injected at the start of each turn.')
      .meta({ 'ui:widget': 'textarea', 'ui:options': { rows: 6 } }),
    debounceMs: z.number().int().min(0).default(0).describe('Debounce window (ms) for agent-side buffer.'),
    whenBusy: z
      .enum(['wait', 'injectAfterTools'])
      .default('wait')
      .describe("Busy behavior: 'wait' queues; 'injectAfterTools' injects during tools stage.")
      .meta({ 'ui:widget': 'select' }),
    processBuffer: z
      .enum(['allTogether', 'oneByOne'])
      .default('allTogether')
      .describe('Drain mode: process all queued messages vs one-by-one.')
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

/**
 * Unified Agent implementation (merges previous BaseAgent + SimpleAgent).
 * - Provides scheduling/buffering/injection and LangGraph building.
 * - Implements lifecycle: configure/start/stop/delete.
 * - Public API: invoke(), addTool/removeTool, addMcpServer/removeMcpServer,
 *   attachMemoryConnector/detachMemoryConnector, getConfigSchema().
 */
export class Agent implements TriggerListener, StaticConfigurable, InjectionProvider {
  // LangGraph runtime
  protected _graph: CompiledStateGraph<unknown, unknown> | undefined;
  protected _config: RunnableConfig | undefined;
  protected _staticConfig: Record<string, unknown> | undefined;

  // Scheduling/buffering
  protected buffer = new MessagesBuffer({ debounceMs: 0 });
  private whenBusy: WhenBusyMode = 'wait';
  private processBuffer: ProcessBuffer = ProcessBuffer.AllTogether;

  private threads: Map<
    string,
    {
      running: boolean;
      seq: number;
      tokens: Map<string, InvocationToken>;
      inFlight?: { runId: string; includedCounts: Map<string, number>; abort?: AbortController };
      timer?: NodeJS.Timeout;
    }
  > = new Map();

  // Graph components (initialized on start())
  private callModelNode!: CallModelNode;
  private toolsNode!: ToolsNode;
  private summarizeNode!: SummarizationNode;
  private enforceNode!: EnforceRestrictionNode;
  private llm!: ChatOpenAI;

  // Tools / MCP tracking
  private mcpServerTools: Map<McpServer, BaseTool[]> = new Map();
  private preStartTools: BaseTool[] = [];
  private pendingMcpServers: Set<McpServer> = new Set();
  private pendingMemoryConnector:
    | (MemoryConnector | { getConnector?: () => MemoryConnector | undefined; createConnector?: () => MemoryConnector })
    | undefined;

  // Summarization options
  private summarizationKeepTokens?: number;
  private summarizationMaxTokens?: number;

  // Restriction config (static-config driven)
  private restrictOutput: boolean = false;
  private restrictionMessage: string =
    "Do not produce a final answer directly. Before finishing, call a tool. If no tool is needed, call the 'finish' tool.";
  private restrictionMaxInjections: number = 0;

  private started = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly loggerService: LoggerService,
    private readonly checkpointerService: CheckpointerService,
    private readonly agentId: string,
  ) {
    // Initialize LLM early so setConfig can mutate model before start(); preserves object identity
    // Other graph components are created on start().
    this.llm = new ChatOpenAI({ model: 'gpt-5', apiKey: this.configService.openaiApiKey });
  }

  protected getNodeId(): string | undefined {
    return this.agentId;
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

  protected configuration(): AnnotationRoot<{}> {
    return Annotation.Root({});
  }

  getConfigSchema(): JSONSchema.BaseSchema {
    return z.toJSONSchema(AgentStaticConfigSchema as any);
  }

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

  // Lifecycle: configure (static config)
  configure(config: Record<string, unknown>): void {
    this._staticConfig = { ...(config || {}) };
    this.setConfig(config);
  }

  // Runtime config (called by LiveGraphRuntime)
  setConfig(config: Record<string, unknown>): void {
    const parsed = AgentStaticConfigSchema.partial().parse(
      Object.fromEntries(
        Object.entries(config).filter(([k]) =>
          [
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
          ].includes(k),
        ),
      ),
    ) as Partial<z.infer<typeof AgentStaticConfigSchema>>;

    this.applyRuntimeConfig(config);

    if (parsed.systemPrompt !== undefined && this.callModelNode) {
      this.callModelNode.setSystemPrompt(parsed.systemPrompt);
      this.loggerService.info('Agent system prompt updated');
    }
    if (parsed.model !== undefined && this.llm) {
      this.llm.model = parsed.model;
      this.loggerService.info(`Agent model updated to ${parsed.model}`);
    }

    const keepTokensRaw =
      (config as any).summarizationKeepTokens !== undefined
        ? (config as any).summarizationKeepTokens
        : (config as any).summarizationKeepLast;
    const maxTokensRaw = (config as any).summarizationMaxTokens;
    const isInt = (v: unknown) => typeof v === 'number' && Number.isInteger(v);
    const updates: { keepTokens?: number; maxTokens?: number } = {};
    if (keepTokensRaw !== undefined) {
      if (!(isInt(keepTokensRaw) && keepTokensRaw >= 0)) throw new Error('summarizationKeepTokens must be >= 0');
      this.summarizationKeepTokens = keepTokensRaw;
      updates.keepTokens = keepTokensRaw;
    }
    if (maxTokensRaw !== undefined) {
      if (!(isInt(maxTokensRaw) && maxTokensRaw > 0)) throw new Error('summarizationMaxTokens must be > 0');
      this.summarizationMaxTokens = maxTokensRaw;
      updates.maxTokens = maxTokensRaw;
    }
    if ((updates.keepTokens !== undefined || updates.maxTokens !== undefined) && this.summarizeNode) {
      this.summarizeNode.setOptions(updates);
      this.loggerService.info('Agent summarization options updated');
    }

    if (parsed.restrictOutput !== undefined) this.restrictOutput = !!parsed.restrictOutput;
    if (parsed.restrictionMessage !== undefined) this.restrictionMessage = parsed.restrictionMessage;
    if (parsed.restrictionMaxInjections !== undefined)
      this.restrictionMaxInjections = parsed.restrictionMaxInjections;
  }

  // Lifecycle: start (lazy build and compile graph)
  async start(config: RunnableConfig = { recursionLimit: 2500 }): Promise<void> {
    if (this.started) return;
    this._config = config;

    // llm already initialized in constructor to preserve identity
    this.callModelNode = new CallModelNode([], this.llm);
    this.toolsNode = new ToolsNode([], this.agentId);
    this.summarizeNode = new SummarizationNode(this.llm, {
      keepTokens: this.summarizationKeepTokens ?? 0,
      maxTokens: this.summarizationMaxTokens ?? 0,
    });
    this.enforceNode = new EnforceRestrictionNode(
      () => this.restrictOutput,
      () => this.restrictionMessage,
      () => this.restrictionMaxInjections,
    );

    const builder = new StateGraph({ stateSchema: this.state() }, this.configuration())
      .addNode('summarize', async (state: { messages: BaseMessage[]; summary?: string }) => {
        const res = await this.summarizeNode.action(state);
        return { ...res, restrictionInjectionCount: 0, restrictionInjected: false };
      })
      .addNode('call_model', this.callModelNode.action.bind(this.callModelNode))
      .addNode('tools', this.toolsNode.action.bind(this.toolsNode))
      .addNode('enforce', this.enforceNode.action.bind(this.enforceNode))
      .addEdge(START, 'summarize')
      .addEdge('summarize', 'call_model')
      .addConditionalEdges(
        'call_model',
        (state) => ((last(state.messages as AIMessage[]) as AIMessage | undefined)?.tool_calls?.length ? 'tools' : 'enforce'),
        { tools: 'tools', enforce: 'enforce' },
      )
      .addConditionalEdges('enforce', (state) => (state.restrictionInjected === true ? 'call_model' : END), {
        call_model: 'call_model',
        [END]: END,
      })
      .addConditionalEdges('tools', (state) => (state.done === true ? END : 'summarize'), {
        [END]: END,
        summarize: 'summarize',
      });

    this._graph = builder.compile({ checkpointer: this.checkpointerService.getCheckpointer(this.agentId) }) as any;

    // Apply any pre-start attachments
    if (this.preStartTools.length) {
      for (const t of this.preStartTools) { this.callModelNode.addTool(t); this.toolsNode.addTool(t); }
      this.loggerService.info(`Applied ${this.preStartTools.length} pre-start tools`);
    }
    if (this.pendingMemoryConnector) {
      this.attachMemoryConnector(this.pendingMemoryConnector as any);
    }
    if (this.pendingMcpServers.size) {
      for (const s of this.pendingMcpServers) {
        try { await this.registerMcpServerTools(s); } catch (e) { this.loggerService.error(`Failed MCP init for ${s.namespace}`); }
      }
    }
    this.started = true;
  }

  // Lifecycle: stop (abort in-flight runs)
  async stop(): Promise<void> {
    for (const [, s] of this.threads) {
      if (s.inFlight?.abort) {
        try { s.inFlight.abort.abort(); } catch {}
      }
      if (s.timer) { clearTimeout(s.timer); s.timer = undefined; }
    }
  }

  // Lifecycle: delete (detach MCP/memory and cleanup)
  async delete(): Promise<void> {
    for (const [server, tools] of Array.from(this.mcpServerTools.entries())) {
      try { if (tools && tools.length) tools.forEach((t) => this.removeTool(t)); } catch {}
      try {
        const anyServer: any = server as any;
        if (typeof anyServer.destroy === 'function') await anyServer.destroy();
        else if (typeof anyServer.stop === 'function') await anyServer.stop();
      } catch {}
      this.mcpServerTools.delete(server);
    }
    for (const [, s] of this.threads) {
      if (s.timer) clearTimeout(s.timer);
      for (const [, token] of s.tokens) { try { token.resolve(undefined); } catch {} }
      s.tokens.clear();
    }
    this.buffer.destroy();
    this.threads.clear();
  }

  async invoke(thread: string, messages: TriggerMessage[] | TriggerMessage): Promise<BaseMessage | undefined> {
    await this.start();
    return await withAgent({ threadId: thread, nodeId: this.getNodeId(), inputParameters: [{ thread }, { messages }] }, async () => {
      const batch = Array.isArray(messages) ? messages : [messages];
      const kinds = batch.reduce(
        (acc, m) => { if (isSystemTrigger(m)) acc.system += 1; else acc.human += 1; return acc; },
        { human: 0, system: 0 },
      );
      this.loggerService.info(
        `New trigger event in thread ${thread} (messages=${batch.length}, human=${kinds.human}, system=${kinds.system})`,
      );
      const s = this.ensureThread(thread);

      if (this.processBuffer === ProcessBuffer.OneByOne && batch.length > 1) {
        const promises: Promise<BaseMessage | undefined>[] = [];
        for (const msg of batch) {
          const tid = `${thread}:${++s.seq}`;
          this.buffer.enqueueWithToken(thread, tid, [msg]);
          promises.push(new Promise<BaseMessage | undefined>((resolve, reject) => {
            s.tokens.set(tid, { id: tid, total: 1, resolve, reject });
          }));
        }
        this.maybeStart(thread);
        const results = await Promise.all(promises);
        const lastRes = results[results.length - 1];
        this.loggerService.info(`Agent response in thread ${thread}: ${lastRes?.text}`);
        return lastRes;
      }

      const tokenId = `${thread}:${++s.seq}`;
      this.buffer.enqueueWithToken(thread, tokenId, batch);
      const p = new Promise<BaseMessage | undefined>((resolve, reject) => {
        s.tokens.set(tokenId, { id: tokenId, total: batch.length, resolve, reject });
      });
      this.maybeStart(thread);
      const result = await p;
      this.loggerService.info(`Agent response in thread ${thread}: ${result?.text}`);
      return result;
    });
  }

  private ensureThread(thread: string) {
    let s = this.threads.get(thread);
    if (!s) { s = { running: false, seq: 0, tokens: new Map() } as any; this.threads.set(thread, s); }
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
      s.timer = setTimeout(() => { s.timer = undefined; this.scheduleOrRun(thread); }, delay);
      return;
    }
    this.startRun(thread, drained.messages, drained.tokenParts);
  }
  private maybeStart(thread: string) { this.scheduleOrRun(thread); }
  private startNext(thread: string) { this.scheduleOrRun(thread); }

  private async startRun(
    thread: string,
    batch: TriggerMessage[],
    tokenParts: { tokenId: string; count: number }[],
  ): Promise<void> {
    const s = this.ensureThread(thread);
    s.running = true;
    const runId = `${thread}/run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const abort = new AbortController();
    s.inFlight = { runId, includedCounts: new Map(tokenParts.map((p) => [p.tokenId, p.count])), abort };
    this.loggerService.info(`Starting run ${runId} with ${batch.length} message(s)`);
    try {
      const last = await this.runGraph(thread, batch, runId, abort);
      const resolved: string[] = [];
      for (const [tokenId, included] of s.inFlight!.includedCounts.entries()) {
        const token = s.tokens.get(tokenId);
        if (!token) continue;
        if (included >= token.total) { try { token.resolve(last); } catch {} resolved.push(tokenId); s.tokens.delete(tokenId); }
      }
      this.loggerService.info(`Completed run ${runId}; resolved tokens: [${resolved.join(', ')}]`);
    } catch (e: any) {
      const run = s.inFlight;
      const affected = run ? Array.from(run.includedCounts.keys()) : [];
      this.loggerService.error(`Run ${run?.runId || 'unknown'} failed for thread ${thread}: ${e?.message || e}`);
      for (const tokenId of affected) {
        const token = s.tokens.get(tokenId);
        if (!token) continue;
        try { token.reject(e); } catch {}
        s.tokens.delete(tokenId);
      }
      if (affected.length) this.buffer.dropTokens(thread, affected);
    } finally {
      s.inFlight = undefined;
      s.running = false;
      this.startNext(thread);
    }
  }

  private async runGraph(
    thread: string,
    batch: TriggerMessage[],
    runId: string,
    abort: AbortController,
  ): Promise<BaseMessage | undefined> {
    const items = batch.map((msg) =>
      isSystemTrigger(msg) ? new SystemMessage(JSON.stringify(msg)) : new HumanMessage(JSON.stringify(msg)),
    );
    const response = (await this.graph.invoke(
      { messages: { method: 'append', items } },
      {
        ...this.config,
        signal: abort.signal,
        configurable: {
          ...this.config?.configurable,
          thread_id: thread,
          caller_agent: this as InjectionProvider,
          run_id: runId,
        },
      },
    )) as { messages: BaseMessage[] };
    return response.messages?.[response.messages.length - 1];
  }

  getInjectedMessages(thread: string): BaseMessage[] {
    if (this.whenBusy !== 'injectAfterTools') return [];
    const s = this.ensureThread(thread);
    if (!s.running || !s.inFlight) return [];
    const drained = this.buffer.tryDrainDescriptor(thread, this.processBuffer);
    if (!drained.messages.length) return [];
    for (const part of drained.tokenParts) {
      const prev = s.inFlight.includedCounts.get(part.tokenId) || 0;
      s.inFlight.includedCounts.set(part.tokenId, prev + part.count);
    }
    return drained.messages.map((m) =>
      isSystemTrigger(m) ? new SystemMessage(JSON.stringify(m)) : new HumanMessage(JSON.stringify(m)),
    );
  }

  get graph() { if (!this._graph) throw new Error('Agent not initialized. Graph is undefined.'); return this._graph; }
  get config() { if (!this._config) throw new Error('Agent not initialized. Config is undefined.'); return this._config; }

  attachMemoryConnector(
    mem?:
      | MemoryConnector
      | { getConnector?: () => MemoryConnector | undefined; createConnector?: () => MemoryConnector },
  ) {
    this.pendingMemoryConnector = mem;
    let connector: MemoryConnector | undefined = undefined;
    if (mem && typeof (mem as MemoryConnector).renderMessage === 'function') {
      connector = mem as MemoryConnector;
    } else if (mem && 'getConnector' in (mem as any) && typeof (mem as any).getConnector === 'function') {
      const prov = mem as any;
      connector = prov.getConnector?.();
      if (!connector && 'createConnector' in prov && typeof prov.createConnector === 'function') {
        connector = prov.createConnector();
      }
    }
    if (this.callModelNode) this.callModelNode.setMemoryConnector(connector);
    this.loggerService.info('Agent memory connector attached');
  }
  detachMemoryConnector() {
    if (this.callModelNode) this.callModelNode.setMemoryConnector(undefined);
    this.loggerService.info('Agent memory connector detached');
  }

  addTool(tool: BaseTool) {
    if (this.callModelNode && this.toolsNode) {
      this.callModelNode.addTool(tool);
      this.toolsNode.addTool(tool);
    } else {
      this.preStartTools.push(tool);
    }
    this.loggerService.info(`Tool added to Agent: ${tool?.constructor?.name || 'UnknownTool'}`);
  }
  removeTool(tool: BaseTool) {
    if (this.callModelNode && this.toolsNode) {
      this.callModelNode.removeTool(tool);
      this.toolsNode.removeTool(tool);
    }
    this.preStartTools = this.preStartTools.filter((t) => t !== tool);
    this.loggerService.info(`Tool removed from Agent: ${tool?.constructor?.name || 'UnknownTool'}`);
  }

  async addMcpServer(server: McpServer): Promise<void> {
    const namespace = server.namespace;
    if (this.mcpServerTools.has(server)) {
      this.loggerService.debug?.(`MCP server ${namespace} already added; skipping duplicate add.`);
      return;
    }
    this.mcpServerTools.set(server, []);
    let initialRegistrationDone = false;
    this.pendingMcpServers.add(server);

    const registerTools = async () => {
      try {
        if (!this.toolsNode) { return; }
        const tools = await server.listTools();
        if (!tools.length) this.loggerService.info(`No MCP tools discovered for namespace ${namespace}`);
        const registered: BaseTool[] = [];
        for (const t of tools) {
          const schema = inferArgsSchema(t.inputSchema);
          const dynamic = lcTool(
            async (raw, config) => {
              this.loggerService.info(
                `Calling MCP tool ${t.name} in namespace ${namespace} with input: ${JSON.stringify(raw)}`,
              );
              const threadId = (config as any)?.configurable?.thread_id;
              const res = await server.callTool(t.name, raw, { threadId });
              if (res.isError) { const { message, cause } = buildMcpToolError(res); throw new Error(message, { cause }); }
              if (res.structuredContent) return toYaml(res.structuredContent);
              return res.content || '';
            },
            { name: `${namespace}_${t.name}`, description: t.description || `MCP tool ${t.name}`, schema },
          );
          const adapted = new LangChainToolAdapter(dynamic, this.loggerService);
          const existingNames = new Set(this.toolsNode.listTools().map((tool) => tool.init().name));
          if (!existingNames.has(dynamic.name)) { this.addTool(adapted); registered.push(adapted); }
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

    if (isDynamicConfigurable<Record<string, boolean>>(server)) {
      server.onDynamicConfigChanged(async () => {
        if (!initialRegistrationDone) { this.loggerService.debug?.(`Dynamic config pre-initial; ignoring.`); return; }
        try {
          if (!this.toolsNode) return;
          const tools: McpTool[] = await server.listTools();
          const desiredNames = new Set(tools.map((t) => `${namespace}_${t.name}`));
          const existing = this.mcpServerTools.get(server) || [];
          const existingByName = new Map(existing.map((tool) => [tool.init().name, tool]));

          for (const [name, tool] of existingByName.entries()) {
            if (!desiredNames.has(name)) {
              this.removeTool(tool);
              this.mcpServerTools.set(server, (this.mcpServerTools.get(server) || []).filter((t) => t !== tool));
            }
          }
          for (const t of tools) {
            const toolName = `${namespace}_${t.name}`;
            if (!existingByName.has(toolName)) {
              const schema = inferArgsSchema(t.inputSchema);
              const dynamic = lcTool(
                async (raw, config) => {
                  this.loggerService.info(
                    `Calling MCP tool ${t.name} in namespace ${namespace} with input: ${JSON.stringify(raw)}`,
                  );
                  const threadId = (config as any)?.configurable?.thread_id;
                  const res = await server.callTool(t.name, raw, { threadId });
                  if (res.isError) { const { message, cause } = buildMcpToolError(res); throw new Error(message, { cause }); }
                  if (res.structuredContent) return toYaml(res.structuredContent);
                  return res.content || '';
                },
                { name: toolName, description: t.description || `MCP tool ${t.name}`, schema },
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

    // If already started, perform initial registration now
    if (this.started) await registerTools();
  }

  async removeMcpServer(server: McpServer): Promise<void> {
    const tools = this.mcpServerTools.get(server);
    if (tools && tools.length) for (const tool of tools) this.removeTool(tool);
    this.mcpServerTools.delete(server);
    this.pendingMcpServers.delete(server);
    const anyServer: any = server;
    try {
      if (typeof anyServer.destroy === 'function') await anyServer.destroy();
      else if (typeof anyServer.stop === 'function') await anyServer.stop();
    } catch (e) {
      const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
      this.loggerService.error(`Error destroying MCP server ${server.namespace}: ${msg}`);
    }
  }

  private async registerMcpServerTools(server: McpServer): Promise<void> {
    // Helper to register tools for a server when starting
    return new Promise((resolve) => {
      const done = () => resolve();
      const tryRegister = async () => {
        try { await (async () => { /* reuse logic by emitting ready */ })(); } finally { done(); }
      };
      // Trigger initial registration path
      // We cannot directly call internal function; emit via ready handler
      server.emit?.('ready');
      // Fallback in case server doesn't emit synchronously
      setTimeout(tryRegister, 0);
    });
  }
}
