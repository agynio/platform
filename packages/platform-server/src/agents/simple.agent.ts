import { AIMessage, BaseMessage } from '@langchain/core/messages';
import { RunnableConfig } from '@langchain/core/runnables';
import { tool as lcTool } from '@langchain/core/tools';
import { Annotation, CompiledStateGraph, END, START, StateGraph } from '@langchain/langgraph';
import { ChatOpenAI } from '@langchain/openai';
import { last } from 'lodash-es';
import { McpServer, McpTool } from '../mcp';
import { isDynamicConfigurable } from '../graph/capabilities';
import { inferArgsSchema } from '../mcp/jsonSchemaToZod';
import { CallModelNode, type MemoryConnector } from '../lgnodes/callModel.lgnode';
import { ToolsNode } from '../lgnodes/tools.lgnode';
import { CheckpointerService } from '../services/checkpointer.service';
import { ConfigService } from '../services/config.service';
import { LoggerService } from '../services/logger.service';
import { BaseAgent } from './base.agent';
import { BaseTool } from '../tools/base.tool';
import { LangChainToolAdapter } from '../tools/langchainTool.adapter';
import { SummarizationNode } from '../lgnodes/summarization.lgnode';
import { NodeOutput } from '../types';
import { z } from 'zod';
import { EnforceRestrictionNode } from '../lgnodes/enforceRestriction.lgnode';
import { stringify as toYaml } from 'yaml';
import { buildMcpToolError } from '../mcp/errorUtils';

/**
 * Zod schema describing static configuration for SimpleAgent.
 * Keep this colocated with the implementation so updates stay in sync.
 */
export const SimpleAgentStaticConfigSchema = z
  .object({
    title: z
      .string()
      .optional()
      .describe('Display name for this agent (UI only).'),
    model: z.string().default('gpt-5').describe('LLM model identifier to use for this agent (provider-specific name).'),
    systemPrompt: z
      .string()
      .default('You are a helpful AI assistant.')
      .describe('System prompt injected at the start of each conversation turn.')
      .meta({ 'ui:widget': 'textarea', 'ui:options': { rows: 6 } }),
    // Agent-side message buffer handling (exposed for SimpleAgent static config)
    debounceMs: z
      .number()
      .int()
      .min(0)
      .default(0)
      .describe('Debounce window (ms) for agent-side message buffer.'),
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

export type SimpleAgentStaticConfig = z.infer<typeof SimpleAgentStaticConfigSchema>;
export class SimpleAgent extends BaseAgent {
  private callModelNode!: CallModelNode;
  private toolsNode!: ToolsNode;
  // Track tools registered per MCP server so we can remove them on detachment
  private mcpServerTools: Map<McpServer, BaseTool[]> = new Map();
  // Persist the underlying ChatOpenAI instance so we can update its model dynamically
  private llm!: ChatOpenAI;

  private summarizationKeepTokens?: number; // token budget for verbatim tail
  private summarizationMaxTokens?: number;
  private summarizeNode!: SummarizationNode;
  private enforceNode!: EnforceRestrictionNode;

  // Restriction config (static-config driven)
  private restrictOutput: boolean = false;
  private restrictionMessage: string =
    "Do not produce a final answer directly. Before finishing, call a tool. If no tool is needed, call the 'finish' tool.";
  private restrictionMaxInjections: number = 0; // 0 = unlimited per turn

  // Lifecycle/config propagation helpers
  private lifecycleStarted = false;
  private lifecycleConfigSnapshot: Partial<SimpleAgentStaticConfig> = {};
  // Allowed config keys for propagation; keep in sync with setConfig filtering
  private static readonly allowedConfigKeysArray = [
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
  ] as const satisfies readonly (keyof SimpleAgentStaticConfig)[];
  private static readonly allowedConfigKeys = new Set<typeof SimpleAgent.allowedConfigKeysArray[number]>(
    SimpleAgent.allowedConfigKeysArray,
  );

  constructor(
    private configService: ConfigService,
    private loggerService: LoggerService,
    private checkpointerService: CheckpointerService,
    private agentId?: string,
  ) {
    super(loggerService);
    this.init();
  }

  // Expose nodeId for instrumentation (used by BaseAgent.withAgent wrapper)
  protected override getNodeId(): string | undefined {
    return this.agentId;
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

  init(config: RunnableConfig = { recursionLimit: 2500 }) {
    if (!this.agentId) throw new Error('agentId is required to initialize SimpleAgent');

    this._config = config;

    this.llm = new ChatOpenAI({
      model: 'gpt-5',
      apiKey: this.configService.openaiApiKey,
    });

    this.callModelNode = new CallModelNode([], this.llm);
    // Pass this agent's node id to ToolsNode for span attribution
    this.toolsNode = new ToolsNode([], this.agentId);
    this.summarizeNode = new SummarizationNode(this.llm, {
      keepTokens: this.summarizationKeepTokens ?? 0,
      maxTokens: this.summarizationMaxTokens ?? 0,
    });

    // Read restriction config from static config and store locally for closures
    const cfgUnknown = this._staticConfig;
    const cfg =
      cfgUnknown && typeof cfgUnknown === 'object' ? (cfgUnknown as Partial<SimpleAgentStaticConfig>) : undefined;
    this.restrictOutput = !!cfg?.restrictOutput;
    this.restrictionMessage =
      cfg?.restrictionMessage ||
      "Do not produce a final answer directly. Before finishing, call a tool. If no tool is needed, call the 'finish' tool.";
    this.restrictionMaxInjections = cfg?.restrictionMaxInjections ?? 0;

    this.enforceNode = new EnforceRestrictionNode(
      () => this.restrictOutput,
      () => this.restrictionMessage,
      () => this.restrictionMaxInjections,
    );

    const builder = new StateGraph(
      {
        stateSchema: this.state(),
      },
      this.configuration(),
    )
      .addNode('summarize', async (state: { messages: BaseMessage[]; summary?: string }) => {
        const res = await this.summarizeNode.action(state);
        // Reset restriction counters per new turn
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
        {
          tools: 'tools',
          enforce: 'enforce',
        },
      )
      .addConditionalEdges('enforce', (state) => (state.restrictionInjected === true ? 'call_model' : END), {
        call_model: 'call_model',
        [END]: END,
      })
      .addConditionalEdges('tools', (state) => (state.done === true ? END : 'summarize'), {
        [END]: END,
        summarize: 'summarize',
      });

    // Compile with a plain MongoDBSaver; scoping is handled via configurable.checkpoint_ns
    this._graph = builder.compile({
      checkpointer: this.checkpointerService.getCheckpointer(this.agentId),
    }) as CompiledStateGraph<unknown, unknown>;

    // Attach run service if runtime provided one via global. Best effort; no casts.
    try {
      const runSvc = globalThis.__agentRunsService;
      if (runSvc) {
        this.setRunService(runSvc);
      }
    } catch {}

    // Apply runtime scheduling defaults (debounce=0, whenBusy=wait) already set in BaseAgent; allow overrides from agentId namespace if needed later
    return this;
  }

  // Attach/detach a memory connector into the underlying CallModel
  attachMemoryConnector(
    mem?:
      | MemoryConnector
      | { getConnector?: () => MemoryConnector | undefined; createConnector?: () => MemoryConnector },
  ) {
    // Accept either a connector-like object or a provider exposing getConnector/createConnector
    let connector: MemoryConnector | undefined = undefined;
    if (mem && typeof (mem as MemoryConnector).renderMessage === 'function') {
      connector = mem as MemoryConnector;
    } else if (mem && 'getConnector' in mem && typeof mem.getConnector === 'function') {
      const prov = mem;
      connector = prov.getConnector?.();
      if (!connector && 'createConnector' in prov && typeof prov.createConnector === 'function') {
        connector = prov.createConnector();
      }
    }
    this.callModelNode.setMemoryConnector(connector);
    this.loggerService.info('SimpleAgent memory connector attached');
  }
  detachMemoryConnector() {
    this.callModelNode.setMemoryConnector(undefined);
    this.loggerService.info('SimpleAgent memory connector detached');
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
    // Track whether the initial (on 'ready') registration has completed. We ignore
    // dynamic config change events until this finishes to avoid a race where both
    // the initial registration and the dynamic sync attempt to add the same set
    // of tools concurrently, producing duplicates. (Observed symptom: inflated
    // Total tool count such as 111 when expecting 98 = 93 MCP + 5 static.)
    let initialRegistrationDone = false;

    // Registration function now only invoked on explicit ready event to avoid triggering
    // duplicate discovery flows (removes eager listTools() call which previously raced with start()).
    const registerTools = async () => {
      try {
        const tools = await server.listTools();
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
              if (res.isError) {
                const { message, cause } = buildMcpToolError(res);
                throw new Error(message, { cause });
              }
              // Normalize structured content formatting across call sites (YAML)
              if (res.structuredContent) return toYaml(res.structuredContent);
              return res.content || '';
            },
            {
              name: `${namespace}_${t.name}`,
              description: t.description || `MCP tool ${t.name}`,
              schema,
            },
          );
          const adapted = new LangChainToolAdapter(dynamic, this.loggerService);
          // Defensive: skip if already present (e.g. if a dynamic sync slipped through).
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

    // Dynamic config synchronization: if server supports DynamicConfigurable, re-sync tool list
    if (isDynamicConfigurable<Record<string, boolean>>(server)) {
      server.onDynamicConfigChanged(async () => {
        // Ignore dynamic sync events until after initial registration to prevent duplicate adds.
        if (!initialRegistrationDone) {
          this.loggerService.debug?.(
            `Dynamic config change for ${namespace} received before initial registration complete; ignoring (will be captured by initial listTools filter).`,
          );
          return;
        }
        // Re-list tools (already filtered by server dynamic config) and diff against currently registered
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
          } else {
            this.loggerService.debug?.(`Dynamic MCP tool sync (${namespace}) no changes`);
          }

          // Remove tools no longer enabled
          for (const [name, tool] of existingByName.entries()) {
            if (!desiredNames.has(name)) {
              this.removeTool(tool);
              this.mcpServerTools.set(
                server,
                (this.mcpServerTools.get(server) || []).filter((t) => t !== tool),
              );
            }
          }
          // Add newly enabled tools not present
          for (const t of tools) {
            const toolName = `${namespace}_${t.name}`;
            if (!existingByName.has(toolName)) {
              const schema = inferArgsSchema(t.inputSchema);
              const dynamic = lcTool(
                async (raw, config) => {
                  this.loggerService.info(
                    `Calling MCP tool ${t.name} in namespace ${namespace} with input: ${JSON.stringify(raw)}`,
                  );
                  const threadId = config?.configurable?.thread_id;
                  const res = await server.callTool(t.name, raw, { threadId });
                  if (res.isError) {
                    const { message, cause } = buildMcpToolError(res);
                    throw new Error(message, { cause });
                  }
                  // Normalize structured content formatting across call sites (YAML)
                  if (res.structuredContent) return toYaml(res.structuredContent);
                  return res.content || '';
                },
                {
                  name: toolName,
                  description: t.description || `MCP tool ${t.name}`,
                  schema,
                },
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
  }

  /**
   * Dynamically set configuration values like the system prompt.
   */
  // Overload preserves BaseAgent signature while exposing a more precise config shape for callers.
  setConfig(config: Partial<SimpleAgentStaticConfig> & Record<string, unknown>): void;
  setConfig(config: Record<string, unknown>): void {
    // Filter to known keys and validate without letting defaults write missing keys
    const filteredEntries = Object.entries(config).filter(([k]) =>
      SimpleAgent.allowedConfigKeys.has(k as (typeof SimpleAgent.allowedConfigKeysArray)[number]),
    );
    const filtered = Object.fromEntries(filteredEntries) as Partial<SimpleAgentStaticConfig> & Record<string, unknown>;
    const parsedConfig = SimpleAgentStaticConfigSchema.partial().parse(filtered) as Partial<SimpleAgentStaticConfig>;

    // Apply agent-side scheduling config
    this.applyRuntimeConfig(config);

    // Only update fields that were explicitly provided by caller
    if (Object.prototype.hasOwnProperty.call(filtered, 'systemPrompt') && typeof parsedConfig.systemPrompt === 'string') {
      this.callModelNode.setSystemPrompt(parsedConfig.systemPrompt);
      this.loggerService.info('SimpleAgent system prompt updated');
    }

    if (Object.prototype.hasOwnProperty.call(filtered, 'model') && typeof parsedConfig.model === 'string') {
      // Update model on stored llm instance (lightweight change similar to systemPrompt logic)
      this.llm.model = parsedConfig.model;
      this.loggerService.info(`SimpleAgent model updated to ${parsedConfig.model}`);
    }

    // Extend to accept summarization options
    // Accept both new (summarizationKeepTokens) and legacy (summarizationKeepLast) keys.
    const cfgObj = config as Record<string, unknown>;
    const keepTokensRaw =
      cfgObj.summarizationKeepTokens !== undefined ? cfgObj.summarizationKeepTokens : cfgObj.summarizationKeepLast; // legacy fallback
    const maxTokensRaw = cfgObj.summarizationMaxTokens;
    const isInt = (v: unknown) => typeof v === 'number' && Number.isInteger(v);

    const updates: { keepTokens?: number; maxTokens?: number } = {};
    if (keepTokensRaw !== undefined && keepTokensRaw !== null) {
      if (!(isInt(keepTokensRaw) && (keepTokensRaw as number) >= 0)) {
        this.loggerService.error('summarizationKeepTokens must be an integer >= 0');
      } else {
        this.summarizationKeepTokens = keepTokensRaw as number;
        updates.keepTokens = keepTokensRaw as number;
      }
    }
    if (maxTokensRaw !== undefined && maxTokensRaw !== null) {
      if (!(isInt(maxTokensRaw) && (maxTokensRaw as number) > 0)) {
        this.loggerService.error('summarizationMaxTokens must be an integer > 0');
      } else {
        this.summarizationMaxTokens = maxTokensRaw as number;
        updates.maxTokens = maxTokensRaw as number;
      }
    }

    if (updates.keepTokens !== undefined || updates.maxTokens !== undefined) {
      this.summarizeNode.setOptions(updates);
      this.loggerService.info('SimpleAgent summarization options updated');
    }

    // Apply restriction-related config without altering system prompt
    if (Object.prototype.hasOwnProperty.call(filtered, 'restrictOutput')) this.restrictOutput = !!parsedConfig.restrictOutput;
    if (Object.prototype.hasOwnProperty.call(filtered, 'restrictionMessage') && parsedConfig.restrictionMessage !== undefined)
      this.restrictionMessage = parsedConfig.restrictionMessage;
    if (
      Object.prototype.hasOwnProperty.call(filtered, 'restrictionMaxInjections') &&
      parsedConfig.restrictionMaxInjections !== undefined
    )
      this.restrictionMaxInjections = parsedConfig.restrictionMaxInjections;
  }

  // ----- NodeLifecycle: configure/start/stop/delete -----
  configure(cfg: Record<string, unknown>): void {
    // Keep only allowed keys; do not inject defaults; store snapshot for start() and diff updates
    const incoming = Object.fromEntries(
      Object.entries(cfg || {}).filter(([k]) =>
        SimpleAgent.allowedConfigKeys.has(k as (typeof SimpleAgent.allowedConfigKeysArray)[number]),
      ),
    ) as Partial<SimpleAgentStaticConfig> & Record<string, unknown>;
    if (!this.lifecycleStarted) {
      // Before start: replace snapshot
      this.lifecycleConfigSnapshot = { ...incoming };
      return;
    }
    // After start: compute delta and apply only changed keys to avoid resetting unspecified fields
    const delta: Record<string, unknown> = {};
    const prev = this.lifecycleConfigSnapshot;
    let changed = false;
    for (const [k, v] of Object.entries(incoming)) {
      const before = (prev as Partial<SimpleAgentStaticConfig> & Record<string, unknown>)[k];
      const same = JSON.stringify(before) === JSON.stringify(v);
      if (!same) {
        delta[k] = v;
        changed = true;
      }
    }
    // Merge snapshot
    this.lifecycleConfigSnapshot = { ...prev, ...incoming };
    if (changed) this.setConfig(delta);
  }

  async start(): Promise<void> {
    if (this.lifecycleStarted) return; // idempotent
    this.lifecycleStarted = true;
    const cfg = this.lifecycleConfigSnapshot;
    if (cfg && Object.keys(cfg).length > 0) {
      // Propagate all stored keys immediately
      this.setConfig(cfg);
    }
  }

  async stop(): Promise<void> {
    // no-op for now
  }

  async delete(): Promise<void> {
    await this.destroy();
  }

  /**
   * Detach MCP server: unregister its tools and stop/destroy it if it has lifecycle methods.
   */
  async removeMcpServer(server: McpServer): Promise<void> {
    const tools = this.mcpServerTools.get(server);
    if (tools && tools.length) {
      for (const tool of tools) {
        this.removeTool(tool);
      }
    }
    this.mcpServerTools.delete(server);
    // Attempt to call stop/destroy lifecycle if available
    const anyServer: any = server;
    try {
      if (typeof anyServer.destroy === 'function') await anyServer.destroy();
      else if (typeof anyServer.stop === 'function') await anyServer.stop();
    } catch (e) {
      const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
      this.loggerService.error(`Error destroying MCP server ${server.namespace}: ${msg}`);
    }
  }
}
