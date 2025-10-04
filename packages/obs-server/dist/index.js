import Fastify from 'fastify';
import cors from '@fastify/cors';
import { ConfigService } from './config.js';
import { MongoService } from './mongo.js';
import { SpansService } from './spans.service.js';
import { extendedSpanRequestSchema, spanQuerySchema } from './types.js';
async function buildServer() {
    const config = ConfigService.fromEnv();
    const mongoService = new MongoService(config.mongoUrl);
    // Connect to MongoDB
    await mongoService.connect();
    const spansService = new SpansService(mongoService);
    const fastify = Fastify({
        logger: {
            level: config.logLevel,
        },
    });
    // Enable CORS if configured
    if (config.corsEnabled) {
        await fastify.register(cors, {
            origin: true,
        });
    }
    // Health checks
    fastify.get('/healthz', async () => {
        return { status: 'ok' };
    });
    fastify.get('/readyz', async () => {
        const isConnected = await mongoService.isConnected();
        if (!isConnected) {
            throw new Error('Database not ready');
        }
        return { status: 'ready' };
    });
    // Extended API endpoints
    fastify.post('/v1/spans/upsert', {
        schema: {
            body: extendedSpanRequestSchema,
        },
    }, async (request, reply) => {
        try {
            const spanRequest = request.body;
            const result = await spansService.upsertSpan(spanRequest);
            return { success: true, spanId: result.spanId };
        }
        catch (error) {
            reply.code(400);
            return {
                error: 'Bad Request',
                message: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    });
    fastify.get('/v1/spans', {
        schema: {
            querystring: spanQuerySchema,
        },
    }, async (request) => {
        const query = request.query;
        return await spansService.querySpans(query);
    });
    fastify.get('/v1/spans/:traceId/:spanId', async (request, reply) => {
        const { traceId, spanId } = request.params;
        const span = await spansService.getSpan(traceId, spanId);
        if (!span) {
            reply.code(404);
            return { error: 'Span not found' };
        }
        return span;
    });
    // OTLP endpoint (placeholder for Stage 1)
    fastify.post('/v1/traces', async (request, reply) => {
        // For Stage 1, we'll just return success
        // In a full implementation, this would parse OTLP protobuf data
        reply.code(200);
        return { success: true };
    });
    // Graceful shutdown
    const gracefulShutdown = async () => {
        console.log('Starting graceful shutdown...');
        try {
            await fastify.close();
            await mongoService.disconnect();
            console.log('Graceful shutdown completed');
            process.exit(0);
        }
        catch (error) {
            console.error('Error during shutdown:', error);
            process.exit(1);
        }
    };
    process.on('SIGINT', gracefulShutdown);
    process.on('SIGTERM', gracefulShutdown);
    return { fastify, config };
}
async function start() {
    try {
        const { fastify, config } = await buildServer();
        await fastify.listen({
            port: config.port,
            host: '0.0.0.0'
        });
        console.log(`🚀 Observability server running on http://0.0.0.0:${config.port}`);
    }
    catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}
// Start server if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
    start();
}
export { buildServer };
//# sourceMappingURL=index.js.map