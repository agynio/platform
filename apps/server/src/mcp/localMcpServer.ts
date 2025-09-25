import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { EventEmitter } from 'events';
import { McpServer, McpServerConfig, McpTool, McpToolCallResult, DEFAULT_MCP_COMMAND, McpError } from './types.js';
import { DockerExecTransport } from './dockerExecTransport.js';
import { ContainerService } from '../services/container.service.js';
import { ContainerProviderEntity } from '../entities/containerProvider.entity.js';
import { LoggerService } from '../services/logger.service.js';
import { v4 as uuidv4 } from 'uuid';
import type { ProvisionStatus, Provisionable, DynamicConfigurable } from '../graph/capabilities.js';
import type { JSONSchema7 as JSONSchema } from 'json-schema';

export class LocalMCPServer implements McpServer, Provisionable, DynamicConfigurable<Record<string, boolean>> {
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
  private toolsCache: McpTool[] | null = null;
  private heartbeatTimer?: NodeJS.Timeout;
  private restartAttempts = 0;
  private transport?: DockerExecTransport;
  private containerProvider?: ContainerProviderEntity;
  private pendingStart?: Promise<void>; // ensure single in-flight start
  private containerId?: string;
  private cfg?: McpServerConfig;
  private toolsDiscovered = false; // tracks if we've done initial tool discovery
  // Resilient start state
  private wantStart = false; // intent flag indicating someone requested start
  private startWaiters: { resolve: () => void; reject: (e: any) => void }[] = [];
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

  constructor(
    private containerService: ContainerService,
    private logger: LoggerService,
  ) {}

  /**
   * Discover tools by starting temporary MCP server, fetching tools, then stopping the container.
   * This is called during agent registration to discover available tools.
   */
  async discoverTools(): Promise<McpTool[]> {
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

    const cfg = this.cfg!;
    const command = cfg.command ?? DEFAULT_MCP_COMMAND;
    const docker = this.containerService.getDocker();

    let tempTransport: DockerExecTransport | undefined;
    let tempClient: Client | undefined;

    try {
      // Create temporary transport and client for discovery
      tempTransport = new DockerExecTransport(
        docker,
        async () => {
          this.logger.debug(`[MCP:${this.namespace}] [disc:${discoveryId}] launching docker exec`);
          const exec = await docker.getContainer(tempContainerId).exec({
            Cmd: ['sh', '-lc', command],
            AttachStdout: true,
            AttachStderr: true,
            AttachStdin: true,
            Tty: false,
            WorkingDir: cfg.workdir,
          });
          const stream: any = await new Promise((resolve, reject) => {
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
      this.toolsCache = result.tools.map((t: any) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
        outputSchema: t.outputSchema,
      }));

      this.logger.info(`[MCP:${this.namespace}] [disc:${discoveryId}] Discovered ${this.toolsCache.length} tools`);
      this.toolsDiscovered = true;
      // Initialize dynamic enabled set to all tools by default
      this._enabledTools = undefined; // undefined means "all enabled"
    } catch (err) {
      this.logger.error(`[MCP:${this.namespace}] [disc:${discoveryId}] Tool discovery failed: ${err}`);
    } finally {
      // Clean up temporary resources
      if (tempClient) {
        try {
          await tempClient.close();
        } catch (e) {
          this.logger.error(`[MCP:${this.namespace}] Error closing temp client: ${e}`);
        }
      }
      if (tempTransport) {
        try {
          await tempTransport.close();
        } catch (e) {
          this.logger.error(`[MCP:${this.namespace}] Error closing temp transport: ${e}`);
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
        this.logger.error(`[MCP:${this.namespace}] [disc:${discoveryId}] Error cleaning up temp container: ${e}`);
      }
    }

    return this.toolsCache ?? [];
  }

  async start(): Promise<void> {
    // Backward-compat: delegate to provision()
    return this.provision();
  }

  /** Inject a container provider (graph edge). If server already started with a different container, no action taken. */
  setContainerProvider(provider: ContainerProviderEntity | undefined): void {
    this.containerProvider = provider;
  }

  /** Update runtime configuration (only env/workdir/command currently applied to next restart). */
  async setConfig(cfg: McpServerConfig): Promise<void> {
    this.cfg = cfg;

    // TODO: check if namespace was updated and reprovision all tools
  }

  async listTools(force = false): Promise<McpTool[]> {
    // Passive: Only return cached tools unless force is requested and discovery already happened.
    // We purposely avoid triggering a start/discovery from listTools to prevent dual discovery paths.
    const all = (force && this.toolsDiscovered) ? (this.toolsCache ?? []) : (this.toolsCache || []);
    if (!this._enabledTools) return all;
    return all.filter(t => this._enabledTools!.has(t.name));
  }

  async callTool(
    name: string,
    args: any,
    options?: { timeoutMs?: number; threadId?: string },
  ): Promise<McpToolCallResult> {
    if (!this.cfg) throw new Error('LocalMCPServer: config not yet set via setConfig');
    if (!this.containerProvider) throw new Error('LocalMCPServer: no containerProvider set; cannot call tool');

    const threadId = options?.threadId;
    if (!threadId) throw new Error('LocalMCPServer: threadId option is required to call tool');
    this.logger.info(`[MCP:${this.namespace}] Calling tool ${name} for thread ${threadId}`);

    // Get thread-specific container
    const container = await this.containerProvider.provide(threadId);
    const containerId = container.id;

    const cfg = this.cfg!;
    const command = cfg.command ?? DEFAULT_MCP_COMMAND;
    const docker = this.containerService.getDocker();

    let transport: DockerExecTransport | undefined;
    let client: Client | undefined;

    try {
      // Create transport and client for this tool call
      transport = new DockerExecTransport(
        docker,
        async () => {
          const exec = await docker.getContainer(containerId).exec({
            Cmd: ['sh', '-lc', command],
            AttachStdout: true,
            AttachStderr: true,
            AttachStdin: true,
            Tty: false,
            WorkingDir: cfg.workdir,
          });
          const stream: any = await new Promise((resolve, reject) => {
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

      // Call the tool
      const result = await client.callTool({ name, arguments: args }, undefined, {
        timeout: options?.timeoutMs ?? cfg.requestTimeoutMs ?? 30000,
      });

      const rawContent = (result as any).content;
      const contentArr = Array.isArray(rawContent) ? rawContent : [];
      const flattened = contentArr
        .map((c: any) => {
          if (typeof c === 'string') return c;
          if (c && typeof c === 'object') {
            if ('text' in c && typeof c.text === 'string') return c.text;
            if ('data' in c) return JSON.stringify(c.data);
          }
          return JSON.stringify(c);
        })
        .join('\n');
      return {
        isError: (result as any).isError,
        content: flattened,
        structuredContent: (result as any).structuredContent,
        raw: result,
      };
    } catch (e: any) {
      throw new McpError(`Tool '${name}' failed: ${e.message}`, e.code || 'TOOL_CALL_ERROR');
    } finally {
      // Clean up after tool call
      if (client) {
        try {
          await client.close();
        } catch (e) {
          this.logger.error(`[MCP:${this.namespace}] Error closing client after tool call: ${e}`);
        }
      }
      if (transport) {
        try {
          await transport.close();
        } catch (e) {
          this.logger.error(`[MCP:${this.namespace}] Error closing transport after tool call: ${e}`);
        }
      }
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

  on(event: 'ready' | 'exit' | 'error' | 'restarted', handler: (...a: any[]) => void): this {
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
      try { l(s); } catch {}
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

  getDynamicConfigSchema(): JSONSchema | undefined {
    if (!this.toolsDiscovered || !this.toolsCache) return undefined;
    const properties: Record<string, any> = {};
    for (const t of this.toolsCache) properties[t.name] = { type: 'boolean', default: true };
    return { type: 'object', properties } as JSONSchema;
  }

  setDynamicConfig(cfg: Record<string, boolean>): void {
    if (!this.toolsDiscovered || !this.toolsCache) {
      // accept config but will only apply once discovered
    }
    const enabled = new Set<string>();
    for (const [name, on] of Object.entries(cfg || {})) {
      if (on) enabled.add(name);
    }
    this._enabledTools = enabled;
  }

  // ----------------- Resilient start internals -----------------
  private flushStartWaiters(err?: any) {
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
      else this.logger.error(`[MCP:${this.namespace}] Unhandled start error: ${err?.message || err}`);
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
        if (!this.toolsDiscovered) {
          const tDisc0 = Date.now();
          await this.discoverTools();
          const tDiscMs = Date.now() - tDisc0;
          this.logger.debug(`[MCP:${this.namespace}] Discovery phase duration ${tDiscMs}ms`);
        }
        this.started = true;
        this.logger.info(`[MCP:${this.namespace}] Started successfully with ${this.toolsCache?.length || 0} tools`);
        this.flushStartWaiters();
      } catch (e: any) {
        this.logger.error(`[MCP:${this.namespace}] Start attempt failed: ${e.message}`);
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
