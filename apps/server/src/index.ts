import http from 'http';
import { Server } from 'socket.io';
import { ConfigService } from './services/config.service.js';
import { LoggerService } from './services/logger.service.js';
import { MongoService } from './services/mongo.service.js';
import { CheckpointerService } from './services/checkpointer.service.js';
import { SocketService } from './services/socket.service.js';
import { buildTemplateRegistry } from './templates.js';
import { LiveGraphRuntime } from './graph/liveGraph.manager.js';
import { GraphService } from './services/graph.service.js';
import { GraphDefinition, PersistedGraphUpsertRequest } from './graph/types.js';

const logger = new LoggerService();
const config = ConfigService.fromEnv();
const mongo = new MongoService(config, logger);
const checkpointer = new CheckpointerService(logger);

async function bootstrap() {
  await mongo.connect();
  checkpointer.attachMongoClient(mongo.getClient());
  checkpointer.bindDb(mongo.getDb());

  const templateRegistry = buildTemplateRegistry({
    logger,
    containerService: undefined as any, // TODO: Provide real dependencies if needed for runtime graph; placeholders for now
    configService: config,
    slackService: undefined as any,
    checkpointerService: checkpointer,
  });

  const runtime = new LiveGraphRuntime(logger, templateRegistry);
  const graphService = new GraphService(mongo.getDb(), logger, templateRegistry);

  // Helper to convert persisted graph to runtime GraphDefinition
  const toRuntimeGraph = (saved: { nodes: any[]; edges: any[] }) =>
    ({
      nodes: saved.nodes.map((n) => ({ id: n.id, data: { template: n.template, config: n.config } })),
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

  const server = http.createServer(async (req, res) => {
    // Basic CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    if (req.url === '/api/templates' && req.method === 'GET') {
      const schema = templateRegistry.toSchema();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(schema));
      return;
    }
    if (req.url?.startsWith('/api/graph') && req.method === 'GET') {
      const name = 'main'; // single graph for now
      const graph = await graphService.get(name);
      if (!graph) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ name, version: 0, updatedAt: new Date().toISOString(), nodes: [], edges: [] }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(graph));
      return;
    }
    if (req.url === '/api/graph' && req.method === 'POST') {
      try {
        const body = await new Promise<string>((resolve, reject) => {
          let data = '';
          req.on('data', (c) => (data += c));
          req.on('end', () => resolve(data));
          req.on('error', reject);
        });
        const parsed: PersistedGraphUpsertRequest = JSON.parse(body);
        parsed.name = parsed.name || 'main';
        const saved = await graphService.upsert(parsed);
        // Apply to runtime
        await runtime.apply(toRuntimeGraph(saved));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(saved));
      } catch (e: any) {
        if (e.code === 'VERSION_CONFLICT') {
          res.writeHead(409, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'VERSION_CONFLICT', current: e.current }));
          return;
        }
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message || 'Bad Request' }));
      }
      return;
    }
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not Found' }));
  });
  const io = new Server(server, { cors: { origin: '*' } });
  const socketService = new SocketService(io, logger, checkpointer);
  socketService.register();

  const PORT = process.env.PORT || 3010;
  server.listen(PORT, () => {
    logger.info(`Socket server listening on :${PORT}`);
  });

  const shutdown = async () => {
    logger.info('Shutting down...');
    await mongo.close();
    server.close(() => process.exit(0));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

bootstrap().catch((e) => {
  logger.error('Bootstrap failure', e);
  process.exit(1);
});
