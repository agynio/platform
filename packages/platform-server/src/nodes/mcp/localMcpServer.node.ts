import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { toJSONSchema, z } from 'zod';
import { convertJsonSchemaToZod } from 'zod-from-json-schema';
import { JSONSchema } from 'zod/v4/core';
import { WorkspaceNode } from '../workspace/workspace.node';
import type { DynamicConfigurable, ProvisionStatus, Provisionable } from '../../graph/capabilities';
import { ConfigService } from '../../core/services/config.service';
import { ContainerService } from '../../infra/container/container.service';
import { EnvService, type EnvItem } from '../../graph/env.service';
import { LoggerService } from '../../core/services/logger.service';
import { VaultService } from '../../infra/vault/vault.service';
import { DockerExecTransport } from './dockerExecTransport';
import { LocalMCPServerTool } from './localMcpServer.tool';
import { DEFAULT_MCP_COMMAND, McpError, McpServer, McpTool, McpToolCallResult, PersistedMcpState } from './types';
import { NodeStateService } from '../../graph/nodeState.service';

const EnvItemSchema = z
  .object({
    key: z.string().min(1),
    value: z.string(),
    source: z.enum(['static', 'vault']).optional().default('static'),
  })
  .strict()
  .describe('Environment variable entry. When source=vault, value is "<MOUNT>/<PATH>/<KEY>".');

export const LocalMcpServerStaticConfigSchema = z.object({
  title: z.string().optional(),
  namespace: z.string().min(1).default('mcp').describe('Namespace prefix for exposed MCP tools.'),
  command: z
    .string()
    .optional()
    .describe('Startup command executed inside the container (default: mcp start --stdio).'),
  workdir: z.string().optional().describe('Working directory inside the container.'),
  env: z
    .array(EnvItemSchema)
    .optional()
    .describe('Environment variables (static or vault references).')
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

export class LocalMCPServer implements McpServer, Provisionable, DynamicConfigurable<Record<string, boolean>> {
  private async resolveEnvOverlay(): Promise<Record<string, string> | undefined> {
    const items: EnvItem[] = (this.cfg?.env || []) as EnvItem[];
    if (!items.length) return undefined;
    // Prefer injected EnvService; fallback to local via Vault if available
    const svc = this.envService || (this.vault ? new EnvService(this.vault) : undefined);
    if (svc) {
      try {
        const r = await svc.resolveEnvItems(items);
        return Object.keys(r).length ? r : undefined;
      } catch {
        // fall through to static-only fallback
      }
    }
    // Fallback: include only static entries when resolver is unavailable
    const staticOnly = items
      .filter((i) => (i.source ?? 'static') === 'static')
      .reduce<Record<string, string>>((acc, it) => {
        acc[it.key] = it.value;
        return acc;
      }, {});
    return Object.keys(staticOnly).length ? staticOnly : undefined;
  }

  private buildExecConfig(command: string, envOverlay?: Record<string, string>) {
    const cfg = this.cfg;
    if (!cfg) throw new Error('LocalMCPServer: config not yet set via setConfig');
    const cmdToRun = command;
    const envArr = envOverlay ? Object.entries(envOverlay).map(([k, v]) => `${k}=${v}`) : undefined;
    return { cmdToRun, envArr, workdir: cfg.workdir };
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
  get namespace(): string {
    return this.cfg?.namespace || 'mcp';
  }
  private client?: Client;
  private started = false;
  private toolsCache: LocalMCPServerTool[] | null = null;
  private lastToolsUpdatedAt?: number; // ms epoch
  private heartbeatTimer?: NodeJS.Timeout;
  private restartAttempts = 0;
  private containerProvider?: WorkspaceNode;
  private pendingStart?: Promise<void>; // ensure single in-flight start
  private cfg?: z.infer<typeof LocalMcpServerStaticConfigSchema>;
  private toolsDiscovered = false; // tracks if we've done initial tool discovery
  // Resilient start state
  private wantStart = false; // intent flag indicating someone requested start
  private startWaiters: { resolve: () => void; reject: (e: unknown) => void }[] = [];
  private startRetryTimer?: NodeJS.Timeout;
  private dependencyTimeoutTimer?: NodeJS.Timeout;
  private emitter = new EventEmitter();
  // Debug / tracing counters
  private _discoverySeq = 0;
  private _startInvocationSeq = 0;
  private _tryStartSeq = 0;
  private _maybeStartSeq = 0;

  // Provisionable state
  private _provStatus: ProvisionStatus = { state: 'not_ready' };
  private _provListeners: Array<(s: ProvisionStatus) => void> = [];
  private _provInFlight: Promise<void> | null = null;

  // Dynamic config: enabled tools (if undefined => all enabled by default)
  private _enabledTools: Set<string> | undefined;
  // Cached dynamic config zod schema (rebuilt after discovery)
  private _dynamicConfigZodSchema?: z.ZodTypeAny;
  // Dynamic config change listeners (normalized config record)
  private _dynCfgListeners: Array<(cfg: Record<string, boolean>) => void> = [];
  private _lastEnabledSig?: string; // signature of last emitted enabled set for change detection
  private _globalStaleTimeoutMs = 0;

  constructor(
    private containerService: ContainerService,
    private logger: LoggerService,
    private vault: VaultService,
    private envService: EnvService,
    private configService: ConfigService,
    private nodeStateService?: NodeStateService,
  ) {}

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
    return new LocalMCPServerTool(
      {
        getName: () => tool.name,
        getDescription: () => tool.description || 'MCP tool',
        getDelegate: () => ({
          callTool: async (name: string, args: unknown) => {
            const res = await this.callTool(name, args, { threadId: '__mcp_exec__' });
            return {
              isError: res.isError,
              content: res.content,
              structuredContent: res.structuredContent,
              raw: res.raw,
            };
          },
          getLogger: () => this.logger,
        }),
      },
      convertJsonSchemaToZod({ ...tool.inputSchema, strict: false, additionalProperties: false }) as z.ZodObject,
    );
  }

  /** Create a LocalMCPServerTool from a persisted summary without schemas. Accept any object input. */
  private createLocalToolFromSummary(summary: PersistedMcpToolSummary): LocalMCPServerTool {
    return new LocalMCPServerTool(
      {
        getName: () => summary.name,
        getDescription: () => summary.description || 'MCP tool',
        getDelegate: () => ({
          callTool: async (name: string, args: unknown) => {
            const res = await this.callTool(name, args, { threadId: '__mcp_exec__' });
            return {
              isError: res.isError,
              content: res.content,
              structuredContent: res.structuredContent,
              raw: res.raw,
            };
          },
          getLogger: () => this.logger,
        }),
      },
      z.object({}).catchall(z.any()).strict(),
    );
  }

  preloadCachedTools(tools: Array<McpTool | PersistedMcpToolSummary> | undefined | null, updatedAt?: number | string | Date): void {
    if (tools && Array.isArray(tools) && tools.length > 0) {
      this.toolsCache = tools.map((t) => (('inputSchema' in (t as McpTool)) ? this.createLocalTool(t as McpTool) : this.createLocalToolFromSummary(t as PersistedMcpToolSummary)));
      this.toolsDiscovered = true; // consider discovered for initial dynamic schema availability
    }
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

  /**
   * Discover tools by starting temporary MCP server, fetching tools, then stopping the container.
   * This is called during agent registration to discover available tools.
   */
  async discoverTools(): Promise<LocalMCPServerTool[]> {
    if (!this.cfg) throw new Error('LocalMCPServer: config not yet set via setConfig');
    if (!this.containerProvider) throw new Error('LocalMCPServer: no containerProvider set; cannot discover tools');
    if (!this.cfg.command) throw new Error('LocalMCPServer: config.command is required for tool discovery');

    if (this.toolsDiscovered && this.toolsCache) {
      return this.toolsCache;
    }

    const discoveryId = ++this._discoverySeq;
    const t0 = Date.now();
    this.logger.info(
      `[MCP:${this.namespace}] [disc:${discoveryId}] Starting tool discovery (toolsDiscovered=${this.toolsDiscovered})`,
    );

    // Use temporary container for tool discovery
    const tempContainer = await this.containerProvider.provide(`_discovery_temp_${uuidv4()}`);
    const tempContainerId = tempContainer.id;

    const cfg = this.cfg;
    if (!cfg) throw new Error('LocalMCPServer: config not yet set via setConfig');
    const command = cfg.command ?? DEFAULT_MCP_COMMAND;
    const envOverlay = await this.resolveEnvOverlay();
    const { cmdToRun, envArr, workdir } = this.buildExecConfig(command, envOverlay);
    const docker = this.containerService.getDocker();

    let tempTransport: DockerExecTransport | undefined;
    let tempClient: Client | undefined;

    try {
      // Create temporary transport and client for discovery
      tempTransport = new DockerExecTransport(
        docker,
        this.logger,
        async () => {
          this.logger.debug(`[MCP:${this.namespace}] [disc:${discoveryId}] launching docker exec`);
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
      this.logger.info(`[MCP:${this.namespace}] [disc:${discoveryId}] Connecting for tool discovery`);
      await tempClient.connect(tempTransport, { timeout: cfg.startupTimeoutMs ?? 15000 });
      this.logger.info(`[MCP:${this.namespace}] [disc:${discoveryId}] Handshake complete`);

      // Fetch tools
      const result = await tempClient.listTools({}, { timeout: cfg.requestTimeoutMs ?? 15000 });
      this.logger.debug(`[MCP:${this.namespace}] Discovered tools: ${JSON.stringify(result.tools.map((t) => t.name))}`);
      this.toolsCache = result.tools.map((t) => this.createLocalTool(t as McpTool));

      this.logger.info(`[MCP:${this.namespace}] [disc:${discoveryId}] Discovered ${this.toolsCache.length} tools`);
      this.toolsDiscovered = true;
      this.lastToolsUpdatedAt = Date.now();
      // Invalidate dynamic schema cache so it will be rebuilt including newly discovered tools
      this._dynamicConfigZodSchema = undefined;
      // If user supplied a dynamic config before discovery completed, we preserve it.
      // Only default to "all enabled" when no prior config was set (i.e. _enabledTools is undefined).
      // (Earlier implementation unconditionally reset _enabledTools which discarded early user config
      // and prevented onDynamicConfigChanged from firing post-discovery.)
      if (this._enabledTools === undefined) {
        // Leave as undefined meaning "all enabled".
      } else {
        // We have a pre-existing enabled set provided earlier; emit change now that tools are known.
        const sig = this.enabledSignature();
        if (sig !== this._lastEnabledSig) {
          this._lastEnabledSig = sig;
          // Emit without logging verbose diff here (setDynamicConfig already logs when invoked) –
          // this path only occurs for early configs applied pre-discovery.
          this.emitDynamicConfigChanged();
        }
      }
      // Persist state using NodeStateService (if available)
      try {
        const state: { mcp: PersistedMcpState } = {
          mcp: {
            tools: (this.toolsCache || []).map((t) => ({ name: t.name, description: t.description })),
            toolsUpdatedAt: this.lastToolsUpdatedAt,
          },
        };
        if (this.nodeStateService) {
          await this.nodeStateService.upsertNodeState(this.namespace, state);
        }
      } catch (e) {
        this.logger.error(`[MCP:${this.namespace}] Failed to persist state`, e);
      }
      // Notify listeners with unified tools update event
      this.notifyToolsUpdated(this.lastToolsUpdatedAt || Date.now());
    } catch (err) {
      this.logger.error(`[MCP:${this.namespace}] [disc:${discoveryId}] Tool discovery failed`, err);
    } finally {
      // Clean up temporary resources
      if (tempClient) {
        try {
          await tempClient.close();
        } catch (e) {
          this.logger.error(`[MCP:${this.namespace}] Error closing temp client`, e);
        }
      }
      if (tempTransport) {
        try {
          await tempTransport.close();
        } catch (e) {
          this.logger.error(`[MCP:${this.namespace}] Error closing temp transport`, e);
        }
      }
      // Stop the temporary container
      try {
        await tempContainer.stop(5);
        await tempContainer.remove(true);
        const ms = Date.now() - t0;
        this.logger.info(
          `[MCP:${this.namespace}] [disc:${discoveryId}] Temporary discovery container stopped and removed (duration=${ms}ms)`,
        );
      } catch (e) {
        this.logger.error(`[MCP:${this.namespace}] [disc:${discoveryId}] Error cleaning up temp container`, e);
      }
      // Ensure any DinD sidecars created for the temporary discovery container are also cleaned up
      try {
        const dinds = await this.containerService.findContainersByLabels(
          { 'hautech.ai/role': 'dind', 'hautech.ai/parent_cid': tempContainerId },
          { all: true },
        );
        if (dinds.length > 0) {
          const results = await Promise.allSettled(
            dinds.map(async (d) => {
              try {
                await d.stop(5);
              } catch (e: unknown) {
                const sc = (e as { statusCode?: number } | undefined)?.statusCode;
                // benign: already stopped / not found / conflict
                if (sc !== 304 && sc !== 404 && sc !== 409) throw e;
              }
              try {
                await d.remove(true);
                return true;
              } catch (e: unknown) {
                const sc = (e as { statusCode?: number } | undefined)?.statusCode;
                // benign: already removed / removal in progress
                if (sc !== 404 && sc !== 409) throw e;
                return false;
              }
            }),
          );
          const cleaned = results.reduce((acc, r) => acc + (r.status === 'fulfilled' && r.value ? 1 : 0), 0);
          if (cleaned > 0) {
            this.logger.info(
              `[MCP:${this.namespace}] [disc:${discoveryId}] Cleaned ${cleaned} DinD sidecar(s) for temp container ${String(tempContainerId).substring(0, 12)}`,
            );
          }
          const rejected = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
          if (rejected.length) {
            throw new AggregateError(
              rejected.map((r) => r.reason),
              'One or more temp DinD cleanup tasks failed',
            );
          }
        }
      } catch (e) {
        this.logger.error(
          `[MCP:${this.namespace}] [disc:${discoveryId}] Error cleaning DinD sidecars for temp container`,
          e,
        );
      }
    }

    return this.toolsCache ?? [];
  }

  async start(): Promise<void> {
    // Backward-compat: delegate to provision()
    return this.provision();
  }

  /** Inject a container provider (graph edge). If server already started with a different container, no action taken. */
  setContainerProvider(provider: WorkspaceNode | undefined): void {
    this.containerProvider = provider;
  }

  /** Update runtime configuration (only env/workdir/command currently applied to next restart). */
  async setConfig(cfg: Record<string, unknown>): Promise<void> {
    const parsed = LocalMcpServerStaticConfigSchema.safeParse(cfg);
    if (!parsed.success) {
      this.logger.error(
        `LocalMCPServer: invalid config: ${JSON.stringify(parsed.error.issues)} @ ${JSON.stringify(cfg)}`,
      );
      throw new Error('Invalid MCP server config');
    }
    // Cast to McpServerConfig (schema is stricter than interface; compatible subset)
    this.cfg = parsed.data;
    // TODO: react to namespace changes (re-register tools) if needed
  }

  // Return legacy McpTool shape for interface compliance; callers needing function tools can access toolsCache directly.
  listTools(_force = false): LocalMCPServerTool[] {
    // Passive: Only return cached tools. `force` no longer changes discovery behavior post-refactor.
    const allTools: LocalMCPServerTool[] = this.toolsCache ? [...this.toolsCache] : [];
    if (!this._enabledTools) return allTools;
    const enabled = this._enabledTools;
    return allTools.filter((t) => enabled.has(t.name));
  }

  async callTool(
    name: string,
    args: unknown,
    options?: { timeoutMs?: number; threadId?: string },
  ): Promise<McpToolCallResult> {
    if (!this.cfg) throw new Error('LocalMCPServer: config not yet set via setConfig');
    if (!this.containerProvider) throw new Error('LocalMCPServer: no containerProvider set; cannot call tool');

    const threadId = options?.threadId;
    if (!threadId) throw new Error('LocalMCPServer: threadId option is required to call tool');
    this.logger.info(`[MCP:${this.namespace}] Calling tool ${name} for thread ${threadId}`);

    // Get thread-specific container
    const container = await this.containerProvider.provide(threadId);
    // Touch last-used when starting a tool call (defensive; provider already updates on provide)
    try {
      await this.containerService.touchLastUsed(container.id);
    } catch {}
    const containerId = container.id;

    const cfg = this.cfg;
    if (!cfg) throw new Error('LocalMCPServer: config not yet set via setConfig');
    const command = cfg.command ?? DEFAULT_MCP_COMMAND;
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
        this.logger,
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
      await client.connect(transport, { timeout: cfg.startupTimeoutMs ?? 15000 });
      // Heartbeat: keep last_used_at fresh during the session
      const hbInterval = Math.max(60_000, cfg.heartbeatIntervalMs ?? 300_000);
      hbTimer = setInterval(() => {
        this.containerService.touchLastUsed(containerId).catch(() => {});
      }, hbInterval);

      // Call the tool
      const result = await client.callTool({ name, arguments: args }, undefined, {
        timeout: options?.timeoutMs ?? cfg.requestTimeoutMs ?? 30000,
      });

      const rawResult: unknown = result as unknown;
      const rawContent = (
        rawResult && typeof rawResult === 'object' && 'content' in (rawResult as Record<string, unknown>)
          ? (rawResult as Record<string, unknown>).content
          : undefined
      ) as unknown;
      const contentArr = Array.isArray(rawContent) ? rawContent : [];
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
      return {
        isError: !!(
          rawResult &&
          typeof rawResult === 'object' &&
          'isError' in (rawResult as Record<string, unknown>) &&
          (rawResult as Record<string, unknown>).isError
        ),
        content: flattened,
        structuredContent: (rawResult &&
        typeof rawResult === 'object' &&
        'structuredContent' in (rawResult as Record<string, unknown>)
          ? (rawResult as Record<string, unknown>).structuredContent
          : undefined) as unknown,
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
          this.logger.error(`[MCP:${this.namespace}] Error closing client after tool call`, e);
        }
      }
      if (transport) {
        try {
          await transport.close();
        } catch (e) {
          this.logger.error(`[MCP:${this.namespace}] Error closing transport after tool call`, e);
        }
      }
      if (hbTimer) clearInterval(hbTimer);
    }
  }

  async stop(): Promise<void> {
    // Backward-compat: delegate to deprovision()
    return this.deprovision();
  }

  /**
   * Full teardown invoked by graph runtime when node removed. Ensures no further retries
   * or background timers are left running and clears intent flags so the server will not
   * auto-start again due to late dependency resolution events.
   */
  async destroy(): Promise<void> {
    this.wantStart = false; // cancel intent so maybeStart() does nothing further
    await this.stop();
    this.toolsCache = null;
    this.toolsDiscovered = false;
    this.restartAttempts = 0;
    this.pendingStart = undefined;
  }

  // Unified event subscription supporting core and MCP-specific events
  on(event: 'ready' | 'exit' | 'error' | 'restarted' | 'mcp.tools_updated', handler: (...a: unknown[]) => void): this {
    this.emitter.on(event, handler);
    return this;
  }

  // -------- Provisionable implementation --------
  getProvisionStatus(): ProvisionStatus {
    return this._provStatus;
  }

  onProvisionStatusChange(listener: (s: ProvisionStatus) => void): () => void {
    this._provListeners.push(listener);
    return () => {
      this._provListeners = this._provListeners.filter((l) => l !== listener);
    };
  }

  private setProvisionStatus(s: ProvisionStatus) {
    this._provStatus = s;
    for (const l of this._provListeners) {
      try {
        l(s);
      } catch {}
    }
  }

  async provision(): Promise<void> {
    if (this._provStatus.state === 'ready') return;
    if (this._provInFlight) return this._provInFlight;
    // mirror previous start() behavior but emit provision states
    const startCallId = ++this._startInvocationSeq;
    this.logger.debug(
      `[MCP:${this.namespace}] [start:${startCallId}] provision() invoked (started=${this.started} wantStart=${this.wantStart})`,
    );
    this.wantStart = true;
    if (this.started) {
      this.setProvisionStatus({ state: 'ready' });
      return;
    }
    if (!this.pendingStart) {
      this.pendingStart = new Promise<void>((resolve, reject) => {
        this.startWaiters.push({ resolve, reject });
      });
      this.logger.debug(`[MCP:${this.namespace}] [start:${startCallId}] Created pendingStart promise`);
    }
    const hasAllDeps = !!(this.cfg && this.containerProvider && this.cfg.command);
    this.setProvisionStatus({ state: 'provisioning' });
    this.maybeStart();
    this._provInFlight = (async () => {
      try {
        if (hasAllDeps) await this.pendingStart;
        else await this.pendingStart?.catch(() => {});
        if (this.started) this.setProvisionStatus({ state: 'ready' });
      } catch (err) {
        this.setProvisionStatus({ state: 'error', details: err });
      } finally {
        this._provInFlight = null;
      }
    })();
    return this._provInFlight;
  }

  async deprovision(): Promise<void> {
    if (this._provStatus.state === 'not_ready') return;
    this.setProvisionStatus({ state: 'deprovisioning' });
    // Stop timers and clear state
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.startRetryTimer) clearTimeout(this.startRetryTimer);
    if (this.dependencyTimeoutTimer) clearTimeout(this.dependencyTimeoutTimer);
    this.started = false;
    this.wantStart = false;
    this.toolsCache = null;
    this.toolsDiscovered = false;
    this.restartAttempts = 0;
    this.pendingStart = undefined;
    this._enabledTools = undefined;
    this.setProvisionStatus({ state: 'not_ready' });
  }

  // -------- DynamicConfigurable implementation --------
  isDynamicConfigReady(): boolean {
    return this.toolsDiscovered;
  }

  getDynamicConfigSchema(): JSONSchema.BaseSchema | undefined {
    if (!this.toolsDiscovered || !this.toolsCache) return undefined;
    // Lazily build and cache zod schema
    if (!this._dynamicConfigZodSchema) this._dynamicConfigZodSchema = this.buildDynamicConfigZodSchema();
    return toJSONSchema(this._dynamicConfigZodSchema);
  }

  setDynamicConfig(cfg: Record<string, boolean>): void {
    if (!this.toolsDiscovered || !this.toolsCache) {
      // accept config but will only apply once discovered
    }
    // Ensure schema exists (for validation & defaults)
    if (this.toolsDiscovered && this.toolsCache && !this._dynamicConfigZodSchema) {
      this._dynamicConfigZodSchema = this.buildDynamicConfigZodSchema();
    }
    let normalized: Record<string, boolean> = cfg;
    if (this._dynamicConfigZodSchema) {
      try {
        // New flat shape: tool names are top-level boolean properties
        normalized = this._dynamicConfigZodSchema.parse(cfg) as Record<string, boolean>;
      } catch (e) {
        this.logger.error(`[MCP:${this.namespace}] Dynamic config validation failed`, e);
      }
    }
    const enabled = new Set<string>();
    for (const [name, on] of Object.entries(normalized || {})) {
      if (on) enabled.add(name);
    }
    this._enabledTools = enabled;

    // Emit change event if discovery done and enabled set actually changed
    if (this.toolsDiscovered && this.toolsCache) {
      const sig = this.enabledSignature();
      if (sig !== this._lastEnabledSig) {
        this._lastEnabledSig = sig;
        const enabledList = this.currentNormalizedDynamicConfig();
        const on = Object.entries(enabledList)
          .filter(([, v]) => v)
          .map(([k]) => k);
        const off = Object.entries(enabledList)
          .filter(([, v]) => !v)
          .map(([k]) => k);
        this.logger.info(
          `[MCP:${this.namespace}] Dynamic config changed: enabled=[${on.join(', ')}] disabled=[${off.join(', ')}]`,
        );
        this.emitDynamicConfigChanged();
      }
    }
  }

  // Build zod schema representing dynamic config: flat shape { toolName?: boolean } (default true)
  private buildDynamicConfigZodSchema(): z.ZodTypeAny {
    const shape: Record<string, z.ZodTypeAny> = {};
    for (const t of this.toolsCache || []) {
      shape[t.name] = z
        .boolean()
        .optional()
        .default(true)
        .describe(t.description || '');
    }
    return z.object(shape).strict();
  }

  // Provide subscription for dynamic config changes (interface optional method)
  onDynamicConfigChanged(listener: (cfg: Record<string, boolean>) => void): () => void {
    this._dynCfgListeners.push(listener);
    // If we already have discovery + an enabled signature, emit current immediately so listeners can sync
    if (this.toolsDiscovered && this.toolsCache) {
      const current = this.currentNormalizedDynamicConfig();
      try {
        listener(current);
      } catch {}
    }
    return () => {
      this._dynCfgListeners = this._dynCfgListeners.filter((l) => l !== listener);
    };
  }

  private emitDynamicConfigChanged() {
    const cfg = this.currentNormalizedDynamicConfig();
    for (const l of this._dynCfgListeners) {
      try {
        l(cfg);
      } catch (e) {
        this.logger.error(`[MCP:${this.namespace}] dynamic config listener error`, e);
      }
    }
    // Notify external listeners to reconcile current enabled tools
    this.notifyToolsUpdated(Date.now());
  }

  // Build an authoritative list of currently enabled tool instances
  private getEnabledToolsSnapshot(): LocalMCPServerTool[] {
    const all = this.toolsCache ? [...this.toolsCache] : [];
    if (!this._enabledTools) return all;
    const enabled = this._enabledTools;
    return all.filter((t) => enabled.has(t.name));
  }

  // Emit the unified tools update event with typed payload
  private notifyToolsUpdated(updatedAt: number): void {
    const tools = this.getEnabledToolsSnapshot();
    const ts = Number.isFinite(updatedAt) ? updatedAt : Date.now();
    try {
      this.emitter.emit('mcp.tools_updated', { tools, updatedAt: ts });
    } catch (e) {
      this.logger.error(`[MCP:${this.namespace}] Error emitting tools_updated`, e);
    }
  }

  private currentNormalizedDynamicConfig(): Record<string, boolean> {
    const out: Record<string, boolean> = {};
    for (const t of this.toolsCache || []) {
      out[t.name] = this._enabledTools ? this._enabledTools.has(t.name) : true;
    }
    return out;
  }

  private enabledSignature(): string {
    if (!this.toolsCache) return 'none';
    return (this.toolsCache || [])
      .map((t) => `${t.name}:${this._enabledTools ? (this._enabledTools.has(t.name) ? 1 : 0) : 1}`)
      .sort()
      .join('|');
  }

  // ----------------- Resilient start internals -----------------
  private flushStartWaiters(err?: unknown) {
    const waiters = this.startWaiters;
    this.startWaiters = [];
    for (const w of waiters) {
      if (err) w.reject(err);
      else w.resolve();
    }
    this.pendingStart = undefined;
    if (err) {
      // Only emit 'error' if there are registered listeners to avoid unhandled error events
      if (this.emitter.listenerCount('error') > 0) this.emitter.emit('error', err);
      else this.logger.error(`[MCP:${this.namespace}] Unhandled start error`, err);
    } else this.emitter.emit('ready');
  }

  private maybeStart() {
    const id = ++this._maybeStartSeq;
    this.logger.debug(
      `[MCP:${this.namespace}] [maybe:${id}] maybeStart() check wantStart=${this.wantStart} started=${this.started} retryTimer=${!!this.startRetryTimer}`,
    );
    if (!this.wantStart || this.started) return;
    // Avoid stacking multiple timers
    if (this.startRetryTimer) {
      this.logger.debug(`[MCP:${this.namespace}] [maybe:${id}] retry timer already scheduled; skipping`);
      return;
    }
    this.tryStartOnce();
  }

  private tryStartOnce() {
    const seq = ++this._tryStartSeq;
    this.logger.debug(`[MCP:${this.namespace}] [try:${seq}] tryStartOnce invoked (started=${this.started})`);
    if (this.started) {
      this.logger.debug(`[MCP:${this.namespace}] [try:${seq}] already started; aborting try.`);
      return;
    }
    const cfg = this.cfg;
    if (!cfg || !this.containerProvider || !cfg.command) {
      // Poll for dependencies until a timeout
      const depTimeoutMs = 30000;
      if (!this.dependencyTimeoutTimer) {
        this.dependencyTimeoutTimer = setTimeout(() => {
          if (!this.started) {
            this.logger.error(
              `[MCP:${this.namespace}] Dependency wait timeout (cfg=${!!this.cfg} provider=${!!this.containerProvider} command=${!!this.cfg?.command})`,
            );
            this.flushStartWaiters(new Error('MCP start dependency timeout'));
          }
        }, depTimeoutMs);
      }
      this.logger.debug(
        `[MCP:${this.namespace}] [try:${seq}] Waiting for dependencies (cfg=${!!cfg} provider=${!!this.containerProvider} command=${!!cfg?.command})`,
      );
      this.startRetryTimer = setTimeout(() => {
        this.startRetryTimer = undefined;
        this.logger.debug(`[MCP:${this.namespace}] [try:${seq}] dependency re-check timer fired`);
        this.tryStartOnce();
      }, 5000);
      return;
    }

    // Dependencies available; clear dependency timeout
    if (this.dependencyTimeoutTimer) {
      clearTimeout(this.dependencyTimeoutTimer);
      this.dependencyTimeoutTimer = undefined;
    }

    const restartCfg = cfg.restart || { maxAttempts: 5, backoffMs: 2000 };
    const attempt = this.restartAttempts + 1;
    this.logger.info(`[MCP:${this.namespace}] Start attempt ${attempt}/${restartCfg.maxAttempts} (trySeq=${seq})`);

    (async () => {
      try {
        // SINGLE DISCOVERY PATH: Only perform tool discovery here during the resilient start sequence.
        // listTools() no longer triggers discovery; SimpleAgent waits for 'ready'.
        // Guard configService access; default to 0 (never stale by time)
        const staleTimeout = (this.cfg?.staleTimeoutMs ?? this.configService?.mcpToolsStaleTimeoutMs ?? 0) as number;
        const isStale = (() => {
          if (!staleTimeout) return false;
          const last = this.lastToolsUpdatedAt || 0;
          return last <= 0 || Date.now() - last > staleTimeout;
        })();
        if (!this.toolsDiscovered || isStale) {
          const tDisc0 = Date.now();
          await this.discoverTools();
          const tDiscMs = Date.now() - tDisc0;
          this.logger.debug(`[MCP:${this.namespace}] Discovery phase duration ${tDiscMs}ms`);
        }
        this.started = true;
        this.logger.info(`[MCP:${this.namespace}] Started successfully with ${this.toolsCache?.length || 0} tools`);
        this.flushStartWaiters();
      } catch (e: unknown) {
        this.logger.error(`[MCP:${this.namespace}] Start attempt failed`, e);
        this.restartAttempts++;
        // Immediately reject any pending starters so callers of provision() can observe the error
        this.flushStartWaiters(e);
        if (this.restartAttempts >= restartCfg.maxAttempts) {
          return;
        }
        const backoff = restartCfg.backoffMs * Math.pow(2, this.restartAttempts - 1);
        this.logger.info(
          `[MCP:${this.namespace}] Scheduling retry in ${backoff}ms (attempt=${this.restartAttempts + 1})`,
        );
        this.startRetryTimer = setTimeout(() => {
          this.startRetryTimer = undefined;
          this.logger.debug(`[MCP:${this.namespace}] Retry timer fired (next attempt=${this.restartAttempts + 1})`);
          this.tryStartOnce();
          this.emitter.emit('restarted', this.restartAttempts);
        }, backoff);
      }
    })();
  }
}
