import { McpServer } from '../mcp';

import { ConfigService } from '../../services/config.service';
import { LoggerService } from '../../services/logger.service';

import { z } from 'zod';

import {
  FunctionTool,
  HumanMessage,
  Loop,
  ResponseMessage,
  SystemMessage,
  ToolCallMessage,
  ToolCallOutputMessage,
} from '@agyn/llm';
import { withAgent } from '@agyn/tracing';

import { CallModelLLMReducer } from '../../llm/reducers/callModel.llm.reducer';
import { CallToolsLLMReducer } from '../../llm/reducers/callTools.llm.reducer';
import { ConditionalLLMRouter } from '../../llm/routers/conditional.llm.router';
import { StaticLLMRouter } from '../../llm/routers/static.llm.router';
import { LLMContext, LLMState } from '../../llm/types';
import { LLMFactoryService } from '../../services/llmFactory.service';

import { TriggerListener, TriggerMessage } from '../slackTrigger';
import { MessagesBuffer } from './messagesBuffer';
import { BaseToolNode } from '../tools/baseToolNode';
import { Signal } from '../../signal';
import { SummarizationLLMReducer } from '../../llm/reducers/summarization.llm.reducer';

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
export class AgentNode implements TriggerListener {
  protected _config?: AgentStaticConfig;
  protected buffer = new MessagesBuffer({ debounceMs: 0 });

  private mcpServerTools: Map<McpServer, FunctionTool[]> = new Map();
  private tools: Set<FunctionTool> = new Set();

  constructor(
    protected configService: ConfigService,
    protected logger: LoggerService,
    protected llmFactoryService: LLMFactoryService,
    protected agentId?: string,
  ) {}

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

  private prepareLoop() {
    const llm = this.llmFactoryService.createLLM();
    const routers = new Map();
    const tools = Array.from(this.tools);

    routers.set(
      'summarize',
      new StaticLLMRouter(
        new SummarizationLLMReducer(llm, {
          model: this.config.model ?? 'gpt-5',
          keepTokens: this.config.summarizationKeepTokens ?? 1000,
          maxTokens: this.config.summarizationMaxTokens ?? 10000,
          systemPrompt:
            'You update a running summary of a conversation. Keep key facts, goals, decisions, constraints, names, deadlines, and follow-ups. Be concise; use compact sentences; omit chit-chat.',
        }),
        'call_model',
      ),
    );

    routers.set(
      'call_model', //
      new ConditionalLLMRouter(
        new CallModelLLMReducer(llm, tools, {
          model: this.config.model ?? 'gpt-5',
          systemPrompt: this.config.systemPrompt ?? 'You are a helpful AI assistant.',
        }),
        (state) => {
          const last = state.messages.at(-1);
          if (last instanceof ResponseMessage && last.output.find((o) => o instanceof ToolCallMessage)) {
            return 'call_tools';
          }
          return null;
        },
      ),
    );

    routers.set(
      'call_tools', //
      new ConditionalLLMRouter(new CallToolsLLMReducer(tools), (_, ctx) =>
        ctx.finishSignal.isActive ? null : 'summarize',
      ),
    );

    const loop = new Loop<LLMState, LLMContext>(routers);
    return loop;
  }

  async invoke(
    thread: string,
    messages: TriggerMessage[] | TriggerMessage,
  ): Promise<ResponseMessage | ToolCallOutputMessage> {
    return await withAgent(
      { threadId: thread, nodeId: this.getNodeId(), inputParameters: [{ thread }, { messages }] },
      async () => {
        const loop = this.prepareLoop();
        const history = [
          ...(Array.isArray(messages) ? messages : [messages]).map((msg) => HumanMessage.fromText(JSON.stringify(msg))),
        ];
        const finishSignal = new Signal();

        const newState = await loop.invoke(
          { messages: history },
          { threadId: 'test', finishSignal },
          {
            route: 'summarize',
          },
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

  addTool(toolNode: BaseToolNode) {
    this.tools.add(toolNode.getTool());
    this.logger.info(`Tool added to Agent: ${toolNode?.constructor?.name || 'UnknownTool'}`);
  }
  removeTool(toolNode: BaseToolNode) {
    this.tools.delete(toolNode.getTool());
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

    const sync = () => {
      void this.syncMcpToolsFromServer(server).catch((e) => {
        this.logger.error?.(`Agent: failed to sync MCP tools from ${namespace}`, e);
      });
    };

    // Subscribe to server lifecycle and unified MCP tools update event
    server.on('ready', sync);
    server.on('mcp.tools_updated', sync);

    // Trigger initial sync so agent catches up if server is already ready/cached
    sync();
  }

  async removeMcpServer(server: McpServer): Promise<void> {
    const tools = this.mcpServerTools.get(server);
    if (tools && tools.length) for (const tool of tools) this.tools.delete(tool);
    this.mcpServerTools.delete(server);
  }

  setConfig(config: Record<string, unknown>): void {
    const parsedConfig = AgentStaticConfigSchema.parse(config) as Partial<AgentStaticConfig>;
    this._config = parsedConfig;
  }

  async delete(): Promise<void> {}

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
    } catch (e) {
      this.logger.error?.('Agent: syncMcpToolsFromServer error', e);
    }
  }
}
