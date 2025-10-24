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
import { NodeStateService } from './graph/nodeState.service';
import { setNodeStateService } from './graph/nodeState.provider';
import { GraphDefinition, GraphError, PersistedGraphUpsertRequest } from './graph/types';
import { GraphErrorCode } from './graph/errors';
import { ContainerService } from './infra/container/container.service';
import { VaultService } from './infra/vault/vault.service';
import { ContainerRegistry as ContainerRegistryService } from './infra/container/container.registry';
import { ContainerCleanupService } from './infra/container/containerCleanup.job';

import { AgentRunService } from './nodes/agentRun.repository';
// Nix routes are served via Nest controller; keep import if legacy route file exists
// import { registerNixRoutes } from './routes/nix.route';
import { initDI, closeDI } from './bootstrap/di';
import { AppModule } from './bootstrap/app.module';
import { NcpsKeyService } from './infra/ncps/ncpsKey.service';

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
  let nodeStateService: NodeStateService | undefined;
  // Register routes that need runtime on fastify instance (non-Nest legacy)
  const fastify = adapter.getInstance();
  // Initialize Ncps key service early
  try {
    await ncpsKeyService.init();
  } catch (e) {
    logger.error('NcpsKeyService init failed: %s', (e as Error)?.message || String(e));
    process.exit(1);
  }
  await mongo.connect();
  // Initialize checkpointer (optional Postgres mode)

  // Initialize container registry and cleanup services
  const registry = app.get(ContainerRegistryService, { strict: false });
  await registry.ensureIndexes();
  await registry.backfillFromDocker(containerService);
  const cleanup = new ContainerCleanupService(registry, containerService, logger);
  cleanup.start();

  const runtime = app.get(LiveGraphRuntime, { strict: false });
  const runsService = app.get(AgentRunService, { strict: false });
  await runsService.ensureIndexes();
  const graphService = await resolve<GraphRepository>(GraphRepository);
  await graphService.initIfNeeded();
  // Construct NodeStateService for state persistence and runtime snapshot updates
  nodeStateService = new NodeStateService(graphService as any, runtime, logger);
  // Expose via lightweight provider for template factories
  setNodeStateService(nodeStateService);

  // Graph service initialized via DI

  // Helper to convert persisted graph to runtime GraphDefinition
  const toRuntimeGraph = (saved: { nodes: Array<{ id: string; template: string; config?: Record<string, unknown>; dynamicConfig?: Record<string, unknown>; state?: Record<string, unknown> }>; edges: Array<{ source: string; sourceHandle: string; target: string; targetHandle: string }> }) =>
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
      // Wiring is deterministic via templates; no post-hoc assignment
    } else {
      logger.info('No persisted graph found; starting with empty runtime graph.');
    }
  } catch (e) {
    if (e instanceof GraphError) {
      logger.error('Failed to apply initial persisted graph: %s. Cause: %s', e.message, e.cause);
    }
    logger.error('Failed to apply initial persisted graph: %s', String(e));
  }
  // Graph-related routes migrated to Nest controllers; legacy Fastify wiring removed

  // Start Fastify then attach Socket.io
  const PORT = Number(process.env.PORT) || 3010;
  await fastify.listen({ port: PORT, host: '0.0.0.0' });
  logger.info(`HTTP server listening on :${PORT}`);
  // RuntimeRef removed; runtime is available via DI

  // Routes registered above

  const shutdown = async () => {
    logger.info('Shutting down...');
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

// Legacy Fastify helpers removed; Vault routes handled by Nest
