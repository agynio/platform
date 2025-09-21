import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { EventEmitter } from 'events';
import { McpServer, McpServerConfig, McpTool, McpToolCallResult, DEFAULT_MCP_COMMAND, McpError } from './types.js';
import { DockerExecTransport } from './dockerExecTransport.js';
import { ContainerService } from '../services/container.service.js';
import { ContainerProviderEntity } from '../entities/containerProvider.entity.js';
import { LoggerService } from '../services/logger.service.js';

export class LocalMCPServer implements McpServer {
  readonly namespace: string = 'mcp'; // default; overridden by first setConfig
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

    this.logger.info(`[MCP:${this.namespace}] Starting tool discovery`);

    // Use temporary container for tool discovery
    const tempContainer = await this.containerProvider.provide('_discovery_temp');
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

      await tempTransport.start();

      tempClient = new Client({ name: 'local-agent-discovery', version: '0.1.0' });
      this.logger.info(`[MCP:${this.namespace}] Connecting for tool discovery`);
      await tempClient.connect(tempTransport, { timeout: cfg.startupTimeoutMs ?? 15000 });
      this.logger.info(`[MCP:${this.namespace}] Tool discovery handshake complete`);

      // Fetch tools
      const result = await tempClient.listTools({}, { timeout: cfg.requestTimeoutMs ?? 15000 });
      this.toolsCache = result.tools.map((t: any) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
        outputSchema: t.outputSchema,
      }));

      this.logger.info(`[MCP:${this.namespace}] Discovered ${this.toolsCache.length} tools`);
      this.toolsDiscovered = true;
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
        this.logger.info(`[MCP:${this.namespace}] Temporary discovery container stopped and removed`);
      } catch (e) {
        this.logger.error(`[MCP:${this.namespace}] Error cleaning up temp container: ${e}`);
      }
    }

    return this.toolsCache ?? [];
  }

  async start(): Promise<void> {
    // Idempotent: mark intent and attempt start. If dependencies missing, return immediately (non-blocking).
    this.wantStart = true;
    if (this.started) return;
    if (!this.pendingStart) {
      this.pendingStart = new Promise<void>((resolve, reject) => {
        this.startWaiters.push({ resolve, reject });
      });
    }
    const hasAllDeps = !!(this.cfg && this.containerProvider && this.cfg.command);
    this.maybeStart();
    // Only await if we already have dependencies; otherwise allow caller to proceed.
    if (hasAllDeps) return this.pendingStart;
    return; // non-blocking early return while dependency polling happens in background
  }

  /** Inject a container provider (graph edge). If server already started with a different container, no action taken. */
  setContainerProvider(provider: ContainerProviderEntity | undefined): void {
    this.containerProvider = provider;
    if (this.wantStart) this.maybeStart();
  }

  /** Update runtime configuration (only env/workdir/command currently applied to next restart). */
  async setConfig(partial: Partial<McpServerConfig>): Promise<void> {
    // Allow setting namespace only if not yet explicitly overridden by prior config.
    if (partial.namespace && (!this.cfg?.namespace || this.cfg?.namespace === 'mcp')) {
      (this as any).namespace = partial.namespace; // bypass readonly
    }
    const { containerId: _ignored, ...rest } = partial as any; // ignore containerId if provided
    // Merge with existing config so unspecified fields persist instead of being lost.
    this.cfg = { ...this.cfg, ...rest } as McpServerConfig;
    if (this.wantStart) this.maybeStart();
  }

  private startHeartbeat() {
    const cfg = this.cfg!;
    if (!cfg.heartbeatIntervalMs) return;
    this.heartbeatTimer = setInterval(async () => {
      if (!this.client) return;
      try {
        await this.client.ping({ timeout: 5000 });
      } catch (e: any) {
        this.logger.error(`[MCP:${this.namespace}] Heartbeat failed: ${e.message}`);
      }
    }, cfg.heartbeatIntervalMs);
  }

  async listTools(force = false): Promise<McpTool[]> {
    if (this.toolsCache && !force) return this.toolsCache;

    // If tools haven't been discovered yet, trigger discovery
    if (!this.toolsDiscovered || force) {
      // If discovery wasn't yet requested via start, set intent and go through resilient path
      if (!this.wantStart) {
        this.wantStart = true;
        this.maybeStart();
      }
      // Wait for discovery (either direct or via resilient start mechanism)
      try {
        await this.start(); // will be fast/no-op if already in progress
      } catch (e) {
        // Fallback: attempt direct discovery (maintains previous behavior if caller forces)
        if (force) return await this.discoverTools();
        throw e;
      }
    }

    return this.toolsCache ?? [];
  }

  async callTool(
    name: string,
    args: any,
    options?: { timeoutMs?: number; threadId?: string },
  ): Promise<McpToolCallResult> {
    if (!this.cfg) throw new Error('LocalMCPServer: config not yet set via setConfig');
    if (!this.containerProvider) throw new Error('LocalMCPServer: no containerProvider set; cannot call tool');

    const threadId = options?.threadId || 'default';
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
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.startRetryTimer) clearTimeout(this.startRetryTimer);
    if (this.dependencyTimeoutTimer) clearTimeout(this.dependencyTimeoutTimer);
    // No persistent client/transport to clean up in the new lifecycle
    this.started = false;
    this.logger.info(`[MCP:${this.namespace}] Stopped`);
  }

  on(event: 'ready' | 'exit' | 'error' | 'restarted', handler: (...a: any[]) => void): this {
    this.emitter.on(event, handler);
    return this;
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
    if (err) this.emitter.emit('error', err);
    else this.emitter.emit('ready');
  }

  private maybeStart() {
    if (!this.wantStart || this.started) return;
    // Avoid stacking multiple timers
    if (this.startRetryTimer) return;
    this.tryStartOnce();
  }

  private tryStartOnce() {
    if (this.started) return;
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
        `[MCP:${this.namespace}] Waiting for dependencies (cfg=${!!cfg} provider=${!!this.containerProvider} command=${!!cfg?.command})`,
      );
      this.startRetryTimer = setTimeout(() => {
        this.startRetryTimer = undefined;
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
    this.logger.info(`[MCP:${this.namespace}] Start attempt ${attempt}/${restartCfg.maxAttempts}`);

    (async () => {
      try {
        if (!this.toolsDiscovered) {
          await this.discoverTools();
        }
        this.started = true;
        this.logger.info(`[MCP:${this.namespace}] Started successfully with ${this.toolsCache?.length || 0} tools`);
        this.flushStartWaiters();
      } catch (e: any) {
        this.logger.error(`[MCP:${this.namespace}] Start attempt failed: ${e.message}`);
        this.restartAttempts++;
        if (this.restartAttempts >= restartCfg.maxAttempts) {
          this.flushStartWaiters(e);
          return;
        }
        const backoff = restartCfg.backoffMs * Math.pow(2, this.restartAttempts - 1);
        this.logger.info(`[MCP:${this.namespace}] Retrying in ${backoff}ms`);
        this.startRetryTimer = setTimeout(() => {
          this.startRetryTimer = undefined;
          this.tryStartOnce();
          this.emitter.emit('restarted', this.restartAttempts);
        }, backoff);
      }
    })();
  }
}
