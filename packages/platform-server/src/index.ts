import 'reflect-metadata';

import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import type { FastifyInstance, FastifyTypeProviderDefault } from 'fastify';
import type { IncomingHttpHeaders } from 'http';
// CORS is enabled via Nest's app.enableCors to avoid type-provider mismatches

import { Logger as PinoLogger } from 'nestjs-pino';

import { AppModule } from './bootstrap/app.module';
import { ConfigService } from './core/services/config.service';
import { GraphSocketGateway } from './gateway/graph.socket.gateway';
import { LiveGraphRuntime } from './graph';
import { ContainerTerminalGateway } from './infra/container/terminal.gateway';

const bootstrapLogger = new Logger('Bootstrap');

const sanitizeHeaders = (headers: IncomingHttpHeaders | undefined): Record<string, unknown> => {
  if (!headers) return {};
  const sensitive = new Set(['authorization', 'cookie', 'set-cookie']);
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (!key) continue;
    sanitized[key] = sensitive.has(key.toLowerCase()) ? '[REDACTED]' : value;
  }
  return sanitized;
};
// Remove central platform.services.factory usage; rely on DI providers

async function bootstrap() {
  // NestJS HTTP bootstrap using FastifyAdapter and resolve services via DI
  const adapter = new FastifyAdapter();
  const fastifyAdapterInstance = adapter.getInstance() as unknown as FastifyInstance;
  const fastifyInstance: FastifyInstance = fastifyAdapterInstance.withTypeProvider<FastifyTypeProviderDefault>() as FastifyInstance;

  // CORS: allow dev UI preflight incl. PUT on /api/graph/nodes/:id/state
  // origins: source via ConfigService.fromEnv(); if unset, keep permissive true
  const cfg = ConfigService.fromEnv();
  const allowedOrigins = cfg.corsOrigins;

  const corsOptions = {
    origin: allowedOrigins.length ? allowedOrigins : true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
    credentials: false,
  };
  // Enable CORS via Nest to avoid Fastify type-provider generic mismatches

  const app = await NestFactory.create(AppModule, adapter, { bufferLogs: true });
  const pinoLoggerResolved = app.get(PinoLogger) as unknown;
  if (!(pinoLoggerResolved instanceof PinoLogger)) {
    throw new Error('Failed to resolve PinoLogger from application context');
  }
  const pinoLogger = pinoLoggerResolved;
  app.useLogger(pinoLogger);

  bootstrapLogger.log('Nest application created');

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableCors(corsOptions);
  await app.init();
  bootstrapLogger.log('Nest application initialized');

  const terminalGateway = app.get(ContainerTerminalGateway);
  terminalGateway.registerRoutes(fastifyInstance);

  // Attach Socket.IO gateway via DI before starting server
  const gateway = app.get(GraphSocketGateway);
  gateway.init({ server: fastifyInstance.server });

  // Start Fastify HTTP server
  const PORT = Number(process.env.PORT) || 3010;
  await fastifyInstance.listen({ port: PORT, host: '0.0.0.0' });
  bootstrapLogger.log(`HTTP server listening on :${PORT}`);

  fastifyInstance.server.on('upgrade', (req, _socket, _head) => {
    bootstrapLogger.log(
      `HTTP upgrade received ${JSON.stringify({
        url: req.url,
        headers: sanitizeHeaders(req.headers),
      })}`,
    );
  });

  // Load graph
  const liveGraphRuntime = app.get(LiveGraphRuntime);
  bootstrapLogger.log('Loading live graph runtime...');
  await liveGraphRuntime.load();

  // Tmp disable graceful shutdown because shutdown signal needs to be passed to all async jobs
  //   const shutdown = async () => {
  //     bootstrapLogger.log('Shutting down...');

  //     const cleanup = app.get(ContainerCleanupService);
  //     cleanup?.stop();

  //     await fastifyInstance.close();

  //     process.exit(0);
  //   };
  //   process.on('SIGINT', shutdown);
  //   process.on('SIGTERM', shutdown);
}

bootstrap().catch((error: unknown) => {
  const context =
    error instanceof Error
      ? {
          name: error.name,
          message: error.message,
          stack: error.stack,
        }
      : { error };
  bootstrapLogger.error(`Bootstrap failure ${JSON.stringify(context)}`);
  process.exit(1);
});

// Legacy Fastify helpers removed; Vault routes handled by Nest
