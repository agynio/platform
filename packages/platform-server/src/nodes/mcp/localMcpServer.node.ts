import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { WorkspaceNode } from '../workspace/workspace.node';
// Legacy capabilities removed; rely on Node lifecycle/state
import { ConfigService } from '../../core/services/config.service';
import { EnvService, type EnvItem } from '../../env/env.service';
import { WorkspaceExecTransport } from './workspaceExecTransport';
import { LocalMCPServerTool } from './localMcpServer.tool';
import { DEFAULT_MCP_COMMAND, McpError, type McpTool, McpToolCallResult } from './types';
import Node from '../base/Node';
import { Inject, Injectable, Scope } from '@nestjs/common';
import { jsonSchemaToZod } from '@agyn/json-schema-to-zod';
import picomatch from 'picomatch';
import { ReferenceValueSchema } from '../../utils/reference-schemas';

const EnvItemSchema = z
  .object({
    name: z.string().min(1),
    value: ReferenceValueSchema,
  })
  .strict()
  .describe('Environment variable entry (static string or reference).');

const ToolFilterRuleSchema = z
  .object({
    pattern: z.string().min(1),
  })
  .strict();

const ToolFilterSchema = z
  .object({
    mode: z.enum(['allow', 'deny']),
    rules: z.array(ToolFilterRuleSchema).default([]),
  })
  .strict();

export const LocalMcpServerStaticConfigSchema = z.object({
  title: z.string().optional(),
  namespace: z.string().min(1).optional().default('').describe('Namespace prefix for exposed MCP tools.'),
  command: z
    .string()
    .optional()
    .describe('Startup command executed inside the container (default: mcp start --stdio).'),
  workdir: z.string().optional().describe('Working directory inside the container.'),
  env: z
    .array(EnvItemSchema)
    .optional()
    .describe('Environment variables as resolved {name, value} pairs.')
    .meta({ 'ui:field': 'ReferenceEnvField' }),
  requestTimeoutMs: z.number().int().positive().optional().describe('Per-request timeout in ms.'),
  startupTimeoutMs: z.number().int().positive().optional().describe('Startup handshake timeout in ms.'),
  heartbeatIntervalMs: z.number().int().positive().optional().describe('Interval for heartbeat pings in ms.'),
  staleTimeoutMs: z.number().int().nonnegative().optional().describe('Staleness timeout for cached tools (ms).'),
  restart: z
    .object({
      maxAttempts: z.number().int().positive().default(5).describe('Maximum restart attempts during resilient start.'),
      backoffMs: z.number().int().positive().default(2000).describe('Base backoff (ms) between restart attempts.'),
    })
    .optional()
    .describe('Restart strategy configuration (optional).'),
  toolFilter: ToolFilterSchema.optional().describe('Optional tool allow/deny filter for MCP tools.'),
});
// .strict();

@Injectable({ scope: Scope.TRANSIENT })
export class LocalMCPServerNode extends Node<z.infer<typeof LocalMcpServerStaticConfigSchema>> {
  private async resolveEnvOverlay(base?: Record<string, string>): Promise<Record<string, string> | undefined> {
    const cfgEnv = this.config?.env as EnvItem[] | undefined;
    return this.envService.resolveProviderEnv(cfgEnv, undefined, base);
  }

  private buildExecConfig(command: string, envOverlay?: Record<string, string>) {
    const cmdToRun = command;
    const envArr = envOverlay ? Object.entries(envOverlay).map(([k, v]) => `${k}=${v}`) : undefined;
    return { cmdToRun, envArr, workdir: this.config.workdir };
  }
  /**
   * Lifecycle (post-refactor single discovery path):
   *
   * 1. Caller sets config + container provider.
   * 2. Caller invokes start() (SimpleAgent does this when attaching server) which sets wantStart=true and calls maybeStart().
   * 3. maybeStart() -> tryStartOnce() schedules resilient start attempts (dependency polling + exponential backoff).
   * 4. FIRST successful start attempt calls discoverTools() exactly once to populate toolsCache, then marks started=true and emits 'ready'.
   * 5. SimpleAgent listens for 'ready' and only then invokes listTools() to register tools (listTools() is passive and never kicks off discovery).
   * 6. Subsequent listTools() calls just read the cache; force option only returns what is already cached (no re-discovery path here).
   * 7. Tool calls (callTool) run per-thread ephemeral execs without modifying discovery state.
   *
   * This design eliminates prior race where addMcpServer() did an immediate listTools() causing a second concurrent discoverTools() before started=true.
   */
  // Namespace is now derived from config dynamically. If not yet configured, falls back to 'mcp'.
  // Once first non-default namespace is observed, further attempts to change it are ignored (warned).

  private started = false;
  private toolsCache: LocalMCPServerTool[] | null = null;
  private lastToolsUpdatedAt?: number; // ms epoch
  private heartbeatTimer?: NodeJS.Timeout;
  private containerProvider?: WorkspaceNode;
  private toolsDiscovered = false; // tracks if we've done initial tool discovery
  private startRetryTimer?: NodeJS.Timeout;
  private dependencyTimeoutTimer?: NodeJS.Timeout;
  private emitter = new EventEmitter();
  private toolFilterMatchers: Array<(name: string) => boolean> | null = null;
  // Debug / tracing counters

  // Node lifecycle state driven by base Node
  private _provInFlight: Promise<void> | null = null;

  constructor(
    @Inject(EnvService) protected envService: EnvService,
    @Inject(ConfigService) protected configService: ConfigService,
  ) {
    super();
  }

  private formatError(error: unknown): string {
    if (error instanceof Error) return `${error.name}: ${error.message}`;
    return String(error);
  }

  get namespace(): string {
    return this.config.namespace ?? 'mcp';
  }

  getPortConfig() {
    return {
      targetPorts: {
        $self: { kind: 'instance' },
        workspace: { kind: 'method', create: 'setContainerProvider' },
      },
    } as const;
  }

  override async setConfig(cfg: z.infer<typeof LocalMcpServerStaticConfigSchema>): Promise<void> {
    const parsed = LocalMcpServerStaticConfigSchema.parse(cfg ?? {});
    this.toolFilterMatchers = this.buildToolFilterMatchers(parsed.toolFilter);
    await super.setConfig(parsed);
    this.notifyToolsUpdated(Date.now());
  }

  /**
   * Create a LocalMCPServerTool instance from a McpTool.
   * If a delegate is provided, it is used (for discovered tools); otherwise, a fallback delegate is used (for preloaded tools).
   */
  private createLocalTool(tool: McpTool): LocalMCPServerTool {
    const schemaCandidate: unknown = jsonSchemaToZod(tool.inputSchema);
    const inputSchema = schemaCandidate instanceof z.ZodObject ? schemaCandidate : z.object({}).strict();
    return new LocalMCPServerTool(tool.name, tool.description || 'MCP tool', inputSchema, this);
  }

  private buildToolFilterMatchers(
    filter: z.infer<typeof ToolFilterSchema> | undefined,
  ): Array<(name: string) => boolean> | null {
    if (!filter) return null;
    if (!filter.rules.length) return [];
    return filter.rules.map((rule) => {
      try {
        return picomatch(rule.pattern);
      } catch (_err) {
        throw new Error(`invalid_mcp_tool_filter_pattern: ${rule.pattern}`);
      }
    });
  }

  /**
   * Discover tools by starting temporary MCP server, fetching tools, then stopping the container.
   * This is called during agent registration to discover available tools.
   */
  async discoverTools(): Promise<LocalMCPServerTool[]> {
    if (!this.config) throw new Error('LocalMCPServer: config not yet set via setConfig');
    if (!this.containerProvider) throw new Error('LocalMCPServer: no containerProvider set; cannot discover tools');
    if (!this.config.command) throw new Error('LocalMCPServer: config.command is required for tool discovery');

    if (this.toolsDiscovered && this.toolsCache) {
      return this.toolsCache;
    }

    const t0 = Date.now();
    this.logger.log(`[MCP:${this.config.namespace}] Starting tool discovery (toolsDiscovered=${this.toolsDiscovered})`);

    // Use temporary container for tool discovery
    const tempWorkspace = await this.containerProvider.provide(`_discovery_temp_${uuidv4()}`);

    if (!this.config) throw new Error('LocalMCPServer: config not yet set via setConfig');
    const command = this.config.command ?? DEFAULT_MCP_COMMAND;
    const envOverlay = await this.resolveEnvOverlay();
    const { cmdToRun, envArr, workdir } = this.buildExecConfig(command, envOverlay);
    let tempTransport: WorkspaceExecTransport | undefined;
    let tempClient: Client | undefined;

    try {
      // Create temporary transport and client for discovery
      tempTransport = new WorkspaceExecTransport(async () =>
        tempWorkspace.openStdioSession(['sh', '-lc', cmdToRun], {
          tty: false,
          env: envArr,
          workdir,
          demuxStderr: true,
        }),
      );

      tempClient = new Client({ name: 'local-agent-discovery', version: '0.1.0' });
      this.logger.log(`[MCP:${this.config.namespace}] Connecting for tool discovery`);
      await tempClient.connect(tempTransport, { timeout: this.config.startupTimeoutMs ?? 15000 });
      this.logger.log(`[MCP:${this.config.namespace}] Handshake complete`);

      // Fetch tools
      const result = await tempClient.listTools({}, { timeout: this.config.requestTimeoutMs ?? 15000 });
      this.logger.debug(
        `[MCP:${this.config.namespace}] Discovered tools: ${JSON.stringify(result.tools.map((t) => t.name))}`,
      );
      this.toolsCache = result.tools.map((t) => this.createLocalTool(t as McpTool));

      this.logger.log(`[MCP:${this.config.namespace}] Discovered ${this.toolsCache.length} tools`);
      this.toolsDiscovered = true;
      this.lastToolsUpdatedAt = Date.now();
      // Notify listeners with unified tools update event
      this.notifyToolsUpdated(this.lastToolsUpdatedAt || Date.now());
    } catch (err) {
      this.logger.error(`[MCP:${this.config.namespace}] Tool discovery failed error=${this.formatError(err)}`);
    } finally {
      // Clean up temporary resources
      if (tempClient) {
        try {
          await tempClient.close();
        } catch (e) {
          this.logger.error(`[MCP:${this.config.namespace}] Error closing temp client error=${this.formatError(e)}`);
        }
      }
      if (tempTransport) {
        try {
          await tempTransport.close();
        } catch (e) {
          this.logger.error(`[MCP:${this.config.namespace}] Error closing temp transport error=${this.formatError(e)}`);
        }
      }
      // Destroy the temporary workspace after discovery
      try {
        await tempWorkspace.destroy({ force: true });
        const ms = Date.now() - t0;
        this.logger.log(
          `[MCP:${this.config.namespace}] Temporary discovery workspace cleaned up (duration=${ms}ms)`,
        );
      } catch (e) {
        this.logger.error(
          `[MCP:${this.config.namespace}] Error cleaning up temp workspace error=${this.formatError(e)}`,
        );
      }
    }

    return this.toolsCache ?? [];
  }

  /** Inject a container provider (graph edge). If server already started with a different container, no action taken. */
  setContainerProvider(provider: WorkspaceNode | undefined): void {
    this.containerProvider = provider;
  }

  getToolsSnapshot(): { tools: Array<{ name: string; description: string }>; updatedAt?: number } {
    const tools = this.applyToolFilter(this.toolsCache ? [...this.toolsCache] : []);
    return {
      tools: tools.map((tool) => ({ name: tool.name, description: tool.description })),
      updatedAt: this.lastToolsUpdatedAt,
    };
  }

  // Return legacy McpTool shape for interface compliance; callers needing function tools can access toolsCache directly.
  listTools(_force = false): LocalMCPServerTool[] {
    return this.applyToolFilter(this.toolsCache ? [...this.toolsCache] : []);
  }

  private applyToolFilter(tools: LocalMCPServerTool[]): LocalMCPServerTool[] {
    const filter = this.config?.toolFilter;
    if (!filter) return tools;
    const matchers = this.toolFilterMatchers ?? [];
    if (matchers.length === 0) {
      return filter.mode === 'allow' ? [] : tools;
    }
    const matches = (tool: LocalMCPServerTool) => matchers.some((matcher) => matcher(tool.rawName));
    if (filter.mode === 'allow') {
      return tools.filter(matches);
    }
    return tools.filter((tool) => !matches(tool));
  }

  async callTool(
    name: string,
    args: unknown,
    options: { threadId: string; timeoutMs?: number },
  ): Promise<McpToolCallResult> {
    if (!this.config) throw new Error('LocalMCPServer: config not yet set via setConfig');
    if (!this.containerProvider) throw new Error('LocalMCPServer: no containerProvider set; cannot call tool');

    const threadId = options.threadId;
    this.logger.log(`[MCP:${this.config.namespace}] Calling tool ${name} for thread ${threadId}`);

    // Get thread-specific container
    const container = await this.containerProvider.provide(threadId);
    // Touch last-used when starting a tool call (defensive; provider already updates on provide)
    try {
      await container.touch();
    } catch {
      // ignore last-used update errors
    }

    if (!this.config) throw new Error('LocalMCPServer: config not yet set via setConfig');
    const command = this.config.command ?? DEFAULT_MCP_COMMAND;
    const envOverlay = await this.resolveEnvOverlay();
    const { cmdToRun, envArr, workdir } = this.buildExecConfig(command, envOverlay);
    let transport: WorkspaceExecTransport | undefined;
    let client: Client | undefined;
    let hbTimer: NodeJS.Timeout | undefined;

    try {
      // Create transport and client for this tool call
      transport = new WorkspaceExecTransport(async () =>
        container.openStdioSession(['sh', '-lc', cmdToRun], {
          tty: false,
          env: envArr,
          workdir,
          demuxStderr: true,
        }),
      );

      await transport.start();

      client = new Client({ name: `local-agent-${threadId}`, version: '0.1.0' });
      await client.connect(transport, { timeout: this.config.startupTimeoutMs ?? 15000 });
      // Heartbeat: keep last_used_at fresh during the session
      const hbInterval = Math.max(60_000, this.config.heartbeatIntervalMs ?? 300_000);
      hbTimer = setInterval(() => {
        container.touch().catch(() => {});
      }, hbInterval);

      // Call the tool
      const argObj: Record<string, unknown> = args && typeof args === 'object' ? (args as Record<string, unknown>) : {};
      const result = await client.callTool({ name, arguments: argObj }, undefined, {
        timeout: options?.timeoutMs ?? this.config.requestTimeoutMs ?? 30000,
      });

      const rawResult: unknown = result as unknown;
      const rawContent = (
        rawResult && typeof rawResult === 'object' && 'content' in (rawResult as Record<string, unknown>)
          ? (rawResult as Record<string, unknown>).content
          : undefined
      ) as unknown;
      const contentArr: unknown[] = Array.isArray(rawContent) ? (rawContent as unknown[]) : [];
      const flattened = contentArr
        .map((c: unknown) => {
          if (typeof c === 'string') return c;
          if (c && typeof c === 'object') {
            const obj = c as Record<string, unknown>;
            if ('text' in obj && typeof obj.text === 'string') return obj.text as string;
            if ('data' in obj) return JSON.stringify(obj.data);
          }
          try {
            return JSON.stringify(c);
          } catch {
            return String(c);
          }
        })
        .join('\n');
      const structured =
        rawResult && typeof rawResult === 'object' && 'structuredContent' in (rawResult as Record<string, unknown>)
          ? ((rawResult as Record<string, unknown>).structuredContent as Record<string, unknown>)
          : undefined;
      return {
        isError: !!(
          rawResult &&
          typeof rawResult === 'object' &&
          'isError' in (rawResult as Record<string, unknown>) &&
          (rawResult as Record<string, unknown>).isError
        ),
        content: flattened,
        structuredContent: (structured ?? undefined) as { [x: string]: unknown } | undefined,
        raw: result,
      };
    } catch (e: unknown) {
      let exitCode: number | undefined;
      let stdout = '';
      let stderr = '';
      if (transport) {
        try {
          await transport.close();
        } catch (closeErr) {
          this.logger.error(
            `[MCP:${this.config.namespace}] Error closing transport after tool failure error=${this.formatError(closeErr)}`,
          );
        }
        const execResult = transport.getExecResult();
        exitCode = execResult.exitCode;
        stdout = execResult.stdout;
        stderr = execResult.stderr;
        transport = undefined;
      }
      const errObj = e as { code?: string } | unknown;
      const emsg =
        e && typeof e === 'object' && 'message' in e ? String((e as { message?: unknown }).message) : String(e);
      const ename = e && typeof e === 'object' && 'name' in e ? String((e as { name?: unknown }).name) : 'Error';
      const code =
        errObj && typeof errObj === 'object' && 'code' in errObj
          ? String((errObj as { code?: unknown }).code)
          : 'TOOL_CALL_ERROR';
      throw new McpError(`Tool '${name}' failed: ${ename}: ${emsg}`.trim(), {
        code,
        cause: e,
        exitCode,
        stdout,
        stderr,
      });
    } finally {
      // Clean up after tool call
      if (client) {
        try {
          await client.close();
        } catch (e) {
          this.logger.error(
            `[MCP:${this.config.namespace}] Error closing client after tool call error=${this.formatError(e)}`,
          );
        }
      }
      if (transport) {
        try {
          await transport.close();
        } catch (e) {
          this.logger.error(
            `[MCP:${this.config.namespace}] Error closing transport after tool call error=${this.formatError(e)}`,
          );
        }
      }
      if (hbTimer) clearInterval(hbTimer);
    }
  }

  // Unified event subscription supporting core and MCP-specific events
  on(event: 'ready' | 'exit' | 'error' | 'restarted' | 'mcp.tools_updated', handler: (...a: unknown[]) => void): this {
    this.emitter.on(event, handler);
    return this;
  }

  async provision(): Promise<void> {
    if (this.status === 'ready') return;
    if (this._provInFlight) return this._provInFlight;

    this.logger.debug(`[MCP:${this.config.namespace}] provision() invoked (started=${this.started})`);
    if (this.started) {
      return;
    }
    const hasAllDeps = !!(this.config && this.containerProvider && this.config.command);
    if (!hasAllDeps) {
      this.logger.log(`[MCP:${this.config.namespace}] Missing dependencies for provisioning`);
      this.setStatus('provisioning_error');
      return;
    }

    this.setStatus('provisioning');
    this._provInFlight = (async () => {
      try {
        await this.startOnce();
        if (this.started) this.setStatus('ready');
      } catch (err) {
        this.logger.log(`[MCP:${this.config.namespace}] Provisioning failed error=${this.formatError(err)}`);
        this.setStatus('provisioning_error');
      } finally {
        this._provInFlight = null;
      }
    })();
    return this._provInFlight;
  }

  async deprovision(): Promise<void> {
    if (this.status === 'not_ready') return;
    this.setStatus('deprovisioning');
    // Stop timers and clear state
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.startRetryTimer) clearTimeout(this.startRetryTimer);
    if (this.dependencyTimeoutTimer) clearTimeout(this.dependencyTimeoutTimer);
    this.started = false;
    this.toolsCache = null;
    this.toolsDiscovered = false;
    this.setStatus('not_ready');
  }

  // -------- DynamicConfig (internal, no external capability) --------
  // Dynamic config APIs removed; tools_updated emitted on cache change only

  // Emit the unified tools update event with typed payload
  private notifyToolsUpdated(updatedAt: number): void {
    const tools = this.toolsCache ? [...this.toolsCache] : [];
    const ts = Number.isFinite(updatedAt) ? updatedAt : Date.now();
    try {
      this.emitter.emit('mcp.tools_updated', { tools, updatedAt: ts });
    } catch (e) {
      this.logger.error(`[MCP:${this.config.namespace}] Error emitting tools_updated error=${this.formatError(e)}`);
    }
  }

  private async startOnce() {
    try {
      const staleTimeout = (this.config?.staleTimeoutMs ?? this.configService?.mcpToolsStaleTimeoutMs ?? 0) as number;
      const isStale = (() => {
        if (!staleTimeout) return false;
        const last = this.lastToolsUpdatedAt || 0;
        return last <= 0 || Date.now() - last > staleTimeout;
      })();
      if (!this.toolsDiscovered || isStale) {
        const tDisc0 = Date.now();
        await this.discoverTools();
        const tDiscMs = Date.now() - tDisc0;
        this.logger.debug(`[MCP:${this.config.namespace}] Discovery phase duration ${tDiscMs}ms`);
      }
      this.started = true;
      this.logger.log(`[MCP:${this.config.namespace}] Started successfully with ${this.toolsCache?.length || 0} tools`);
    } catch (e: unknown) {
      this.logger.error(`[MCP:${this.config.namespace}] Start attempt failed error=${this.formatError(e)}`);
    }
  }
}
