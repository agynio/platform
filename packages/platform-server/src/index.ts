// Observability SDK initialization (replaces traceloop)
import { init as initObs } from '@agyn/tracing';

initObs({
  mode: 'extended',
  endpoints: { extended: process.env.TRACING_SERVER_URL || 'http://localhost:4319' },
  defaultAttributes: { service: 'server' },
});

import { NestFactory } from '@nestjs/core';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { ValidationPipe } from '@nestjs/common';
import cors from '@fastify/cors';
import { Server } from 'socket.io';
import { ConfigService } from './core/services/config.service';
import { LoggerService } from './core/services/logger.service';
import { MongoService } from './core/services/mongo.service';
// TemplateRegistry is provided via GraphModule factory provider
import { TemplateRegistry } from './graph/templateRegistry';
import { LiveGraphRuntime } from './graph/liveGraph.manager';
import { GraphRepository } from './graph/graph.repository';
// import { GitGraphService } from './graph/gitGraph.repository';
import { GraphDefinition, GraphError, PersistedGraphUpsertRequest } from './graph/types';
import { GraphErrorCode } from './graph/errors';
import { ContainerService } from './infra/container/container.service';
import { ReadinessWatcher } from './utils/readinessWatcher';
import { VaultService } from './infra/vault/vault.service';
import { ContainerRegistry as ContainerRegistryService } from './infra/container/container.registry';
import { ContainerCleanupService } from './infra/container/containerCleanup.job';

import { AgentRunService } from './nodes/agentRun.repository';
// Nix routes are served via Nest controller; keep import if legacy route file exists
// import { registerNixRoutes } from './routes/nix.route';
import { NcpsKeyService } from './core/services/ncpsKey.service';
import { maybeProvisionLiteLLMKey } from './llm/litellm.provisioner';
import { initDI, closeDI } from './bootstrap/di';
import { AppModule } from './bootstrap/app.module';

await initDI();

async function bootstrap() {
  // NestJS HTTP bootstrap using FastifyAdapter and resolve services via DI
  const adapter = new FastifyAdapter({ logger: false });
  await adapter.getInstance().register(cors, { origin: true });
  const app = await NestFactory.create(AppModule, adapter, { logger: false });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.init();
  // Ensure global DI helpers use the same Nest container
  try {
    const { setAppRef } = await import('./bootstrap/di');
    setAppRef(app);
  } catch {}

  const logger = app.get(LoggerService, { strict: false });
  const config = app.get(ConfigService, { strict: false });
  const mongo = app.get(MongoService, { strict: false });
  const containerService = app.get(ContainerService, { strict: false });
  const vaultService = app.get(VaultService, { strict: false });
  const ncpsKeyService = app.get(NcpsKeyService, { strict: false });

  // Initialize Ncps key service early
  try {
    await ncpsKeyService.init();
  } catch (e) {
    logger.error('NcpsKeyService init failed: %s', (e as Error)?.message || String(e));
    process.exit(1);
  }
  // Attempt to auto-provision a LiteLLM virtual key if not configured with OPENAI_API_KEY
  try {
    const provisioned = await maybeProvisionLiteLLMKey(config, logger);
    if (provisioned.apiKey && !process.env.OPENAI_API_KEY) process.env.OPENAI_API_KEY = provisioned.apiKey;
    if (provisioned.baseUrl && !process.env.OPENAI_BASE_URL) process.env.OPENAI_BASE_URL = provisioned.baseUrl;
    if (provisioned.apiKey) logger.info('OPENAI_API_KEY set via LiteLLM auto-provisioning');
    if (provisioned.baseUrl) logger.info(`OPENAI_BASE_URL resolved to ${provisioned.baseUrl}`);
  } catch (e) {
    logger.error(
      'LiteLLM auto-provisioning failed. Ensure LITELLM_BASE_URL and LITELLM_MASTER_KEY are set, or provide OPENAI_API_KEY. %s',
      (e as Error)?.message || String(e),
    );
    throw e;
  }
  await mongo.connect();
  // Initialize checkpointer (optional Postgres mode)

  // Initialize container registry and cleanup services
  const registry = app.get(ContainerRegistryService, { strict: false });
  await registry.ensureIndexes();
  containerService.setRegistry(registry);
  await registry.backfillFromDocker(containerService);
  const cleanup = new ContainerCleanupService(registry, containerService, logger);
  cleanup.start();

  const templateRegistry = app.get(TemplateRegistry, { strict: false });
  const runtime = app.get(LiveGraphRuntime, { strict: false });
  const runsService = app.get(AgentRunService, { strict: false });
  await runsService.ensureIndexes();
  const graphService = await resolve<GraphRepository>(GraphRepository);
  await graphService.initIfNeeded();

  // Provide deps to factories/runtime for state persistence and config access
  runtime.setFactoryDeps?.({
    configService: config,
    graphStateService: {
      // Centralized per-node state upsert helper
      upsertNodeState: async (nodeId: string, state: Record<string, unknown>) => {
        try {
          await graphService.upsertNodeState('main', nodeId, state);
          /* else {
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
            if (idx >= 0) nodes[idx] = { ...nodes[idx], state };
            else nodes.push({ id: nodeId, template: 'unknown', state });
            await graphService.upsert({ name: 'main', version: base.version, nodes, edges: base.edges });
          } */
          // Also update live runtime snapshot
          const last = runtime?.state?.lastGraph as GraphDefinition | undefined;
          if (last) {
            const ln = last.nodes.find((n) => n.id === nodeId);
            if (ln) ln.data.state = state;
          }
        } catch (e: unknown) {
          logger.error('Failed to upsert node state for %s: %s', nodeId, JSON.stringify(e));
        }
      },
    },
  });

  // Graph service initialized via DI

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
  // NestJS HTTP bootstrap using FastifyAdapter
  const adapter = new FastifyAdapter({ logger: false });
  // Register CORS directly on underlying fastify instance for permissive origin
  await adapter.getInstance().register(cors, { origin: true });
  const app = await NestFactory.create(AppModule, adapter, { logger: false });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.init();
  // Ensure global DI helpers use the same Nest container
  try {
    const { setAppRef } = await import('./bootstrap/di');
    setAppRef(app);
  } catch {}

  // Background watcher reference (initialized after socket is attached)
  let readinessWatcher: ReadinessWatcher | null = null;

  // Existing endpoints (namespaced under /api)
  // Moved graph-related routes to Nest controllers

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

  // Graph-related routes migrated to Nest controllers

  // Register routes that need runtime on fastify instance (non-Nest legacy)
  const fastify = adapter.getInstance();
  registerRemindersRoute(fastify, runtime, logger);
  // Runs routes are handled by Nest RunsController
  // Nix proxy routes are now handled by Nest NixController; legacy Fastify wiring removed

  // Start Fastify then attach Socket.io
  const PORT = Number(process.env.PORT) || 3010;
  await fastify.listen({ port: PORT, host: '0.0.0.0' });
  logger.info(`HTTP server listening on :${PORT}`);
  // RuntimeRef removed; runtime is available via DI

  const io = new Server(fastify.server, { cors: { origin: '*' } });

  // Routes registered above

  const shutdown = async () => {
    logger.info('Shutting down...');
    readinessWatcher?.stopAll();
    await mongo.close();
    try {
      await fastify.close();
    } catch {}
    try {
      await closeDI();
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
