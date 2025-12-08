import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { WorkspaceNode } from '../workspace/workspace.node';
// Legacy capabilities removed; rely on Node lifecycle/state
import { ConfigService } from '../../core/services/config.service';
import { ContainerService } from '../../infra/container/container.service';
import { EnvService, type EnvItem } from '../../env/env.service';
import { DockerExecTransport } from './dockerExecTransport';
import { LocalMCPServerTool } from './localMcpServer.tool';
import { DEFAULT_MCP_COMMAND, McpError, type McpTool, McpToolCallResult, PersistedMcpState } from './types';
import { NodeStateService } from '../../graph/nodeState.service';
import Node from '../base/Node';
import { Inject, Injectable, Scope } from '@nestjs/common';
import { jsonSchemaToZod } from '@agyn/json-schema-to-zod';
import { isEqual } from 'lodash-es';
import { ModuleRef } from '@nestjs/core';
import { ReferenceValueSchema } from '../../utils/reference-schemas';

const EnvItemSchema = z
  .object({
    name: z.string().min(1),
    value: ReferenceValueSchema,
  })
  .strict()
  .describe('Environment variable entry (static string or reference).');

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
  // Debug / tracing counters

  // Node lifecycle state driven by base Node
  private _provInFlight: Promise<void> | null = null;

  // Dynamic config: enabled tools (undefined => disabled by default)
  // Tools are exposed only after enabledTools explicitly enumerates them.
  private _globalStaleTimeoutMs = 0;
  // Last seen enabled tools from state for change detection
  private _lastEnabledTools?: string[];

  constructor(
    @Inject(ContainerService) protected containerService: ContainerService,
    @Inject(EnvService) protected envService: EnvService,
    @Inject(ConfigService) protected configService: ConfigService,
    @Inject(ModuleRef) private readonly moduleRef: ModuleRef,
  ) {
    super();
  }

  private formatError(error: unknown): string {
    if (error instanceof Error) return `${error.name}: ${error.message}`;
    return String(error);
  }

  private nodeStateService?: NodeStateService;

  private getNodeStateService(): NodeStateService | undefined {
    if (!this.nodeStateService) {
      try {
        this.nodeStateService = this.moduleRef.get(NodeStateService, { strict: false });
      } catch {
        this.nodeStateService = undefined;
      }
    }
    return this.nodeStateService;
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

  /**
   * Create a LocalMCPServerTool instance from a McpTool.
   * If a delegate is provided, it is used (for discovered tools); otherwise, a fallback delegate is used (for preloaded tools).
   */
  private createLocalTool(tool: McpTool): LocalMCPServerTool {
    const schemaCandidate: unknown = jsonSchemaToZod(tool.inputSchema);
    const inputSchema = schemaCandidate instanceof z.ZodObject ? schemaCandidate : z.object({}).strict();
    return new LocalMCPServerTool(tool.name, tool.description || 'MCP tool', inputSchema, this);
  }

  preloadCachedTools(tools: McpTool[], updatedAt?: number | string | Date): void {
    this.toolsCache = tools.map((t) => this.createLocalTool(t));
    this.toolsDiscovered = true; // consider discovered for initial dynamic schema availability

    if (updatedAt !== undefined) {
      const ts =
        typeof updatedAt === 'number'
          ? updatedAt
          : updatedAt instanceof Date
            ? updatedAt.getTime()
            : Date.parse(String(updatedAt));
      if (Number.isFinite(ts)) this.lastToolsUpdatedAt = ts;
    }
    // Notify listeners with unified tools update event
    this.notifyToolsUpdated(Date.now());
  }

  async setState(state: { mcp?: PersistedMcpState }): Promise<void> {
    // Preload cached tools if present in state
    if (state?.mcp && state.mcp.tools) {
      const summaries = state.mcp.tools;
      const updatedAt = state.mcp.toolsUpdatedAt;
      try {
        this.preloadCachedTools(summaries, updatedAt);
      } catch (e) {
        this.logger.error(`Error during MCP cache preload for node ${this.nodeId}: ${this.formatError(e)}`);
      }
    }
    // Detect enabledTools changes in state.mcp (optional field)
    const mcpState = state?.mcp as Record<string, unknown> | undefined;
    const rawEnabled: unknown = mcpState ? (mcpState['enabledTools'] as unknown) : undefined;
    const nextEnabled =
      Array.isArray(rawEnabled) && rawEnabled.every((v) => typeof v === 'string')
        ? (rawEnabled as string[])
        : undefined;
    if (!isEqual(this._lastEnabledTools, nextEnabled)) {
      this._lastEnabledTools = nextEnabled ? [...nextEnabled] : undefined;
      this.notifyToolsUpdated(Date.now());
    }
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
    const tempContainer = await this.containerProvider.provide(`_discovery_temp_${uuidv4()}`);
    const tempContainerId = tempContainer.id;

    if (!this.config) throw new Error('LocalMCPServer: config not yet set via setConfig');
    const command = this.config.command ?? DEFAULT_MCP_COMMAND;
    const envOverlay = await this.resolveEnvOverlay();
    const { cmdToRun, envArr, workdir } = this.buildExecConfig(command, envOverlay);
    const docker = this.containerService.getDocker();

    let tempTransport: DockerExecTransport | undefined;
    let tempClient: Client | undefined;

    try {
      // Create temporary transport and client for discovery
      tempTransport = new DockerExecTransport(
        docker,
        async () => {
          this.logger.debug(`[MCP:${this.config.namespace}] launching docker exec`);
          const exec = await docker.getContainer(tempContainerId).exec({
            Cmd: ['sh', '-lc', cmdToRun],
            AttachStdout: true,
            AttachStderr: true,
            AttachStdin: true,
            Tty: false,
            WorkingDir: workdir,
            Env: envArr,
          });
          const stream: unknown = await new Promise((resolve, reject) => {
            exec.start({ hijack: true, stdin: true }, (err, s) => {
              if (err) return reject(err);
              if (!s) return reject(new Error('No stream from exec.start'));
              resolve(s);
            });
          });
          return {
            stream,
            inspect: async () => {
              const r = await exec.inspect();
              return { ExitCode: r.ExitCode ?? undefined };
            },
          };
        },
        { demux: true },
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
      // Persist state using NodeStateService (if available)
      try {
        const state: { mcp: PersistedMcpState } = {
          mcp: {
            tools: result.tools.map(
              (t) =>
                ({
                  name: t.name,
                  description: t.description,
                  inputSchema: t.inputSchema,
                  outputSchema: t.outputSchema,
                }) as McpTool,
            ),
            toolsUpdatedAt: this.lastToolsUpdatedAt,
          },
        };
        const nodeStateService = this.getNodeStateService();
        if (nodeStateService) {
          await nodeStateService.upsertNodeState(this.nodeId, state as Record<string, unknown>);
        }
      } catch (e) {
        this.logger.error(`[MCP:${this.config.namespace}] Failed to persist state error=${this.formatError(e)}`);
      }
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
      // Stop the temporary container
      try {
        await tempContainer.stop(5);
        await tempContainer.remove(true);
        const ms = Date.now() - t0;
        this.logger.log(
          `[MCP:${this.config.namespace}] Temporary discovery container stopped and removed (duration=${ms}ms)`,
        );
      } catch (e) {
        this.logger.error(
          `[MCP:${this.config.namespace}] Error cleaning up temp container error=${this.formatError(e)}`,
        );
      }
      await this.cleanTempDinDSidecars(tempContainerId).catch((e) => {
        this.logger.error(
          `[MCP:${this.config.namespace}] Error cleaning DinD sidecars for temp container error=${this.formatError(e)}`,
        );
      });
    }

    return this.toolsCache ?? [];
  }

  /** Inject a container provider (graph edge). If server already started with a different container, no action taken. */
  setContainerProvider(provider: WorkspaceNode | undefined): void {
    this.containerProvider = provider;
  }

  // Return legacy McpTool shape for interface compliance; callers needing function tools can access toolsCache directly.
  listTools(_force = false): LocalMCPServerTool[] {
    // Passive: Only return cached tools filtered by enabledTools.
    const allTools: LocalMCPServerTool[] = this.toolsCache ? [...this.toolsCache] : [];
    const ns = this.namespace;

    // Normalize a raw or namespaced enabledTool name to the runtime LocalMCPServerTool.name
    const toRuntimeName = (name: string): string => {
      const prefix = ns ? `${ns}_` : '';
      if (prefix && name.startsWith(prefix)) return name; // already namespaced for this server
      if (!prefix) return name; // no namespace -> runtime == raw
      // Accept raw names and map to runtime namespaced form
      return `${prefix}${name}`;
    };

    // Prefer NodeStateService snapshot
    let enabledList: string[] | undefined;
    try {
      const snap = this.getNodeStateService()?.getSnapshot(this.nodeId) as
        | { mcp?: { enabledTools?: string[] } }
        | undefined;
      if (snap && snap.mcp && Array.isArray(snap.mcp.enabledTools)) {
        enabledList = [...snap.mcp.enabledTools];
      }
    } catch {
      // ignore snapshot errors
    }

    // Fallback to last enabledTools captured via setState if snapshot not ready
    if (!enabledList && Array.isArray(this._lastEnabledTools)) {
      enabledList = [...this._lastEnabledTools];
    }

    if (enabledList === undefined) {
      return [];
    }

    const wantedRuntimeNames = new Set<string>(enabledList.map((n) => toRuntimeName(String(n))));
    const availableNames = new Set(allTools.map((t) => t.name));
    // Log and ignore unknown names
    const unknown: string[] = Array.from(wantedRuntimeNames).filter((n) => !availableNames.has(n));
    if (unknown.length) {
      const availableList = Array.from(availableNames).join(',');
      this.logger.log(
        `[MCP:${ns}] enabledTools contains unknown tool(s); ignoring unknown=${unknown.join(',')} available=${availableList}`,
      );
    }
    return allTools.filter((t) => wantedRuntimeNames.has(t.name));
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
      await this.containerService.touchLastUsed(container.id);
    } catch {
      // ignore last-used update errors
    }
    const containerId = container.id;

    if (!this.config) throw new Error('LocalMCPServer: config not yet set via setConfig');
    const command = this.config.command ?? DEFAULT_MCP_COMMAND;
    const envOverlay = await this.resolveEnvOverlay();
    const { cmdToRun, envArr, workdir } = this.buildExecConfig(command, envOverlay);
    const docker = this.containerService.getDocker();

    let transport: DockerExecTransport | undefined;
    let client: Client | undefined;
    let hbTimer: NodeJS.Timeout | undefined;

    try {
      // Create transport and client for this tool call
      transport = new DockerExecTransport(
        docker,
        async () => {
          const exec = await docker.getContainer(containerId).exec({
            Cmd: ['sh', '-lc', cmdToRun],
            AttachStdout: true,
            AttachStderr: true,
            AttachStdin: true,
            Tty: false,
            WorkingDir: workdir,
            Env: envArr,
          });
          const stream: unknown = await new Promise((resolve, reject) => {
            exec.start({ hijack: true, stdin: true }, (err, s) => {
              if (err) return reject(err);
              if (!s) return reject(new Error('No stream from exec.start'));
              resolve(s);
            });
          });
          return {
            stream,
            inspect: async () => {
              const r = await exec.inspect();
              return { ExitCode: r.ExitCode ?? undefined };
            },
          };
        },
        { demux: true },
      );

      await transport.start();

      client = new Client({ name: `local-agent-${threadId}`, version: '0.1.0' });
      await client.connect(transport, { timeout: this.config.startupTimeoutMs ?? 15000 });
      // Heartbeat: keep last_used_at fresh during the session
      const hbInterval = Math.max(60_000, this.config.heartbeatIntervalMs ?? 300_000);
      hbTimer = setInterval(() => {
        this.containerService.touchLastUsed(containerId).catch(() => {});
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
      const errObj = e as { code?: string } | unknown;
      const emsg =
        e && typeof e === 'object' && 'message' in e ? String((e as { message?: unknown }).message) : String(e);
      const ename = e && typeof e === 'object' && 'name' in e ? String((e as { name?: unknown }).name) : 'Error';
      const code =
        errObj && typeof errObj === 'object' && 'code' in errObj
          ? String((errObj as { code?: unknown }).code)
          : 'TOOL_CALL_ERROR';
      throw new McpError(`Tool '${name}' failed: ${ename}: ${emsg}`.trim(), code);
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
  private async cleanTempDinDSidecars(tempContainerId: string): Promise<void> {
    type DindLike = {
      id?: string;
      stop?: (timeout?: number) => Promise<void>;
      remove?: (force?: boolean) => Promise<void>;
    };
    let dinds: DindLike[] = [];
    try {
      const found = await this.containerService.findContainersByLabels(
        { 'hautech.ai/role': 'dind', 'hautech.ai/parent_cid': tempContainerId },
        { all: true },
      );
      dinds = Array.isArray(found) ? found : [];
    } catch (e) {
      // In tests, ContainerService may be a minimal stub; guard TypeErrors
      this.logger.warn(`[MCP:${this.config.namespace}] DinD cleanup: findContainersByLabels failed: ${String(e)}`);
      return;
    }
    if (!Array.isArray(dinds) || dinds.length === 0) return;
    const results = await Promise.allSettled(
      dinds.map(async (d: DindLike) => {
        const id: string | undefined = typeof d.id === 'string' ? d.id : undefined;
        // Stop
        try {
          if (typeof d.stop === 'function') await d.stop(5);
          else if (id) {
            const docker = this.containerService.getDocker();
            await docker.getContainer(id).stop({ t: 5 } as { t?: number });
          }
        } catch (e: unknown) {
          const sc = (e as { statusCode?: number } | undefined)?.statusCode;
          if (sc !== 304 && sc !== 404 && sc !== 409) throw e;
        }
        // Remove
        try {
          if (typeof d.remove === 'function') await d.remove(true);
          else if (id) {
            const docker = this.containerService.getDocker();
            await docker.getContainer(id).remove({ force: true } as { force?: boolean });
          }
          return true as const;
        } catch (e: unknown) {
          const sc = (e as { statusCode?: number } | undefined)?.statusCode;
          if (sc !== 404 && sc !== 409) throw e;
          return false as const;
        }
      }),
    );
    const cleaned = results.reduce((acc, r) => acc + (r.status === 'fulfilled' && r.value ? 1 : 0), 0);
    if (cleaned > 0) {
      this.logger.log(
        `[MCP:${this.config.namespace}] Cleaned ${cleaned} DinD sidecar(s) for temp container ${String(tempContainerId).substring(0, 12)}`,
      );
    }
    const rejected = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
    if (rejected.length)
      throw new AggregateError(
        rejected.map((r) => r.reason),
        'One or more temp DinD cleanup tasks failed',
      );
  }
}
