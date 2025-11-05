import { LocalMCPServerNode } from '../mcp';

import { ConfigService } from '../../../core/services/config.service';
import { LoggerService } from '../../../core/services/logger.service';

import { z } from 'zod';

import {
  AIMessage,
  SystemMessage,
  FunctionTool,
  Loop,
  Reducer,
  ResponseMessage,
  Router,
  ToolCallMessage,
  ToolCallOutputMessage,
} from '@agyn/llm';
import { withAgent } from '@agyn/tracing';

import { LLMProvisioner } from '../../../llm/provisioners/llm.provisioner';
import { CallModelLLMReducer } from '../../../llm/reducers/callModel.llm.reducer';
import { CallToolsLLMReducer } from '../../../llm/reducers/callTools.llm.reducer';
import { ConditionalLLMRouter } from '../../../llm/routers/conditional.llm.router';
import { StaticLLMRouter } from '../../../llm/routers/static.llm.router';
import { LLMContext, LLMState } from '../../../llm/types';

import { EnforceToolsLLMReducer } from '../../../llm/reducers/enforceTools.llm.reducer';
import { LoadLLMReducer } from '../../../llm/reducers/load.llm.reducer';
import { SaveLLMReducer } from '../../../llm/reducers/save.llm.reducer';
import { SummarizationLLMReducer } from '../../../llm/reducers/summarization.llm.reducer';
import { Signal } from '../../../signal';
import { AgentsPersistenceService } from '../../../agents/agents.persistence.service';

import { BaseToolNode } from '../tools/baseToolNode';
import { BufferMessage, MessagesBuffer, ProcessBuffer } from './messagesBuffer';

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
      .default('You are a helpful AI assistant.')
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
  .partial()
  .strict();

export type AgentStaticConfig = z.infer<typeof AgentStaticConfigSchema>;

export type WhenBusyMode = 'wait' | 'injectAfterTools';

// Consolidated Agent class (merges previous BaseAgent + Agent into single AgentNode)
import { Inject, Injectable, Scope } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import type { TemplatePortConfig } from '../../../graph/ports.types';
import type { RuntimeContext } from '../../../graph/runtimeContext';
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
    @Inject(LoggerService) protected logger: LoggerService,
    @Inject(LLMProvisioner) protected llmProvisioner: LLMProvisioner,
    @Inject(ModuleRef) protected readonly moduleRef: ModuleRef,
    @Inject(AgentsPersistenceService) private readonly persistence: AgentsPersistenceService,
  ) {
    super(logger);
  }

  get config() {
    if (!this._config) throw new Error('Agent not configured.');
    return this._config;
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

  private async prepareLoop(): Promise<Loop<LLMState, LLMContext>> {
    const llm = await this.llmProvisioner.getLLM();
    const reducers: Record<string, Reducer<LLMState, LLMContext>> = {};
    const tools = Array.from(this.tools);
    // load -> summarize
    reducers['load'] = (await this.moduleRef.create(LoadLLMReducer)).next(
      (await this.moduleRef.create(StaticLLMRouter)).init('summarize'),
    );

    // summarize -> call_model
    const summarize = await this.moduleRef.create(SummarizationLLMReducer);
    await summarize.init({
      model: this.config.model ?? 'gpt-5',
      keepTokens: this.config.summarizationKeepTokens ?? 1000,
      maxTokens: this.config.summarizationMaxTokens ?? 10000,
      systemPrompt:
        'You update a running summary of a conversation. Keep key facts, goals, decisions, constraints, names, deadlines, and follow-ups. Be concise; use compact sentences; omit chit-chat. Structure summary with 3 high level sections: initial task, plan (if any), context (progress, findings, observations).',
    });
    reducers['summarize'] = summarize.next((await this.moduleRef.create(StaticLLMRouter)).init('call_model'));

    // call_model -> branch (call_tools | save)
    const callModel = await this.moduleRef.create(CallModelLLMReducer);
    callModel.init({
      llm,
      model: this.config.model ?? 'gpt-5',
      systemPrompt: this.config.systemPrompt ?? 'You are a helpful AI assistant.',
      tools,
      memoryProvider: async (ctx) => {
        if (!this.memoryConnector) return null;
        const msg = await this.memoryConnector.renderMessage({ threadId: ctx.threadId });
        if (!msg) return null;
        const place = this.memoryConnector.getPlacement();
        return { msg, place };
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

    // call_tools -> tools_save (static)
    const callTools = await this.moduleRef.create(CallToolsLLMReducer);
    await callTools.init({ tools });
    // Inject queued messages at boundary whenBusy=injectAfterTools
    const toolsRouter = await this.moduleRef.create(StaticLLMRouter);
    toolsRouter.init('tools_save');
    callTools.next(toolsRouter);
    reducers['call_tools'] = callTools;

    // tools_save -> branch (summarize | exit)
    const toolsSave = await this.moduleRef.create(SaveLLMReducer);
    class AfterToolsRouter extends Router<LLMState, LLMContext> {
      async route(state: LLMState, ctx: LLMContext): Promise<{ state: LLMState; next: string | null }> {
        if (ctx.finishSignal.isActive) {
          return { state, next: null };
        }
        return { state, next: 'summarize' };
      }
    }
    toolsSave.next(new AfterToolsRouter());
    reducers['tools_save'] = toolsSave;

    // save -> enforceTools (if enabled) or end (static)
    reducers['save'] = (await this.moduleRef.create(SaveLLMReducer)).next(
      (await this.moduleRef.create(ConditionalLLMRouter)).init((_state, _ctx) =>
        this.config.restrictOutput ? 'enforceTools' : null,
      ),
    );

    // enforceTools -> summarize OR end (conditional) if enabled
    if (this.config.restrictOutput) {
      reducers['enforceTools'] = (await this.moduleRef.create(EnforceToolsLLMReducer)).next(
        (await this.moduleRef.create(ConditionalLLMRouter)).init((state) => {
          const injected = state.meta?.restrictionInjected === true;
          const injections = state.meta?.restrictionInjectionCount ?? 0;
          if (injected && injections >= 1) return 'summarize';
          return null;
        }),
      );
    }

    const loop = new Loop<LLMState, LLMContext>(reducers);
    return loop;
  }
  async invoke(thread: string, messages: BufferMessage[]): Promise<ResponseMessage | ToolCallOutputMessage> {
    this.buffer.setDebounceMs(this.config.debounceMs ?? 0);
    const busy = this.runningThreads.has(thread);
    if (busy) {
      this.buffer.enqueue(thread, messages);
      return ResponseMessage.fromText('queued');
    }

    this.runningThreads.add(thread);
    let result: ResponseMessage | ToolCallOutputMessage;
    // Begin run deterministically; persistence must succeed or throw
    let runId: string | undefined;
    try {
      // Begin run with strictly-typed input messages for persistent threadId
      const started = await this.persistence.beginRunThread(thread, messages);
      runId = started.runId;

      result = await withAgent(
        { threadId: thread, nodeId: this.nodeId, inputParameters: [{ thread }, { messages }] },
        async () => {
          const loop = await this.prepareLoop();

          const finishSignal = new Signal();
          const newState = await loop.invoke(
            { messages },
            { threadId: thread, finishSignal, callerAgent: this },
            { start: 'load' },
          );

          const last = newState.messages.at(-1);

          // Persist injected messages only when using injectAfterTools strategy
          if ((this.config.whenBusy ?? 'wait') === 'injectAfterTools') {
            const injected = newState.messages.filter((m) => m instanceof SystemMessage && !messages.includes(m)) as SystemMessage[];
            if (injected.length > 0 && runId) {
              await this.persistence.recordInjected(runId, injected);
            }
          }
          if ((finishSignal.isActive && last instanceof ToolCallOutputMessage) || last instanceof ResponseMessage) {
            this.logger.info(`Agent response in thread ${thread}: ${last?.text}`);
            // Persist outputs and complete run
            if (runId) {
              if (last instanceof ResponseMessage) {
                // Persist strictly typed output items (AIMessage, ToolCallMessage)
                const outputs: Array<AIMessage | ToolCallMessage> = last.output.filter(
                  (o) => o instanceof AIMessage || o instanceof ToolCallMessage,
                ) as Array<AIMessage | ToolCallMessage>;
                await this.persistence.completeRun(runId, 'finished', outputs);
              } else if (last instanceof ToolCallOutputMessage) {
                // Persist tool call output
                await this.persistence.completeRun(runId, 'finished', [last]);
              }
            }
            return last;
          }

          throw new Error('Agent did not produce a valid response message.');
        },
      );
    } catch (err) {
      // Log and propagate; do not wrap persistence in try/catch
      this.logger.error(`Agent invocation error in thread ${thread}:`, err);
      throw err;
    } finally {
      this.runningThreads.delete(thread);
    }

    const mode =
      (this.config.processBuffer ?? 'allTogether') === 'oneByOne' ? ProcessBuffer.OneByOne : ProcessBuffer.AllTogether;
    const nextMessages = this.buffer.tryDrain(thread, mode);

    if (nextMessages.length > 0) {
      void this.invoke(thread, nextMessages);
    }

    return result;
  }

  addTool(toolNode: BaseToolNode<any>): void {
    const tool: FunctionTool = toolNode.getTool();
    this.tools.add(tool);
    this.logger.debug(`[Agent: ${this.config.title}] Tool added: ${tool.name} (${toolNode.constructor.name})`);
  }
  removeTool(toolNode: BaseToolNode<any>): void {
    const tool: FunctionTool = toolNode.getTool();
    this.tools.delete(tool);
    this.logger.debug(`[Agent: ${this.config.title}] Tool removed: ${tool.name} (${toolNode.constructor.name})`);
  }

  async addMcpServer(server: LocalMCPServerNode): Promise<void> {
    const namespace = server.namespace;
    if (this.mcpServerTools.has(server)) {
      this.logger.debug?.(`MCP server ${namespace} already added; skipping duplicate add.`);
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
          this.logger.debug?.(`[Agent: ${this.config.title}] MCP tool removed (${namespace}/${t.name})`);
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
