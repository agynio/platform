import { AIMessage, BaseMessage, HumanMessage } from '@langchain/core/messages';
import { RunnableConfig } from '@langchain/core/runnables';
import { Annotation, AnnotationRoot, CompiledStateGraph, END, START, StateGraph } from '@langchain/langgraph';
import { ChatOpenAI } from '@langchain/openai';
import { last } from 'lodash-es';
import { withAgent } from '@traceloop/node-server-sdk';
import { McpServer, McpTool } from '../mcp';
import { isDynamicConfigurable } from '../graph/capabilities';
import { inferArgsSchema } from '../mcp/jsonSchemaToZod';
import { CallModelNode } from '../nodes/callModel.node';
import { ToolsNode } from '../nodes/tools.node';
import { CheckpointerService } from '../services/checkpointer.service';
import { ConfigService } from '../services/config.service';
import { LoggerService } from '../services/logger.service';
import { BaseTool } from '../tools/base.tool';
import { LangChainToolAdapter } from '../tools/langchainTool.adapter';
import { SummarizationNode } from '../nodes/summarization.node';
import { EnforceRestrictionNode } from '../nodes/enforceRestriction.node';
import { TriggerListener, TriggerMessage } from '../triggers/base.trigger';
import { NodeOutput } from '../types';
import { tool as lcTool } from '@langchain/core/tools';
import { z } from 'zod';

// Public static configuration schema for Agent templates
export const AgentStaticConfigSchema = z
  .object({
    title: z.string().optional(),
    model: z.string(),
    systemPrompt: z.string(),
    summarizationKeepTokens: z.number().int().min(0).optional(),
    summarizationMaxTokens: z.number().int().min(1).optional(),
    restrictOutput: z.boolean().optional(),
    restrictionMessage: z.string().optional(),
    restrictionMaxInjections: z.number().int().min(0).optional(),
  })
  .strict();

export type AgentStaticConfig = z.infer<typeof AgentStaticConfigSchema>;

/**
 * Unified Agent class (merges BaseAgent and SimpleAgent).
 * Does not read static config in constructor; use setConfig() to update runtime settings.
 */
export class Agent implements TriggerListener {
  protected _graph: CompiledStateGraph<unknown, unknown> | undefined;
  protected _config: RunnableConfig | undefined;

  private callModelNode!: CallModelNode;
  private toolsNode!: ToolsNode;
  private mcpServerTools: Map<McpServer, BaseTool[]> = new Map();
  private llm!: ChatOpenAI;

  private summarizationKeepTokens?: number;
  private summarizationMaxTokens?: number;
  private summarizeNode!: SummarizationNode;
  private enforceNode!: EnforceRestrictionNode;

  private restrictOutput = false;
  private restrictionMessage =
    "Do not produce a final answer directly. Before finishing, call a tool. If no tool is needed, call the 'finish' tool.";
  private restrictionMaxInjections = 0;

  constructor(
    private configService: ConfigService,
    private loggerService: LoggerService,
    private checkpointerService: CheckpointerService,
    private agentId?: string,
  ) {
    // intentionally not initializing from static config here
    this.init();
  }

  get graph() {
    if (!this._graph) throw new Error('Agent not initialized. Graph is undefined.');
    return this._graph;
  }
  get config() {
    if (!this._config) throw new Error('Agent not initialized. Config is undefined.');
    return this._config;
  }

  protected state(): AnnotationRoot<{}> {
    return Annotation.Root({
      messages: Annotation<BaseMessage[], NodeOutput['messages']>({
        reducer: (left, right) => (!right ? left : right.method === 'append' ? [...left, ...right.items] : right.items),
        default: () => [],
      }),
      summary: Annotation<string, string>({ reducer: (left, right) => right ?? left, default: () => '' }),
      done: Annotation<boolean, boolean>({ reducer: (l, r) => r ?? l, default: () => false }),
      restrictionInjectionCount: Annotation<number, number>({ reducer: (l, r) => r ?? l, default: () => 0 }),
      restrictionInjected: Annotation<boolean, boolean>({ reducer: (l, r) => r ?? l, default: () => false }),
    });
  }

  protected configuration(): AnnotationRoot<{}> {
    return Annotation.Root({});
  }

  init(config: RunnableConfig = { recursionLimit: 250 }) {
    if (!this.agentId) throw new Error('agentId is required to initialize Agent');
    this._config = config;

    this.llm = new ChatOpenAI({ model: 'gpt-5', apiKey: this.configService.openaiApiKey });

    this.callModelNode = new CallModelNode([], this.llm);
    this.toolsNode = new ToolsNode([]);
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
      .addNode('summarize', async (state: any) => {
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
        (state) => (last(state.messages as AIMessage[])?.tool_calls?.length ? 'tools' : 'enforce'),
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

    return this;
  }

  async invoke(thread: string, messages: TriggerMessage[] | TriggerMessage): Promise<BaseMessage | undefined> {
    return await withAgent({ name: 'agent.invoke', inputParameters: [{ thread }, { messages }] }, async () => {
      const batch = Array.isArray(messages) ? messages : [messages];
      this.loggerService.info(`New trigger event in thread ${thread} with messages: ${JSON.stringify(batch)}`);
      const response = (await this.graph.invoke(
        { messages: { method: 'append', items: batch.map((m) => new HumanMessage(JSON.stringify(m))) } },
        { ...this.config, configurable: { ...this.config?.configurable, thread_id: thread, caller_agent: this } },
      )) as { messages: BaseMessage[] };
      const lastMessage = response.messages?.[response.messages.length - 1];
      this.loggerService.info(`Agent response in thread ${thread}: ${lastMessage?.text}`);
      return lastMessage;
    });
  }

  // Lifecycle teardown
  async destroy(): Promise<void> {}

  // Tool attach/detach
  addTool(tool: BaseTool) {
    this.callModelNode.addTool(tool);
    this.toolsNode.addTool(tool);
    this.loggerService.info(`Tool added to Agent: ${tool?.constructor?.name || 'UnknownTool'}`);
  }
  removeTool(tool: BaseTool) {
    this.callModelNode.removeTool(tool);
    this.toolsNode.removeTool(tool);
    this.loggerService.info(`Tool removed from Agent: ${tool?.constructor?.name || 'UnknownTool'}`);
  }

  // MCP attach/detach and registration
  async addMcpServer(server: McpServer): Promise<void> {
    const namespace = server.namespace;
    if (this.mcpServerTools.has(server)) {
      this.loggerService.debug?.(`MCP server ${namespace} already added; skipping duplicate add.`);
      return;
    }
    this.mcpServerTools.set(server, []);
    let initialRegistrationDone = false;

    const registerTools = async () => {
      try {
        const tools: McpTool[] = await server.listTools();
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
              if (res.structuredContent) return JSON.stringify(res.structuredContent);
              return res.content || '';
            },
            { name: `${namespace}_${t.name}`, description: t.description || `MCP tool ${t.name}`, schema },
          );
          const adapted = new LangChainToolAdapter(dynamic);
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
      } catch (e: any) {
        this.loggerService.error(`Failed to register MCP tools for ${namespace}: ${e.message}`);
      }
    };

    server.on('ready', () => registerTools());
    server.on('error', (err: any) => {
      this.loggerService.error(`MCP server ${namespace} error before tool registration: ${err?.message || err}`);
    });

    if (isDynamicConfigurable<Record<string, boolean>>(server)) {
      server.onDynamicConfigChanged(async () => {
        if (!initialRegistrationDone) {
          this.loggerService.debug?.(
            `Dynamic config change for ${namespace} received before initial registration complete; ignoring`,
          );
          return;
        }
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
          }

          for (const [name, tool] of existingByName.entries()) {
            if (!desiredNames.has(name)) {
              this.removeTool(tool as BaseTool);
              this.mcpServerTools.set(
                server,
                (this.mcpServerTools.get(server) || []).filter((t) => t !== tool),
              );
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
                  if (res.structuredContent) return JSON.stringify(res.structuredContent);
                  return res.content || '';
                },
                { name: toolName, description: t.description || `MCP tool ${t.name}`, schema },
              );
              const adapted = new LangChainToolAdapter(dynamic);
              this.addTool(adapted);
              const updated = this.mcpServerTools.get(server) || [];
              updated.push(adapted);
              this.mcpServerTools.set(server, updated);
            }
          }
        } catch (e) {
          const err = e as Error;
          this.loggerService.error(`Failed dynamic MCP tool sync for ${namespace}: ${err.message}`);
        }
      });
    }
  }

  async removeMcpServer(server: McpServer): Promise<void> {
    const tools = this.mcpServerTools.get(server);
    if (tools && tools.length) for (const tool of tools) this.removeTool(tool as BaseTool);
    this.mcpServerTools.delete(server);
    const anyServer: any = server;
    try {
      if (typeof anyServer.destroy === 'function') await anyServer.destroy();
      else if (typeof anyServer.stop === 'function') await anyServer.stop();
    } catch (e) {
      this.loggerService.error(`Error destroying MCP server ${server.namespace}: ${(e as any)?.message || e}`);
    }
  }

  setConfig(config: Record<string, unknown>): void {
    const schema = z
      .object({
        title: z.string().optional(),
        model: z.string().optional(),
        systemPrompt: z.string().optional(),
        summarizationKeepTokens: z.number().int().min(0).optional(),
        summarizationMaxTokens: z.number().int().min(1).optional(),
        restrictOutput: z.boolean().optional(),
        restrictionMessage: z.string().optional(),
        restrictionMaxInjections: z.number().int().min(0).optional(),
      })
      .strict()
      .partial();

    const parsed = schema.safeParse(config);
    const cfg = parsed.success ? parsed.data : {};

    if (cfg.systemPrompt !== undefined) {
      this.callModelNode.setSystemPrompt(cfg.systemPrompt);
      this.loggerService.info('Agent system prompt updated');
    }
    if (cfg.model !== undefined) {
      this.llm.model = cfg.model;
      this.loggerService.info(`Agent model updated to ${cfg.model}`);
    }

    const keepTokensRaw =
      (config as any).summarizationKeepTokens !== undefined
        ? (config as any).summarizationKeepTokens
        : (config as any).summarizationKeepLast;
    const maxTokensRaw = (config as any).summarizationMaxTokens;
    const isInt = (v: unknown) => typeof v === 'number' && Number.isInteger(v);

    const updates: { keepTokens?: number; maxTokens?: number } = {};
    if (keepTokensRaw !== undefined) {
      if (!(isInt(keepTokensRaw) && keepTokensRaw >= 0)) this.loggerService.error('summarizationKeepTokens must be an integer >= 0');
      else {
        this.summarizationKeepTokens = keepTokensRaw;
        updates.keepTokens = keepTokensRaw;
      }
    }
    if (maxTokensRaw !== undefined) {
      if (!(isInt(maxTokensRaw) && maxTokensRaw > 0)) this.loggerService.error('summarizationMaxTokens must be an integer > 0');
      else {
        this.summarizationMaxTokens = maxTokensRaw;
        updates.maxTokens = maxTokensRaw;
      }
    }
    if (updates.keepTokens !== undefined || updates.maxTokens !== undefined) {
      this.summarizeNode.setOptions(updates);
      this.loggerService.info('Agent summarization options updated');
    }

    if (cfg.restrictOutput !== undefined) this.restrictOutput = !!cfg.restrictOutput;
    if (cfg.restrictionMessage !== undefined) this.restrictionMessage = cfg.restrictionMessage;
    if (cfg.restrictionMaxInjections !== undefined) this.restrictionMaxInjections = cfg.restrictionMaxInjections;
  }
}

// Backwards export to avoid UI/name breakage in external imports if any
export { Agent as SimpleAgent };
