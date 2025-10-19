// Observability SDK initialization (replaces traceloop)
import { init as initObs, withSystem } from '@agyn/tracing';

initObs({
  mode: 'extended',
  endpoints: { extended: process.env.OBS_ENDPOINT_EXTENDED || 'http://localhost:4319' },
  defaultAttributes: { service: 'server' },
});

import Fastify from 'fastify';
import cors from '@fastify/cors';
import { Server } from 'socket.io';
import { ConfigService } from './services/config.service.js';
import { LoggerService } from './services/logger.service.js';
import { MongoService } from './services/mongo.service.js';
import { CheckpointerService } from './services/checkpointer.service.js';
import { SocketService } from './services/socket.service.js';
import { buildTemplateRegistry } from './templates';
import { LiveGraphRuntime } from './graph/liveGraph.manager.js';
import { GraphService } from './services/graph.service.js';
import { GitGraphService } from './services/gitGraph.service.js';
import { GraphDefinition, GraphError, PersistedGraphUpsertRequest } from './graph/types.js';
import { GraphErrorCode } from './graph/errors.js';
import { ContainerService } from './services/container.service.js';
import { ReadinessWatcher } from './utils/readinessWatcher.js';
import { VaultService, VaultConfigSchema } from './services/vault.service.js';
import { ContainerRegistryService } from './services/containerRegistry.service.js';
import { ContainerCleanupService } from './services/containerCleanup.service.js';
import { registerRemindersRoute } from './routes/reminders.route.js';
import { AgentRunService } from './services/run.service.js';
import { registerRunsRoutes } from './routes/runs.route.js';
import { registerNixRoutes } from './routes/nix.route.js';
import { NcpsKeyService } from './services/ncpsKey.service.js';

const logger = new LoggerService();
const config = ConfigService.fromEnv();
const mongo = new MongoService(config, logger);
const checkpointer = new CheckpointerService(logger);
const containerService = new ContainerService(logger);
const vaultService = new VaultService(
  VaultConfigSchema.parse({
    enabled: config.vaultEnabled,
    addr: config.vaultAddr,
    token: config.vaultToken,
    defaultMounts: ['secret'],
  }),
  logger,
);
const ncpsKeyService = new NcpsKeyService(config, logger);

async function bootstrap() {
  // Initialize Ncps key service early
  try {
    await ncpsKeyService.init();
  } catch (e) {
    logger.error('NcpsKeyService init failed: %s', (e as Error)?.message || String(e));
    process.exit(1);
  }
  await mongo.connect();
  checkpointer.attachMongoClient(mongo.getClient());
  checkpointer.bindDb(mongo.getDb());
  // Initialize checkpointer (optional Postgres mode)
  try {
    await checkpointer.initIfNeeded();
  } catch (e) {
    logger.error('Checkpointer init failed: %s', (e as Error)?.message || String(e));
    process.exit(1);
  }

  // Initialize container registry and cleanup services
  const registry = new ContainerRegistryService(mongo.getDb(), logger);
  await registry.ensureIndexes();
  containerService.setRegistry(registry);
  await registry.backfillFromDocker(containerService);
  const cleanup = new ContainerCleanupService(registry, containerService, logger);
  cleanup.start();

  const templateRegistry = buildTemplateRegistry({
    logger,
    containerService: containerService,
    configService: config,
    checkpointerService: checkpointer,
    mongoService: mongo,
    ncpsKeyService,
  });

  const runtime = new LiveGraphRuntime(logger, templateRegistry);
  const runsService = new AgentRunService(mongo.getDb(), logger);
  await runsService.ensureIndexes();
  const graphService =
    config.graphStore === 'git'
      ? new GitGraphService(
          {
            repoPath: config.graphRepoPath,
            branch: config.graphBranch,
            defaultAuthor: { name: config.graphAuthorName, email: config.graphAuthorEmail },
          },
          logger,
          templateRegistry,
        )
      : new GraphService(mongo.getDb(), logger, templateRegistry);

  // Provide deps to factories/runtime for state persistence and config access
  runtime.setFactoryDeps?.({
    configService: config,
    graphStateService: {
      // Centralized per-node state upsert helper
      upsertNodeState: async (nodeId: string, state: Record<string, unknown>) => {
        try {
          if ('upsertNodeState' in graphService && typeof (graphService as any).upsertNodeState === 'function') {
            await (graphService as any).upsertNodeState('main', nodeId, state);
          } else {
            // Fallback if not implemented
            const current = await graphService.get('main');
            const base = current ?? {
              name: 'main',
              version: 0,
              updatedAt: new Date().toISOString(),
              nodes: [],
              edges: [],
            };
            const nodes = Array.from(base.nodes || []);
            const idx = nodes.findIndex((n) => n.id === nodeId);
            if (idx >= 0) nodes[idx] = { ...nodes[idx], state } as any;
            else nodes.push({ id: nodeId, template: 'unknown', state } as any);
            await (graphService instanceof GitGraphService
              ? graphService.upsert({ name: 'main', version: base.version, nodes, edges: base.edges })
              : (graphService as GraphService).upsert({
                  name: 'main',
                  version: base.version,
                  nodes,
                  edges: base.edges,
                }));
          }
          // Also update live runtime snapshot
          const last = (runtime as any)?.state?.lastGraph as GraphDefinition | undefined;
          if (last) {
            const ln = last.nodes.find((n) => n.id === nodeId);
            if (ln) ln.data.state = state as any;
          }
        } catch (e) {
          logger.error('Failed to upsert node state for %s: %s', nodeId, (e as any)?.message || e);
        }
      },
    },
  });

  if (graphService instanceof GitGraphService) {
    try {
      await graphService.initIfNeeded();
    } catch (e: any) {
      logger.error('Failed to initialize git graph repo: %s', e?.message || e);
      process.exit(1);
    }
  }

  // Helper to convert persisted graph to runtime GraphDefinition
  const toRuntimeGraph = (saved: { nodes: any[]; edges: any[] }) =>
    ({
      nodes: saved.nodes.map((n) => ({
        id: n.id,
        data: { template: n.template, config: n.config, dynamicConfig: n.dynamicConfig, state: n.state },
      })),
      edges: saved.edges.map((e) => ({
        source: e.source,
        sourceHandle: e.sourceHandle,
        target: e.target,
        targetHandle: e.targetHandle,
      })),
    }) as GraphDefinition;

  // Expose selected runtime services globally for diagnostics and agent wiring
  // Important: set globals BEFORE applying any persisted graph so that
  // agent nodes created during runtime.apply() can see __agentRunsService
  // in their constructors/init() and wire persistence correctly.
  globalThis.liveGraphRuntime = runtime;
  globalThis.__agentRunsService = runsService;

  // Load and apply existing persisted graph BEFORE starting server
  try {
    const existing = await graphService.get('main');
    if (existing) {
      logger.info(
        'Applying persisted graph to live runtime (version=%s, nodes=%d, edges=%d)',
        existing.version,
        existing.nodes.length,
        existing.edges.length,
      );
      await runtime.apply(toRuntimeGraph(existing));
    } else {
      logger.info('No persisted graph found; starting with empty runtime graph.');
    }
  } catch (e) {
    if (e instanceof GraphError) {
      logger.error('Failed to apply initial persisted graph: %s. Cause: %s', e.message, e.cause);
    }
    logger.error('Failed to apply initial persisted graph: %s', String(e));
  }

  // Globals already set above
  const fastify = Fastify({ logger: false });
  await fastify.register(cors, { origin: true });

  // Background watcher reference (initialized after socket is attached)
  let readinessWatcher: ReadinessWatcher | null = null;

  // Existing endpoints (namespaced under /api)
  fastify.get('/api/templates', async () => templateRegistry.toSchema());

  // Vault autocomplete endpoints (only when enabled)
  if (vaultService.isEnabled()) {
    fastify.get('/api/vault/mounts', async () => ({ items: await vaultService.listKvV2Mounts() }));
    fastify.get('/api/vault/kv/:mount/paths', async (req) => {
      const { mount } = req.params as { mount: string };
      const { prefix } = (req.query || {}) as { prefix?: string };
      const items = await vaultService.listPaths(mount, prefix || '');
      return { items };
    });
    fastify.get('/api/vault/kv/:mount/keys', async (req) => {
      const { mount } = req.params as { mount: string };
      const { path } = (req.query || {}) as { path?: string };
      const items = await vaultService.listKeys(mount, path || '');
      return { items };
    });
    fastify.post('/api/vault/kv/:mount/write', async (req, reply) => {
      const { mount } = req.params as { mount: string };
      const body = req.body as unknown;
      if (!isValidWriteBody(body)) {
        reply.code(400);
        return { error: 'invalid_body' };
      }
      try {
        const { version } = await vaultService.setSecret({ mount, path: body.path, key: body.key }, body.value);
        reply.code(201);
        return { mount, path: body.path, key: body.key, version };
      } catch (e: unknown) {
        const sc = statusCodeFrom(e);
        reply.code(typeof sc === 'number' && Number.isFinite(sc) ? sc : 500);
        return { error: 'vault_write_failed' };
      }
    });
  }

  fastify.get('/api/graph', async () => {
    const name = 'main';
    const graph = await graphService.get(name);
    if (!graph) {
      return { name, version: 0, updatedAt: new Date().toISOString(), nodes: [], edges: [] };
    }
    return graph;
  });

  fastify.post('/api/graph', async (request, reply) => {
    try {
      const parsed = request.body as PersistedGraphUpsertRequest;
      parsed.name = parsed.name || 'main';
      // Resolve author from headers
      const headers = request.headers as Record<string, string | string[] | undefined>;
      const author = {
        name: (headers['x-graph-author-name'] || headers['x-author-name']) as string | undefined,
        email: (headers['x-graph-author-email'] || headers['x-author-email']) as string | undefined,
      };
      // Capture previous graph (for change detection / events)
      const before = await graphService.get(parsed.name);
      // Guard against unsafe MCP command mutation
      try {
        const { enforceMcpCommandMutationGuard } = await import('./services/graph.guard');
        enforceMcpCommandMutationGuard(before, parsed, runtime);
      } catch (e) {
        const err = e as any;
        if (err?.code === GraphErrorCode.McpCommandMutationForbidden) {
          reply.code(409);
          return { error: GraphErrorCode.McpCommandMutationForbidden };
        }
      }

      // Support both GraphService and GitGraphService signatures
      const saved =
        graphService instanceof GitGraphService
          ? await graphService.upsert(parsed, author)
          : await (graphService as GraphService).upsert(parsed);
      try {
        await runtime.apply(toRuntimeGraph(saved));
      } catch {
        logger.debug('Failed to apply updated graph to runtime; rolling back persistence');
      }
      // Emit node_config events for any node whose static or dynamic config changed
      if (before) {
        const beforeStatic = new Map(before.nodes.map((n) => [n.id, JSON.stringify(n.config || {})]));
        const beforeDynamic = new Map(before.nodes.map((n) => [n.id, JSON.stringify(n.dynamicConfig || {})]));
        for (const n of saved.nodes) {
          const prevS = beforeStatic.get(n.id);
          const prevD = beforeDynamic.get(n.id);
          const currS = JSON.stringify(n.config || {});
          const currD = JSON.stringify(n.dynamicConfig || {});
          if (prevS !== currS || prevD !== currD) {
            io.emit('node_config', {
              nodeId: n.id,
              config: n.config,
              dynamicConfig: n.dynamicConfig,
              version: saved.version,
            });
          }
        }
      }
      return saved;
    } catch (e: any) {
      if (e.code === 'VERSION_CONFLICT') {
        reply.code(409);
        return { error: 'VERSION_CONFLICT', current: e.current };
      }
      if (e.code === 'LOCK_TIMEOUT') {
        reply.code(409);
        return { error: 'LOCK_TIMEOUT' };
      }
      if (e.code === 'COMMIT_FAILED') {
        reply.code(500);
        return { error: 'COMMIT_FAILED' };
      }
      reply.code(400);
      return { error: e.message || 'Bad Request' };
    }
  });

  // Bridge runtime endpoints for UI (/graph/*)
  fastify.get('/graph/templates', async () => templateRegistry.toSchema());

  fastify.get('/graph/nodes/:nodeId/status', async (req) => {
    const { nodeId } = req.params as { nodeId: string };
    return runtime.getNodeStatus(nodeId);
  });

  fastify.post('/graph/nodes/:nodeId/actions', async (req, reply) => {
    const { nodeId } = req.params as { nodeId: string };
    const body = req.body as { action?: string };
    try {
      switch (body.action) {
        case 'pause':
          await runtime.pauseNode(nodeId);
          break;
        case 'resume':
          await runtime.resumeNode(nodeId);
          break;
        case 'provision':
          await runtime.provisionNode(nodeId);
          // Start background readiness watcher after provision
          readinessWatcher?.start(nodeId);
          break;
        case 'deprovision':
          await runtime.deprovisionNode(nodeId);
          // Stop any watcher if node is deprovisioned
          readinessWatcher?.stop(nodeId);
          break;
        default:
          reply.code(400);
          return { error: 'unknown_action' };
      }
      emitStatus(nodeId);
      reply.code(204);
      return null;
    } catch (e: any) {
      // eslint-disable-line @typescript-eslint/no-explicit-any
      reply.code(500);
      return { error: e.message || 'action_failed' };
    }
  });
  // Removed per-node config & dynamic-config endpoints; config updates now flow through full /api/graph saves.
  // New: dynamic config schema endpoint (read-only). Saving still uses full /api/graph mechanism.
  fastify.get('/graph/nodes/:nodeId/dynamic-config/schema', async (req, reply) => {
    const { nodeId } = req.params as { nodeId: string };
    try {
      const inst = (runtime as any).getNodeInstance?.(nodeId) || (runtime as any)['getNodeInstance']?.(nodeId);
      if (!inst) {
        reply.code(404);
        return { error: 'node_not_found' };
      }
      const ready =
        typeof (inst as any).isDynamicConfigReady === 'function' ? !!(inst as any).isDynamicConfigReady() : false;
      const schema =
        ready && typeof (inst as any).getDynamicConfigSchema === 'function'
          ? (inst as any).getDynamicConfigSchema()
          : undefined;
      return { ready, schema };
    } catch (e: any) {
      // eslint-disable-line @typescript-eslint/no-explicit-any
      reply.code(500);
      return { error: e.message || 'dynamic_config_schema_error' };
    }
  });

  // Register routes that need runtime
  registerRemindersRoute(fastify, runtime, logger);
  registerRunsRoutes(fastify, runtime, runsService, logger);
  // Nix proxy routes
  try {
    registerNixRoutes(fastify, {
      timeoutMs: config.nixHttpTimeoutMs,
      cacheTtlMs: config.nixCacheTtlMs,
      cacheMax: config.nixCacheMax,
    });
  } catch (e) {
    const err = e as Error;
    logger.error('Failed to register Nix routes: %s', err?.message || String(e));
  }

  // Start Fastify then attach Socket.io
  const PORT = Number(process.env.PORT) || 3010;
  await fastify.listen({ port: PORT, host: '0.0.0.0' });
  logger.info(`HTTP server listening on :${PORT}`);

  const io = new Server(fastify.server, { cors: { origin: '*' } });
  const socketService = new SocketService(io, logger, checkpointer);
  socketService.register();

  function emitStatus(nodeId: string) {
    const status = runtime.getNodeStatus(nodeId);
    io.emit('node_status', { nodeId, ...status, updatedAt: new Date().toISOString() });
  }

  // Watcher that emits a follow-up node_status once node becomes ready after provision/start.
  readinessWatcher = new ReadinessWatcher(runtime, emitStatus, logger);

  // Routes registered above

  const shutdown = async () => {
    logger.info('Shutting down...');
    readinessWatcher?.stopAll();
    await mongo.close();
    try {
      await fastify.close();
    } catch {}
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

bootstrap().catch((e) => {
  logger.error('Bootstrap failure', e);
  process.exit(1);
});

function isValidWriteBody(body: unknown): body is { path: string; key: string; value: string } {
  if (!body || typeof body !== 'object') return false;
  const o = body as Record<string, unknown>;
  return (
    typeof o.path === 'string' &&
    o.path.length > 0 &&
    typeof o.key === 'string' &&
    o.key.length > 0 &&
    typeof o.value === 'string'
  );
}

function statusCodeFrom(e: unknown): number | undefined {
  if (e && typeof e === 'object') {
    const v = (e as { statusCode?: unknown }).statusCode;
    if (typeof v === 'number') return v;
    if (typeof v === 'string') {
      const n = Number(v);
      if (Number.isFinite(n)) return n;
    }
  }
  return undefined;
}
