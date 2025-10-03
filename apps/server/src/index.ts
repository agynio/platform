import * as traceloop from '@traceloop/node-server-sdk';
traceloop.initialize({
  disableBatch: true,
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
import { GraphDefinition, PersistedGraphUpsertRequest } from './graph/types.js';
import { ContainerService } from './services/container.service.js';
import { SlackService } from './services/slack.service.js';
import { ReadinessWatcher } from './utils/readinessWatcher.js';

const logger = new LoggerService();
const config = ConfigService.fromEnv();
const mongo = new MongoService(config, logger);
const checkpointer = new CheckpointerService(logger);
const containerService = new ContainerService(logger);
const slackService = new SlackService(config, logger);

async function bootstrap() {
  await mongo.connect();
  checkpointer.attachMongoClient(mongo.getClient());
  checkpointer.bindDb(mongo.getDb());

  const templateRegistry = buildTemplateRegistry({
    logger,
    containerService: containerService,
    configService: config,
    slackService: slackService,
    checkpointerService: checkpointer,
    mongoService: mongo,
  });

  const runtime = new LiveGraphRuntime(logger, templateRegistry);
  const graphService = new GraphService(mongo.getDb(), logger, templateRegistry);

  // Helper to convert persisted graph to runtime GraphDefinition
  const toRuntimeGraph = (saved: { nodes: any[]; edges: any[] }) =>
    ({
      nodes: saved.nodes.map((n) => ({
        id: n.id,
        data: { template: n.template, config: n.config, dynamicConfig: n.dynamicConfig },
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
    logger.error('Failed to apply initial persisted graph', e);
  }

  // Expose globally for diagnostics (optional)
  (globalThis as any).liveGraphRuntime = runtime; // eslint-disable-line @typescript-eslint/no-explicit-any

  const fastify = Fastify({ logger: false });
  await fastify.register(cors, { origin: true });

  // Background watcher reference (initialized after socket is attached)
  let readinessWatcher: ReadinessWatcher | null = null;

  // Existing endpoints (namespaced under /api)
  fastify.get('/api/templates', async () => templateRegistry.toSchema());

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
      // Capture previous graph (for change detection / events)
      const before = await graphService.get(parsed.name);
      const saved = await graphService.upsert(parsed);
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
      // eslint-disable-line @typescript-eslint/no-explicit-any
      if (e.code === 'VERSION_CONFLICT') {
        reply.code(409);
        return { error: 'VERSION_CONFLICT', current: e.current };
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
