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
  // Track tools registered per MCP server so we can remove them on detachment
  private mcpServerTools: Map<McpServer, BaseTool[]> = new Map();

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
    this._graph = builder.compile({ checkpointer: this.checkpointerService.getCheckpointer(this.agentId) }) as CompiledStateGraph<
      unknown,
      unknown
    >;

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
    const parsedConfig = config as { systemPrompt?: string }; // TODO: fix
    if (parsedConfig.systemPrompt !== undefined) {
      this.callModelNode.setSystemPrompt(parsedConfig.systemPrompt);
      this.loggerService.info('SimpleAgent system prompt updated');
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
