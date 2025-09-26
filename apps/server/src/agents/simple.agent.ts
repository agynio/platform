import { AIMessage, BaseMessage } from '@langchain/core/messages';
import { RunnableConfig } from '@langchain/core/runnables';
import { tool as lcTool } from '@langchain/core/tools';
import {
  Annotation,
  CompiledStateGraph,
  END,
  START,
  StateGraph,
  Messages,
  messagesStateReducer,
} from '@langchain/langgraph';
import { ChatOpenAI } from '@langchain/openai';
import { last } from 'lodash-es';
import { McpServer, McpTool } from '../mcp';
import { inferArgsSchema } from '../mcp/jsonSchemaToZod';
import { CallModelNode } from '../nodes/callModel.node';
import { ToolsNode } from '../nodes/tools.node';
import { CheckpointerService } from '../services/checkpointer.service';
import { ConfigService } from '../services/config.service';
import { LoggerService } from '../services/logger.service';
import { BaseAgent } from './base.agent';
import { BaseTool } from '../tools/base.tool';
import { LangChainToolAdapter } from '../tools/langchainTool.adapter';
import { SummarizationNode } from '../nodes/summarization.node';
import { NodeOutput } from '../types';
import { z } from 'zod';

/**
 * Zod schema describing static configuration for SimpleAgent.
 * Keep this colocated with the implementation so updates stay in sync.
 */
export const SimpleAgentStaticConfigSchema = z
  .object({
    title: z.string().optional(),
    systemPrompt: z
      .string()
      .default('You are a helpful AI assistant.')
      .describe('System prompt injected at the start of each conversation turn.')
      .meta({ 'ui:widget': 'textarea', 'ui:options': { rows: 6 } }),
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
  })
  .strict();

export type SimpleAgentStaticConfig = z.infer<typeof SimpleAgentStaticConfigSchema>;
export class SimpleAgent extends BaseAgent {
  private callModelNode!: CallModelNode;
  private toolsNode!: ToolsNode;
  // Track tools registered per MCP server so we can remove them on detachment
  private mcpServerTools: Map<McpServer, BaseTool[]> = new Map();

  private summarizationKeepTokens?: number; // token budget for verbatim tail
  private summarizationMaxTokens?: number;
  private summarizeNode!: SummarizationNode;

  constructor(
    private configService: ConfigService,
    private loggerService: LoggerService,
    private checkpointerService: CheckpointerService,
    private agentId?: string,
  ) {
    super(loggerService);
    this.init();
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
    });
  }

  init(config: RunnableConfig = { recursionLimit: 250 }) {
    if (!this.agentId) throw new Error('agentId is required to initialize SimpleAgent');

    this._config = config;

    const llm = new ChatOpenAI({
      model: 'gpt-5',
      apiKey: this.configService.openaiApiKey,
    });

    this.callModelNode = new CallModelNode([], llm);
    this.toolsNode = new ToolsNode([]);
    this.summarizeNode = new SummarizationNode(llm, {
      keepTokens: this.summarizationKeepTokens ?? 0,
      maxTokens: this.summarizationMaxTokens ?? 0,
    });

    const builder = new StateGraph(
      {
        stateSchema: this.state(),
      },
      this.configuration(),
    )
      .addNode('summarize', this.summarizeNode.action.bind(this.summarizeNode))
      .addNode('call_model', this.callModelNode.action.bind(this.callModelNode))
      .addNode('tools', this.toolsNode.action.bind(this.toolsNode))
      .addEdge(START, 'summarize')
      .addEdge('tools', 'summarize')
      .addEdge('summarize', 'call_model')
      .addConditionalEdges(
        'call_model',
        (state) => (last(state.messages as AIMessage[])?.tool_calls?.length ? 'tools' : END),
        {
          tools: 'tools',
          [END]: END,
        },
      );

    // Compile with a plain MongoDBSaver; scoping is handled via configurable.checkpoint_ns
    this._graph = builder.compile({
      checkpointer: this.checkpointerService.getCheckpointer(this.agentId),
    }) as CompiledStateGraph<unknown, unknown>;

    return this;
  }

  addTool(tool: BaseTool) {
    // using any to avoid circular import issues if BaseTool is extended differently later
    this.callModelNode.addTool(tool);
    this.toolsNode.addTool(tool);
    this.loggerService.info(`Tool added to SimpleAgent: ${tool?.constructor?.name || 'UnknownTool'}`);
  }

  removeTool(tool: BaseTool) {
    this.callModelNode.removeTool(tool);
    this.toolsNode.removeTool(tool);
    this.loggerService.info(`Tool removed from SimpleAgent: ${tool?.constructor?.name || 'UnknownTool'}`);
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

    // Registration function now only invoked on explicit ready event to avoid triggering
    // duplicate discovery flows (removes eager listTools() call which previously raced with start()).
    const registerTools = async () => {
      try {
        const tools: McpTool[] = await server.listTools();
        if (!tools.length) {
          this.loggerService.info(`No MCP tools discovered for namespace ${namespace}`);
        }
        const registered: BaseTool[] = [];
        for (const t of tools) {
          const schema = inferArgsSchema(t.inputSchema);
          const dynamic = lcTool(
            async (raw, config) => {
              this.loggerService.info(
                `Calling MCP tool ${t.name} in namespace ${namespace} with input: ${JSON.stringify(raw)}`,
              );
              const threadId = config?.configurable?.thread_id;
              const res = await server.callTool(t.name, raw, { threadId });
              if (res.structuredContent) return JSON.stringify(res.structuredContent);
              return res.content || '';
            },
            {
              name: `${namespace}_${t.name}`,
              description: t.description || `MCP tool ${t.name}`,
              schema,
            },
          );
          const adapted = new LangChainToolAdapter(dynamic);
          this.addTool(adapted);
          registered.push(adapted);
        }
        this.loggerService.info(`Registered ${tools.length} MCP tools for namespace ${namespace}`);
        const existing = this.mcpServerTools.get(server) || [];
        this.mcpServerTools.set(server, existing.concat(registered));
      } catch (e: any) {
        this.loggerService.error(`Failed to register MCP tools for ${namespace}: ${e.message}`);
      }
    };

    server.on('ready', () => registerTools());
    server.on('error', (err: any) => {
      this.loggerService.error(`MCP server ${namespace} error before tool registration: ${err?.message || err}`);
    });
  }

  /**
   * Dynamically set configuration values like the system prompt.
   */
  setConfig(config: Record<string, unknown>): void {
    const parsedConfig = config as {
      systemPrompt?: string;
      summarizationKeepTokens?: number; // new
      summarizationKeepLast?: number; // deprecated
      summarizationMaxTokens?: number;
    };
    if (parsedConfig.systemPrompt !== undefined) {
      this.callModelNode.setSystemPrompt(parsedConfig.systemPrompt);
      this.loggerService.info('SimpleAgent system prompt updated');
    }

    // Extend to accept summarization options
    // Accept both new (summarizationKeepTokens) and legacy (summarizationKeepLast) keys.
    const keepTokensRaw =
      (parsedConfig as any).summarizationKeepTokens !== undefined
        ? (parsedConfig as any).summarizationKeepTokens
        : parsedConfig.summarizationKeepLast; // fallback legacy
    const maxTokensRaw = parsedConfig.summarizationMaxTokens;
    const isInt = (v: unknown) => typeof v === 'number' && Number.isInteger(v);

    const updates: { keepTokens?: number; maxTokens?: number } = {};
    if (keepTokensRaw !== undefined) {
      if (!(isInt(keepTokensRaw) && keepTokensRaw >= 0)) {
        this.loggerService.error('summarizationKeepTokens must be an integer >= 0');
      } else {
        this.summarizationKeepTokens = keepTokensRaw;
        updates.keepTokens = keepTokensRaw;
      }
    }
    if (maxTokensRaw !== undefined) {
      if (!(isInt(maxTokensRaw) && maxTokensRaw > 0)) {
        this.loggerService.error('summarizationMaxTokens must be an integer > 0');
      } else {
        this.summarizationMaxTokens = maxTokensRaw;
        updates.maxTokens = maxTokensRaw;
      }
    }

    if (updates.keepTokens !== undefined || updates.maxTokens !== undefined) {
      this.summarizeNode.setOptions(updates);
      this.loggerService.info('SimpleAgent summarization options updated');
    }
  }

  /**
   * Detach MCP server: unregister its tools and stop/destroy it if it has lifecycle methods.
   */
  async removeMcpServer(server: McpServer): Promise<void> {
    const tools = this.mcpServerTools.get(server);
    if (tools && tools.length) {
      for (const tool of tools) {
        this.removeTool(tool as BaseTool);
      }
    }
    this.mcpServerTools.delete(server);
    // Attempt to call stop/destroy lifecycle if available
    const anyServer: any = server;
    try {
      if (typeof anyServer.destroy === 'function') await anyServer.destroy();
      else if (typeof anyServer.stop === 'function') await anyServer.stop();
    } catch (e) {
      this.loggerService.error(`Error destroying MCP server ${server.namespace}: ${(e as any)?.message || e}`);
    }
  }
}
