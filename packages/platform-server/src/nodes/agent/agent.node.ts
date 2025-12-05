import { LocalMCPServerNode } from '../mcp';

import { ConfigService } from '../../core/services/config.service';

import { z } from 'zod';

import {
  AIMessage,
  FunctionTool,
  Loop,
  Reducer,
  ResponseMessage,
  Router,
  ToolCallMessage,
  ToolCallOutputMessage,
} from '@agyn/llm';

import { LLMProvisioner } from '../../llm/provisioners/llm.provisioner';
import { CallModelLLMReducer } from '../../llm/reducers/callModel.llm.reducer';
import { CallToolsLLMReducer } from '../../llm/reducers/callTools.llm.reducer';
import { ConditionalLLMRouter } from '../../llm/routers/conditional.llm.router';
import { StaticLLMRouter } from '../../llm/routers/static.llm.router';
import { CallerAgent, LLMContext, LLMState } from '../../llm/types';

import { EnforceToolsLLMReducer } from '../../llm/reducers/enforceTools.llm.reducer';
import { LoadLLMReducer } from '../../llm/reducers/load.llm.reducer';
import { SaveLLMReducer } from '../../llm/reducers/save.llm.reducer';
import { SummarizationLLMReducer } from '../../llm/reducers/summarization.llm.reducer';
import { Signal } from '../../signal';
import { AgentsPersistenceService } from '../../agents/agents.persistence.service';
import { RunSignalsRegistry } from '../../agents/run-signals.service';
import { ThreadTransportService } from '../../messaging/threadTransport.service';

import { BaseToolNode } from '../tools/baseToolNode';
import { BufferMessage, MessagesBuffer, ProcessBuffer } from './messagesBuffer';

const DEFAULT_SYSTEM_PROMPT = 'You are a helpful AI assistant.';
const DEFAULT_SUMMARIZATION_PROMPT =
  'You update a running summary of a conversation. Keep key facts, goals, decisions, constraints, names, deadlines, and follow-ups. Be concise; use compact sentences; omit chit-chat. Structure summary with 3 high level sections: initial task, plan (if any), context (progress, findings, observations).';
const DEFAULT_RESTRICTION_MESSAGE =
  "Do not produce a final answer directly. Before finishing, call a tool. If no tool is needed, call the 'finish' tool.";

/**
 * Zod schema describing static configuration for Agent.
 * Keep this colocated with the implementation so updates stay in sync.
 */
export const AgentStaticConfigSchema = z
  .object({
    title: z.string().optional().describe('Display name for this agent (UI only).'),
    name: z
      .string()
      .trim()
      .max(64)
      .describe('Friendly name for this agent (UI only).')
      .optional(),
    role: z
      .string()
      .trim()
      .max(64)
      .describe('Role label for this agent (UI only).')
      .optional(),
    model: z.string().default('gpt-5').describe('LLM model identifier to use for this agent (provider-specific name).'),
    systemPrompt: z
      .string()
      .default(DEFAULT_SYSTEM_PROMPT)
      .describe('System prompt injected at the start of each conversation turn.')
      .meta({ 'ui:widget': 'textarea', 'ui:options': { rows: 6 } }),
    // Agent-side message buffer handling (exposed for Agent static config)
    debounceMs: z.number().int().min(0).default(0).describe('Debounce window (ms) for agent-side message buffer.'),
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
    sendFinalResponseToThread: z
      .boolean()
      .default(true)
      .describe('Automatically send final assistant response to the thread channel when no tools are pending.'),
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
    restrictOutput: z.boolean().default(false).describe('When true, enforce calling a tool before finishing the turn.'),
    restrictionMessage: z
      .string()
      .default(DEFAULT_RESTRICTION_MESSAGE)
      .describe('Instruction injected to steer the model when restrictOutput=true.')
      .meta({ 'ui:widget': 'textarea', 'ui:options': { rows: 4 } }),
    restrictionMaxInjections: z
      .number()
      .int()
      .min(0)
      .default(0)
      .describe('Max enforcement injections per turn (0 = unlimited).'),
  })
  .partial()
  .strict();

export type AgentStaticConfig = z.infer<typeof AgentStaticConfigSchema>;

export type WhenBusyMode = 'wait' | 'injectAfterTools';

type EffectiveAgentConfig = {
  model: string;
  prompts: {
    system: string;
    summarization: string;
  };
  summarization: {
    keepTokens: number;
    maxTokens: number;
  };
  behavior: {
    debounceMs: number;
    whenBusy: WhenBusyMode;
    processBuffer: 'allTogether' | 'oneByOne';
    autoSendFinalResponseToThread: boolean;
    restrictOutput: boolean;
    restrictionMessage: string;
    restrictionMaxInjections: number;
  };
  memoryPlacement: 'after_system' | 'last_message' | 'none';
};

type ToolSource =
  | {
      sourceType: 'node';
      nodeId?: string;
      className?: string;
    }
  | {
      sourceType: 'mcp';
      nodeId?: string;
      namespace?: string;
      className?: string;
    };

type RegisteredTool = {
  tool: FunctionTool;
  source: ToolSource;
};

// Consolidated Agent class (merges previous BaseAgent + Agent into single AgentNode)
import { Inject, Injectable, OnModuleInit, Scope } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import type { TemplatePortConfig } from '../../graph/ports.types';
import type { RuntimeContext } from '../../graph/runtimeContext';
import Node from '../base/Node';
import { MemoryConnectorNode } from '../memoryConnector/memoryConnector.node';

@Injectable({ scope: Scope.TRANSIENT })
export class AgentNode extends Node<AgentStaticConfig> implements OnModuleInit {
  protected buffer = new MessagesBuffer({ debounceMs: 0 });

  private mcpServerTools: Map<LocalMCPServerNode, Map<string, FunctionTool>> = new Map();
  private toolsByName: Map<string, RegisteredTool> = new Map();
  private toolNames: Set<string> = new Set();
  private runningThreads: Set<string> = new Set();
  private persistenceRef: AgentsPersistenceService | null | undefined;
  private runSignalsRef: RunSignalsRegistry | null | undefined;
  private threadTransportRef: ThreadTransportService | null | undefined;
  private moduleInitialized = false;

  constructor(
    @Inject(ConfigService) protected configService: ConfigService,
    @Inject(LLMProvisioner) protected llmProvisioner: LLMProvisioner,
    @Inject(ModuleRef) protected readonly moduleRef: ModuleRef,
  ) {
    super();
  }

  onModuleInit(): void {
    this.moduleInitialized = true;
  }

  private getPersistenceOrThrow(): AgentsPersistenceService {
    if (this.persistenceRef === undefined) {
      try {
        this.persistenceRef = this.moduleRef.get(AgentsPersistenceService, { strict: false }) ?? null;
      } catch {
        this.persistenceRef = null;
      }
    }
    if (!this.persistenceRef) {
      const initializedState = this.moduleInitialized ? 'initialized' : 'uninitialized';
      throw new Error(`AgentsPersistenceService unavailable (${initializedState})`);
    }
    return this.persistenceRef;
  }

  private getRunSignals(): RunSignalsRegistry {
    if (this.runSignalsRef === undefined) {
      try {
        this.runSignalsRef = this.moduleRef.get(RunSignalsRegistry, { strict: false }) ?? null;
      } catch {
        this.runSignalsRef = null;
      }
    }
    if (!this.runSignalsRef) {
      const initializedState = this.moduleInitialized ? 'initialized' : 'uninitialized';
      throw new Error(`RunSignalsRegistry unavailable (${initializedState})`);
    }
    return this.runSignalsRef;
  }

  private getThreadTransport(): ThreadTransportService | null {
    if (this.threadTransportRef === undefined) {
      try {
        this.threadTransportRef = this.moduleRef.get(ThreadTransportService, { strict: false }) ?? null;
      } catch {
        this.threadTransportRef = null;
      }
    }
    return this.threadTransportRef;
  }

  private async autoSendFinalResponse(
    threadId: string,
    response: ResponseMessage,
    outputs: Array<AIMessage | ToolCallMessage>,
    runId: string,
  ): Promise<void> {
    const hasPendingToolCall = outputs.some((o) => o instanceof ToolCallMessage);
    const finalText = response.text ?? '';
    if (hasPendingToolCall || finalText.trim().length === 0) {
      return;
    }

    const transport = this.getThreadTransport();
    if (!transport) {
      this.logger.debug?.(
        `Agent auto-send skipped for thread ${threadId}: ThreadTransportService unavailable`,
      );
      return;
    }

    try {
      const sendResult = await transport.sendTextToThread(threadId, finalText, {
        runId,
        source: 'auto_response',
      });
      if (!sendResult.ok) {
        this.logger.warn?.(
          `Agent auto-send failed for thread ${threadId}: ${sendResult.error ?? 'unknown_error'}`,
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Agent auto-send threw for thread ${threadId}: ${message}`);
    }
  }

  get config() {
    if (!this._config) throw new Error('Agent not configured.');
    return this._config;
  }

  override async setConfig(cfg: AgentStaticConfig): Promise<void> {
    const parsed = AgentStaticConfigSchema.parse(cfg ?? {});
    const sanitized: AgentStaticConfig = { ...parsed };
    if (typeof sanitized.name === 'string' && sanitized.name.length === 0) {
      delete sanitized.name;
    }
    if (typeof sanitized.role === 'string' && sanitized.role.length === 0) {
      delete sanitized.role;
    }
    await super.setConfig(sanitized);
  }

  private getAgentLabel(): string {
    const title = this.config?.title;
    if (typeof title === 'string' && title.trim().length > 0) return title.trim();
    const name = this.config?.name;
    const role = this.config?.role;
    const trimmedName = typeof name === 'string' ? name.trim() : '';
    const trimmedRole = typeof role === 'string' ? role.trim() : '';
    if (trimmedName && trimmedRole) return `${trimmedName} (${trimmedRole})`;
    if (trimmedName) return trimmedName;
    if (trimmedRole) return trimmedRole;
    const nodeId = this.getAgentNodeId();
    return nodeId ?? 'unknown';
  }

  private buildNodeToolSource(toolNode: BaseToolNode<unknown>): ToolSource {
    let nodeId: string | undefined;
    try {
      nodeId = toolNode.nodeId;
    } catch {
      nodeId = undefined;
    }
    return { sourceType: 'node', nodeId, className: toolNode.constructor.name };
  }

  private buildMcpToolSource(server: LocalMCPServerNode): ToolSource {
    let nodeId: string | undefined;
    try {
      nodeId = server.nodeId;
    } catch {
      nodeId = undefined;
    }
    return { sourceType: 'mcp', nodeId, namespace: server.namespace, className: server.constructor.name };
  }

  private formatToolSource(source: ToolSource): Record<string, unknown> {
    if (source.sourceType === 'node') {
      return {
        sourceType: source.sourceType,
        nodeId: source.nodeId,
        className: source.className,
      };
    }
    return {
      sourceType: source.sourceType,
      nodeId: source.nodeId,
      namespace: source.namespace,
      className: source.className,
    };
  }

  private registerTool(tool: FunctionTool, source: ToolSource): boolean {
    if (this.toolNames.has(tool.name)) {
      const existing = this.toolsByName.get(tool.name);
      const agentNodeId = this.getAgentNodeId();
      const agentTitle = this.config?.title;
      this.logger.error(
        `[Agent:${this.getAgentLabel()}] Duplicate tool name detected: ${tool.name}. Skipping registration.`,
        {
          agentNodeId,
          agentTitle,
          toolName: tool.name,
          skipped: this.formatToolSource(source),
          kept: existing ? this.formatToolSource(existing.source) : undefined,
        },
      );
      return false;
    }

    this.toolsByName.set(tool.name, { tool, source });
    this.toolNames.add(tool.name);
    return true;
  }

  private unregisterTool(name: string, tool: FunctionTool): boolean {
    const existing = this.toolsByName.get(name);
    if (!existing || existing.tool !== tool) return false;
    this.toolsByName.delete(name);
    this.toolNames.delete(name);
    return true;
  }

  public get tools(): FunctionTool[] {
    return this.getActiveTools();
  }

  private getActiveTools(): FunctionTool[] {
    return Array.from(this.toolsByName.values()).map((entry) => entry.tool);
  }

  private async injectBufferedMessages(
    behavior: EffectiveAgentConfig['behavior'],
    state: LLMState,
    ctx: LLMContext,
  ): Promise<void> {
    const mode = behavior.processBuffer === 'oneByOne' ? ProcessBuffer.OneByOne : ProcessBuffer.AllTogether;
    const drained = this.buffer.tryDrain(ctx.threadId, mode);
    if (drained.length === 0) return;

    this.logger.debug?.(
      `[Agent: ${this.config.title ?? this.nodeId}] Injecting ${drained.length} buffered message(s) into active run for thread ${ctx.threadId}`,
    );

    await this.getPersistenceOrThrow().recordInjected(ctx.runId, drained, { threadId: ctx.threadId });
    state.messages.push(...drained);
  }

  private resolveBufferModeFromBehavior(behavior?: EffectiveAgentConfig['behavior']): ProcessBuffer {
    const mode = behavior?.processBuffer ?? this.config.processBuffer ?? 'allTogether';
    return mode === 'oneByOne' ? ProcessBuffer.OneByOne : ProcessBuffer.AllTogether;
  }

  private getMemoryPlacement(): 'after_system' | 'last_message' | 'none' {
    return this.memoryConnector ? this.memoryConnector.getPlacement() : 'none';
  }

  private buildEffectiveConfig(model: string): EffectiveAgentConfig {
    return {
      model,
      prompts: {
        system: this.config.systemPrompt ?? DEFAULT_SYSTEM_PROMPT,
        summarization: DEFAULT_SUMMARIZATION_PROMPT,
      },
      summarization: {
        keepTokens: this.config.summarizationKeepTokens ?? 0,
        maxTokens: this.config.summarizationMaxTokens ?? 512,
      },
      behavior: {
        debounceMs: this.config.debounceMs ?? 0,
        whenBusy: this.config.whenBusy ?? 'wait',
        processBuffer: this.config.processBuffer ?? 'allTogether',
        autoSendFinalResponseToThread: this.config.sendFinalResponseToThread ?? true,
        restrictOutput: this.config.restrictOutput ?? false,
        restrictionMessage: this.config.restrictionMessage ?? DEFAULT_RESTRICTION_MESSAGE,
        restrictionMaxInjections: this.config.restrictionMaxInjections ?? 0,
      },
      memoryPlacement: this.getMemoryPlacement(),
    } satisfies EffectiveAgentConfig;
  }

  // ---- Node identity ----
  public getAgentNodeId(): string | undefined {
    try {
      return this.nodeId;
    } catch {
      return undefined;
    }
  }

  setRuntimeContext(ctx: RuntimeContext): void {
    // initialize identity via base init
    this.init({ nodeId: ctx.nodeId });
  }

  // Minimal memory connector attachment to satisfy port validation and future use
  private memoryConnector?: MemoryConnectorNode;
  attachMemoryConnector(conn: MemoryConnectorNode | undefined): void {
    this.memoryConnector = conn;
  }
  detachMemoryConnector(_conn: MemoryConnectorNode | undefined): void {
    // detach regardless of identity for simplicity
    this.memoryConnector = undefined;
  }

  getPortConfig(): TemplatePortConfig {
    return {
      sourcePorts: {
        tools: { kind: 'method', create: 'addTool', destroy: 'removeTool' },
        mcp: { kind: 'method', create: 'addMcpServer', destroy: 'removeMcpServer' },
      },
      targetPorts: {
        $self: { kind: 'instance' },
        memory: { kind: 'method', create: 'attachMemoryConnector', destroy: 'detachMemoryConnector' },
      },
    };
  }

  protected async prepareLoop(tools: FunctionTool[], effective: EffectiveAgentConfig): Promise<Loop<LLMState, LLMContext>> {
    const llm = await this.llmProvisioner.getLLM();
    const reducers: Record<string, Reducer<LLMState, LLMContext>> = {};

    reducers['load'] = (await this.moduleRef.create(LoadLLMReducer)).next(
      (await this.moduleRef.create(StaticLLMRouter)).init('summarize'),
    );

    const summarize = await this.moduleRef.create(SummarizationLLMReducer);
    await summarize.init({
      model: effective.model,
      keepTokens: effective.summarization.keepTokens,
      maxTokens: effective.summarization.maxTokens,
      systemPrompt: effective.prompts.summarization,
    });
    reducers['summarize'] = summarize.next((await this.moduleRef.create(StaticLLMRouter)).init('call_model'));

    const callModel = await this.moduleRef.create(CallModelLLMReducer);
    callModel.init({
      llm,
      model: effective.model,
      systemPrompt: effective.prompts.system,
      tools,
      memoryProvider: async (ctx) => {
        if (effective.memoryPlacement === 'none') return null;
        if (!this.memoryConnector) {
          this.logger.warn?.(
            `[Agent: ${this.config.title ?? this.nodeId}] Snapshot memory placement '${effective.memoryPlacement}' but no memory connector attached; skipping memory injection for thread ${ctx.threadId}.`,
          );
          return null;
        }
        const msg = await this.memoryConnector.renderMessage({ threadId: ctx.threadId });
        if (!msg) return null;
        return { msg, place: effective.memoryPlacement };
      },
    });
    reducers['call_model'] = callModel.next(
      (await this.moduleRef.create(ConditionalLLMRouter)).init((state) => {
        const last = state.messages.at(-1);
        if (last instanceof ResponseMessage && last.output.find((o) => o instanceof ToolCallMessage)) {
          return 'call_tools';
        }
        return 'save';
      }),
    );

    const callTools = await this.moduleRef.create(CallToolsLLMReducer);
    await callTools.init({ tools });
    const toolsRouter = await this.moduleRef.create(StaticLLMRouter);
    toolsRouter.init('tools_save');
    callTools.next(toolsRouter);
    reducers['call_tools'] = callTools;

    const toolsSave = await this.moduleRef.create(SaveLLMReducer);
    const agent = this;
    const behavior = effective.behavior;
    class AfterToolsRouter extends Router<LLMState, LLMContext> {
      async route(state: LLMState, ctx: LLMContext): Promise<{ state: LLMState; next: string | null }> {
        if (ctx.finishSignal.isActive) {
          return { state, next: null };
        }
        if (behavior.whenBusy === 'injectAfterTools') {
          await agent.injectBufferedMessages(behavior, state, ctx);
        }
        return { state, next: 'summarize' };
      }
    }
    toolsSave.next(new AfterToolsRouter());
    reducers['tools_save'] = toolsSave;

    reducers['save'] = (await this.moduleRef.create(SaveLLMReducer)).next(
      (await this.moduleRef.create(ConditionalLLMRouter)).init((_state, _ctx) =>
        behavior.restrictOutput ? 'enforceTools' : null,
      ),
    );

    if (behavior.restrictOutput) {
      reducers['enforceTools'] = (await this.moduleRef.create(EnforceToolsLLMReducer)).next(
        (await this.moduleRef.create(ConditionalLLMRouter)).init((state) => {
          const injected = state.meta?.restrictionInjected === true;
          const injections = state.meta?.restrictionInjectionCount ?? 0;
          if (injected && injections >= 1) return 'summarize';
          return null;
        }),
      );
    }

    return new Loop<LLMState, LLMContext>(reducers);
  }
  async invoke(thread: string, messages: BufferMessage[]): Promise<ResponseMessage | ToolCallOutputMessage> {
    const busy = this.runningThreads.has(thread);
    if (busy) {
      this.buffer.enqueue(thread, messages);
      return ResponseMessage.fromText('queued');
    }

    this.runningThreads.add(thread);
    let result: ResponseMessage | ToolCallOutputMessage;
    let runId: string | undefined;
    let terminateSignal: Signal | undefined;
    let effectiveBehavior: EffectiveAgentConfig['behavior'] | undefined;
    try {
      const persistence = this.getPersistenceOrThrow();
      const agentNodeId = this.getAgentNodeId();
      if (!agentNodeId) throw new Error('agent_node_id_missing');
      const started = await persistence.beginRunThread(thread, messages, agentNodeId);
      runId = started.runId;
      if (!runId) throw new Error('run_start_failed');
      const ensuredRunId = runId;

      const configModel = this.config.model ?? 'gpt-5';
      const persistedModel = await persistence.ensureThreadModel(thread, configModel);
      const effective = this.buildEffectiveConfig(persistedModel ?? configModel);
      effectiveBehavior = effective.behavior;

      this.buffer.setDebounceMs(effective.behavior.debounceMs);

      const activeTools = this.getActiveTools();

      terminateSignal = new Signal();
      this.getRunSignals().register(ensuredRunId, terminateSignal);

      const loop = await this.prepareLoop(activeTools, effective);
      const finishSignal = new Signal();
      const callerAgent: CallerAgent = {
        getAgentNodeId: () => agentNodeId,
        invoke: this.invoke.bind(this),
        config: {
          restrictOutput: effective.behavior.restrictOutput,
          restrictionMaxInjections: effective.behavior.restrictionMaxInjections,
          restrictionMessage: effective.behavior.restrictionMessage,
        },
      };

      const newState = await loop.invoke(
        { messages, context: { messageIds: [], memory: [] } },
        { threadId: thread, runId: ensuredRunId, finishSignal, terminateSignal, callerAgent },
        { start: 'load' },
      );

      if (terminateSignal.isActive) {
        await persistence.completeRun(ensuredRunId, 'terminated', []);
        result = ResponseMessage.fromText('terminated');
      } else {
        const last = newState.messages.at(-1);
        const isToolResult = finishSignal.isActive && last instanceof ToolCallOutputMessage;
        const isResponseResult = last instanceof ResponseMessage;
        if (!isToolResult && !isResponseResult) {
          throw new Error('Agent did not produce a valid response message.');
        }

        this.logger.log(`Agent response in thread ${thread}: ${last?.text}`);
        let responseMessage: ResponseMessage | null = null;
        let outputMessages: Array<AIMessage | ToolCallMessage> | null = null;
        if (last instanceof ResponseMessage) {
          responseMessage = last;
          outputMessages = last.output.filter(
            (o) => o instanceof AIMessage || o instanceof ToolCallMessage,
          ) as Array<AIMessage | ToolCallMessage>;
          await persistence.completeRun(ensuredRunId, 'finished', outputMessages);
        } else {
          await persistence.completeRun(ensuredRunId, 'finished', [last]);
        }

        if (responseMessage && effective.behavior.autoSendFinalResponseToThread) {
          await this.autoSendFinalResponse(thread, responseMessage, outputMessages ?? [], ensuredRunId);
        }

        result = last;
      }
    } catch (err) {
      if (runId) {
        try {
          const persistence = this.getPersistenceOrThrow();
          await persistence.completeRun(runId, 'terminated', []);
        } catch (completeErr) {
          this.logger.error(`Failed to mark run ${runId} as terminated after error:`, completeErr);
        }
      }

      this.logger.error(`Agent invocation error in thread ${thread}:`, err);
      throw err;
    } finally {
      this.runningThreads.delete(thread);
      if (runId) this.getRunSignals().clear(runId);
    }

    const nextMessages = this.buffer.tryDrain(thread, this.resolveBufferModeFromBehavior(effectiveBehavior));
    if (nextMessages.length > 0) {
      void this.invoke(thread, nextMessages);
    }

    return result;
  }

  public listQueuedPreview(threadId: string): Array<{ id: string; text: string; ts: number }> {
    return this.buffer.snapshot(threadId);
  }

  addTool(toolNode: BaseToolNode<unknown>): void {
    const tool: FunctionTool = toolNode.getTool();
    const added = this.registerTool(tool, this.buildNodeToolSource(toolNode));
    if (added) {
      this.logger.debug(
        `[Agent:${this.getAgentLabel()}] Tool added: ${tool.name} (${toolNode.constructor.name})`,
      );
    }
  }
  removeTool(toolNode: BaseToolNode<unknown>): void {
    const tool: FunctionTool = toolNode.getTool();
    if (this.unregisterTool(tool.name, tool)) {
      this.logger.debug(
        `[Agent:${this.getAgentLabel()}] Tool removed: ${tool.name} (${toolNode.constructor.name})`,
      );
    }
  }

  async addMcpServer(server: LocalMCPServerNode): Promise<void> {
    const namespace = server.namespace;
    if (this.mcpServerTools.has(server)) {
      this.logger.debug?.(`MCP server ${namespace} already added; skipping duplicate add.`);
      return;
    }
    // Track server with empty tools initially; sync on events
    this.mcpServerTools.set(server, new Map());

    const sync = (): void => {
      void this.syncMcpToolsFromServer(server);
    };

    // Subscribe to server lifecycle and unified MCP tools update event
    server.on('ready', sync);
    // For typed tools update event
    server.on('mcp.tools_updated', sync);

    // Trigger initial sync so agent catches up if server is already ready/cached
    sync();
  }

  async removeMcpServer(server: LocalMCPServerNode): Promise<void> {
    const tools = this.mcpServerTools.get(server);
    if (tools) for (const [name, tool] of tools) this.unregisterTool(name, tool);
    this.mcpServerTools.delete(server);
  }

  // Sync MCP tools from the given server and reconcile add/remove
  private syncMcpToolsFromServer(server: LocalMCPServerNode): void {
    try {
      const namespace = server.namespace;
      const latestTools: FunctionTool[] = server.listTools();
      const prev = this.mcpServerTools.get(server) ?? new Map<string, FunctionTool>();

      const uniqueLatest = new Map<string, FunctionTool>();
      const duplicates: FunctionTool[] = [];
      for (const tool of latestTools) {
        if (!uniqueLatest.has(tool.name)) {
          uniqueLatest.set(tool.name, tool);
        } else {
          duplicates.push(tool);
        }
      }

      for (const [name, prevTool] of prev) {
        const latestTool = uniqueLatest.get(name);
        if (latestTool && latestTool === prevTool) continue;
        if (this.unregisterTool(name, prevTool)) {
          this.logger.debug?.(`[Agent:${this.getAgentLabel()}] MCP tool removed (${namespace}/${name})`);
        }
      }

      const next = new Map<string, FunctionTool>();
      const source = this.buildMcpToolSource(server);

      for (const [name, tool] of uniqueLatest) {
        const existing = this.toolsByName.get(name)?.tool;
        if (existing === tool) {
          next.set(name, tool);
          continue;
        }

        const added = this.registerTool(tool, source);
        const isRegistered = this.toolsByName.get(name)?.tool === tool;
        if (!isRegistered) continue;

        next.set(name, tool);
        if (added) {
          this.logger.debug(`[Agent:${this.getAgentLabel()}] MCP tool added ${tool.name}`);
        }
      }

      for (const duplicate of duplicates) {
        this.registerTool(duplicate, source);
      }

      this.mcpServerTools.set(server, next);
    } catch (e: unknown) {
      this.logger.error?.('Agent: syncMcpToolsFromServer error', e);
    }
  }

  // Static introspection removed per hotfix; rely on TemplateRegistry meta.
}
