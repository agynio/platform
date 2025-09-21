import { AIMessage, BaseMessage } from '@langchain/core/messages';
import { RunnableConfig } from '@langchain/core/runnables';
import { tool as lcTool } from '@langchain/core/tools';
import { Annotation, CompiledStateGraph, END, START, StateGraph } from '@langchain/langgraph';
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
import { BashCommandTool } from '../tools/bash_command';

export class SimpleAgent extends BaseAgent {
  private callModelNode!: CallModelNode;
  private toolsNode!: ToolsNode;

  constructor(
    private configService: ConfigService,
    private loggerService: LoggerService,
    private checkpointerService: CheckpointerService,
  ) {
    super(loggerService);
    this.init();
  }

  protected state() {
    return Annotation.Root({
      messages: Annotation<BaseMessage[]>({
        default: () => [],
        reducer: (current: BaseMessage[], update: BaseMessage[]) => [...current, ...update],
      }),
    });
  }

  init(config: RunnableConfig = { recursionLimit: 250 }) {
    this._config = config;

    const llm = new ChatOpenAI({
      model: 'gpt-5',
      apiKey: this.configService.openaiApiKey,
    });

    this.callModelNode = new CallModelNode([], llm);
    this.toolsNode = new ToolsNode([]);

    const builder = new StateGraph(
      {
        stateSchema: this.state(),
      },
      this.configuration(),
    )
      .addNode('call_model', this.callModelNode.action.bind(this.callModelNode))
      .addNode('tools', this.toolsNode.action.bind(this.toolsNode))
      .addEdge(START, 'call_model')
      .addConditionalEdges(
        'call_model',
        (state) => (last(state.messages as AIMessage[])?.tool_calls?.length ? 'tools' : END),
        {
          tools: 'tools',
          [END]: END,
        },
      )
      .addEdge('tools', 'call_model');
    this._graph = builder.compile({ checkpointer: this.checkpointerService.getCheckpointer() }) as CompiledStateGraph<
      unknown,
      unknown
    >;

    return this;
  }

  addTool(tool: BaseTool) {
    // using any to avoid circular import issues if BaseTool is extended differently later
    this.callModelNode.addTool(tool);
    this.toolsNode.addTool(tool);
    this.loggerService.info(`Tool added to ArchitectAgent: ${tool?.constructor?.name || 'UnknownTool'}`);
  }

  removeTool(tool: BaseTool) {
    this.callModelNode.removeTool(tool);
    this.toolsNode.removeTool(tool);
    this.loggerService.info(`Tool removed from ArchitectAgent: ${tool?.constructor?.name || 'UnknownTool'}`);
  }

  /**
   * Attach an MCP server: starts it (idempotent), lists tools, and registers them as namespaced LangChain tools.
   */
  async addMcpServer(server: McpServer): Promise<void> {
    const namespace = server.namespace;
    // Start server in background (non-blocking if dependencies missing)
    void server.start();

    const registerTools = async () => {
      try {
        const tools: McpTool[] = await server.listTools();
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
        }
        this.loggerService.info(`Registered ${tools.length} MCP tools for namespace ${namespace}`);
      } catch (e: any) {
        this.loggerService.error(`Failed to register MCP tools for ${namespace}: ${e.message}`);
      }
    };

    // Attempt immediate registration if already ready; otherwise wait for ready/error events
    registerTools();
    if ((server as any).on) {
      (server as any).on('ready', () => registerTools());
      (server as any).on('error', (err: any) => {
        this.loggerService.error(`MCP server ${namespace} error before tool registration: ${err?.message || err}`);
      });
    }
  }

  /**
   * Dynamically set configuration values like the system prompt.
   */
  setConfig(config: Record<string, unknown>): void {
    const parsedConfig = config as { systemPrompt?: string }; // TODO: fix
    if (parsedConfig.systemPrompt !== undefined) {
      this.callModelNode.setSystemPrompt(parsedConfig.systemPrompt);
      this.loggerService.info('ArchitectAgent system prompt updated');
    }
  }
}
