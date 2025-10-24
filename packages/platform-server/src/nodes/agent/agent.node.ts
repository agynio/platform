import { McpServer } from '../mcp';

import { ConfigService } from '../../core/services/config.service';
import { LoggerService } from '../../core/services/logger.service';

import { z } from 'zod';

import { FunctionTool, HumanMessage, Loop, ResponseMessage, ToolCallMessage, ToolCallOutputMessage, Reducer } from '@agyn/llm';
import { withAgent } from '@agyn/tracing';

import { CallModelLLMReducer } from '../../llm/reducers/callModel.llm.reducer';
import { CallToolsLLMReducer } from '../../llm/reducers/callTools.llm.reducer';
import { ConditionalLLMRouter } from '../../llm/routers/conditional.llm.router';
import { StaticLLMRouter } from '../../llm/routers/static.llm.router';
import { LLMContext, LLMState } from '../../llm/types';
import { LLMProvisioner } from '../../llm/provisioners/llm.provisioner';

import { SummarizationLLMReducer } from '../../llm/reducers/summarization.llm.reducer';
import { LoadLLMReducer } from '../../llm/reducers/load.llm.reducer';
import { SaveLLMReducer } from '../../llm/reducers/save.llm.reducer';
import { EnforceToolsLLMReducer } from '../../llm/reducers/enforceTools.llm.reducer';
import { Signal } from '../../signal';
import { TriggerListener, TriggerMessage } from '../slackTrigger';
import { BaseToolNode } from '../tools/baseToolNode';
import { MessagesBuffer } from './messagesBuffer';

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
import Node from "../base/Node";
import type { PortsProvider, TemplatePortConfig } from '../../graph/ports.types';
import type { RuntimeContext, RuntimeContextAware } from '../../graph/runtimeContext';
import { MemoryConnectorNode } from '../memoryConnector/memoryConnector.node';

export class AgentNode extends Node<AgentStaticConfig | undefined> implements TriggerListener, PortsProvider, RuntimeContextAware {
  protected _config?: AgentStaticConfig;
  protected buffer = new MessagesBuffer({ debounceMs: 0 });

  private mcpServerTools: Map<McpServer, FunctionTool[]> = new Map();
  private tools: Set<FunctionTool> = new Set();

  constructor(
    protected configService: ConfigService,
    protected logger: LoggerService,
    protected llmProvisioner: LLMProvisioner,
    protected agentId?: string,
  ) {
    super();
  }

  get config() {
    if (!this._config) throw new Error('Agent not configured.');
    return this._config;
  }

  // ---- Node identity ----
  protected getNodeId(): string | undefined {
    return this.agentId;
  }
  public getAgentNodeId(): string | undefined {
    return this.getNodeId();
  }

  setRuntimeContext(ctx: RuntimeContext): void {
    this.agentId = ctx.nodeId;
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
    reducers['load'] = new LoadLLMReducer(this.logger).next(new StaticLLMRouter('summarize'));

    // summarize -> call_model
    reducers['summarize'] = new SummarizationLLMReducer(llm).init({
      model: this.config.model ?? 'gpt-5',
      keepTokens: this.config.summarizationKeepTokens ?? 1000,
      maxTokens: this.config.summarizationMaxTokens ?? 10000,
      systemPrompt:
        'You update a running summary of a conversation. Keep key facts, goals, decisions, constraints, names, deadlines, and follow-ups. Be concise; use compact sentences; omit chit-chat. Structure summary with 3 high level sections: initial task, plan (if any), context (progress, findings, observations).',
    }).next(new StaticLLMRouter('call_model'));

    // call_model -> branch (call_tools | save)
    reducers['call_model'] = new CallModelLLMReducer(llm)
      .init({ model: this.config.model ?? 'gpt-5', systemPrompt: this.config.systemPrompt ?? 'You are a helpful AI assistant.', tools })
      .next(
        new ConditionalLLMRouter((state) => {
          const last = state.messages.at(-1);
          if (last instanceof ResponseMessage && last.output.find((o) => o instanceof ToolCallMessage)) {
            return 'call_tools';
          }
          return 'save';
        }),
      );

    // call_tools -> tools_save (static)
    reducers['call_tools'] = new CallToolsLLMReducer(this.logger).init({ tools }).next(new StaticLLMRouter('tools_save'));
    // tools_save -> summarize (static)
    reducers['tools_save'] = new SaveLLMReducer(this.logger).next(new StaticLLMRouter('summarize'));

    // save -> enforceTools (if enabled) or end (static)
    reducers['save'] = new SaveLLMReducer(this.logger).next(new StaticLLMRouter(this.config.restrictOutput ? 'enforceTools' : null));

    // enforceTools -> summarize OR end (conditional) if enabled
    if (this.config.restrictOutput) {
      reducers['enforceTools'] = new EnforceToolsLLMReducer(this.logger).next(
        new ConditionalLLMRouter((state) => {
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
  async invoke(
    thread: string,
    messages: TriggerMessage[] | TriggerMessage,
  ): Promise<ResponseMessage | ToolCallOutputMessage> {
    return await withAgent(
      { threadId: thread, nodeId: this.getNodeId(), inputParameters: [{ thread }, { messages }] },
      async () => {
        const loop = await this.prepareLoop();
        const incoming: TriggerMessage[] = Array.isArray(messages) ? messages : [messages];
        const history: HumanMessage[] = incoming.map((msg) => HumanMessage.fromText(JSON.stringify(msg)));
        const finishSignal = new Signal();

        const newState = await loop.invoke(
          { messages: history },
          { threadId: thread, finishSignal, callerAgent: this },
          { start: 'load' },
        );

        const result = newState.messages.at(-1);

        if ((finishSignal.isActive && result instanceof ToolCallOutputMessage) || result instanceof ResponseMessage) {
          this.logger.info(`Agent response in thread ${thread}: ${result?.text}`);
          return result;
        }

        throw new Error('Agent did not produce a valid response message.');
      },
    );
  }

  public listActiveThreads(prefix?: string): string[] {
    return [];
  }

  terminateRun(thread: string, runId?: string): 'ok' | 'not_running' | 'not_found' {
    return 'not_running';
  }

  addTool(toolNode: BaseToolNode): void {
    const tool: FunctionTool = toolNode.getTool();
    this.tools.add(tool);
    this.logger.info(`Tool added to Agent: ${toolNode?.constructor?.name || 'UnknownTool'}`);
  }
  removeTool(toolNode: BaseToolNode): void {
    const tool: FunctionTool = toolNode.getTool();
    this.tools.delete(tool);
    this.logger.info(`Tool removed from Agent: ${toolNode?.constructor?.name || 'UnknownTool'}`);
  }

  async addMcpServer(server: McpServer): Promise<void> {
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

  async removeMcpServer(server: McpServer): Promise<void> {
    const tools = this.mcpServerTools.get(server);
    if (tools && tools.length) for (const tool of tools) this.tools.delete(tool);
    this.mcpServerTools.delete(server);
  }




  // Sync MCP tools from the given server and reconcile add/remove
  private syncMcpToolsFromServer(server: McpServer): void {
    try {
      const namespace = server.namespace;
      const latest: FunctionTool[] = server.listTools();
      const prev: FunctionTool[] = this.mcpServerTools.get(server) || [];

      const latestNames = new Set(latest.map((t) => t.name));
      // Remove tools no longer present
      for (const t of prev) {
        if (!latestNames.has(t.name)) {
          this.tools.delete(t);
          this.logger.debug?.(`Agent: MCP tool removed (${namespace}/${t.name})`);
        }
      }

      const prevNames = new Set(prev.map((t) => t.name));
      // Add new tools
      for (const t of latest) {
        if (!prevNames.has(t.name)) {
          this.tools.add(t);
          this.logger.debug?.(`Agent: MCP tool added (${namespace}/${t.name})`);
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
