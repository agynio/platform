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
    restrictOutput: boolean;
    restrictionMessage: string;
    restrictionMaxInjections: number;
  };
  memoryPlacement: 'after_system' | 'last_message' | 'none';
};

// Consolidated Agent class (merges previous BaseAgent + Agent into single AgentNode)
import { Inject, Injectable, Optional, Scope } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import type { TemplatePortConfig } from '../../graph/ports.types';
import type { RuntimeContext } from '../../graph/runtimeContext';
import Node from '../base/Node';
import { MemoryConnectorNode } from '../memoryConnector/memoryConnector.node';

@Injectable({ scope: Scope.TRANSIENT })
export class AgentNode extends Node<AgentStaticConfig> {
  protected buffer = new MessagesBuffer({ debounceMs: 0 });

  private mcpServerTools: Map<LocalMCPServerNode, FunctionTool[]> = new Map();
  private tools: Set<FunctionTool> = new Set();
  private runningThreads: Set<string> = new Set();

  constructor(
    @Inject(ConfigService) protected configService: ConfigService,
    @Inject(LLMProvisioner) protected llmProvisioner: LLMProvisioner,
    @Inject(ModuleRef) protected readonly moduleRef: ModuleRef,
    @Optional() @Inject(AgentsPersistenceService) private persistence?: AgentsPersistenceService,
    @Optional() @Inject(RunSignalsRegistry) private runSignals?: RunSignalsRegistry,
  ) {
    super();
  }

  private getPersistence(): AgentsPersistenceService {
    if (!this.persistence) {
      const resolved = this.moduleRef.get(AgentsPersistenceService, { strict: false });
      if (!resolved) {
        throw new Error('AgentsPersistenceService unavailable');
      }
      this.persistence = resolved;
    }
    return this.persistence;
  }

  private getRunSignals(): RunSignalsRegistry {
    if (!this.runSignals) {
      const resolved = this.moduleRef.get(RunSignalsRegistry, { strict: false });
      if (!resolved) {
        throw new Error('RunSignalsRegistry unavailable');
      }
      this.runSignals = resolved;
    }
    return this.runSignals;
  }

  get config() {
    if (!this._config) throw new Error('Agent not configured.');
    return this._config;
  }

  private async injectBufferedMessages(
    behavior: EffectiveAgentConfig['behavior'],
    state: LLMState,
    ctx: LLMContext,
  ): Promise<void> {
    const mode = behavior.processBuffer === 'oneByOne' ? ProcessBuffer.OneByOne : ProcessBuffer.AllTogether;
    const drained = this.buffer.tryDrain(ctx.threadId, mode);
    if (drained.length === 0) return;

    this.logger.debug(
      `[Agent: ${this.config.title ?? this.nodeId}] Injecting ${drained.length} buffered message(s) into active run for thread ${ctx.threadId}`,
    );

    await this.getPersistence().recordInjected(ctx.runId, drained, { threadId: ctx.threadId });
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
      const persistence = this.getPersistence();
      const started = await persistence.beginRunThread(thread, messages);
      runId = started.runId;
      if (!runId) throw new Error('run_start_failed');
      const ensuredRunId = runId;

      const agentNodeId = this.getAgentNodeId();
      if (!agentNodeId) throw new Error('agent_node_id_missing');

      const configModel = this.config.model ?? 'gpt-5';
      const persistedModel = await persistence.ensureThreadModel(thread, configModel);
      const effective = this.buildEffectiveConfig(persistedModel ?? configModel);
      effectiveBehavior = effective.behavior;

      this.buffer.setDebounceMs(effective.behavior.debounceMs);

      const activeTools = Array.from(this.tools);

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
        if (last instanceof ResponseMessage) {
          const outputs: Array<AIMessage | ToolCallMessage> = last.output.filter(
            (o) => o instanceof AIMessage || o instanceof ToolCallMessage,
          ) as Array<AIMessage | ToolCallMessage>;
          await persistence.completeRun(ensuredRunId, 'finished', outputs);
        } else {
          await persistence.completeRun(ensuredRunId, 'finished', [last]);
        }

        result = last;
      }
    } catch (err) {
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

  addTool(toolNode: BaseToolNode<unknown>): void {
    const tool: FunctionTool = toolNode.getTool();
    this.tools.add(tool);
    this.logger.debug(`[Agent: ${this.config.title}] Tool added: ${tool.name} (${toolNode.constructor.name})`);
  }
  removeTool(toolNode: BaseToolNode<unknown>): void {
    const tool: FunctionTool = toolNode.getTool();
    this.tools.delete(tool);
    this.logger.debug(`[Agent: ${this.config.title}] Tool removed: ${tool.name} (${toolNode.constructor.name})`);
  }

  async addMcpServer(server: LocalMCPServerNode): Promise<void> {
    const namespace = server.namespace;
    if (this.mcpServerTools.has(server)) {
      this.logger.debug(`MCP server ${namespace} already added; skipping duplicate add.`);
      return;
    }
    // Track server with empty tools initially; sync on events
    this.mcpServerTools.set(server, []);

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
    if (tools && tools.length) for (const tool of tools) this.tools.delete(tool);
    this.mcpServerTools.delete(server);
  }

  // Sync MCP tools from the given server and reconcile add/remove
  private syncMcpToolsFromServer(server: LocalMCPServerNode): void {
    try {
      const namespace = server.namespace;
      const latest: FunctionTool[] = server.listTools();
      const prev: FunctionTool[] = this.mcpServerTools.get(server) || [];

      const latestNames = new Set(latest.map((t) => t.name));
      // Remove tools no longer present
      for (const t of prev) {
        if (!latestNames.has(t.name)) {
          this.tools.delete(t);
          this.logger.debug(`[Agent: ${this.config.title}] MCP tool removed (${namespace}/${t.name})`);
        }
      }

      const prevNames = new Set(prev.map((t) => t.name));
      // Add new tools
      for (const t of latest) {
        if (!prevNames.has(t.name)) {
          this.tools.add(t);
          this.logger.debug(`[Agent: ${this.config.title}] MCP tool added ${t.name}`);
        }
      }

      // Update snapshot
      this.mcpServerTools.set(server, latest);
    } catch (e: unknown) {
      this.logger.error?.('Agent: syncMcpToolsFromServer error', e);
    }
  }

  // Static introspection removed per hotfix; rely on TemplateRegistry meta.
}
