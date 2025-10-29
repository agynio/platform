import 'reflect-metadata';
// Observability SDK initialization (replaces traceloop)
import { init as initTracing } from '@agyn/tracing';
initTracing({
  mode: 'extended',
  endpoints: { extended: process.env.TRACING_SERVER_URL || 'http://localhost:4319' },
  defaultAttributes: { service: 'server' },
});

import { NestFactory } from '@nestjs/core';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { ValidationPipe } from '@nestjs/common';
import fastifyCors, { FastifyCorsOptions } from '@fastify/cors';

import { LoggerService } from './core/services/logger.service';
import { ContainerCleanupService } from './infra/container/containerCleanup.job';

import { AppModule } from './bootstrap/app.module';
import { MongoService } from './core/services/mongo.service';
import { GraphSocketGateway } from './gateway/graph.socket.gateway';
import { LiveGraphRuntime } from './graph';
import { ConfigService } from './core/services/config.service';
// Remove central platform.services.factory usage; rely on DI providers

async function bootstrap() {
  // NestJS HTTP bootstrap using FastifyAdapter and resolve services via DI
  const adapter = new FastifyAdapter();
  const fastify = adapter.getInstance();

  // CORS: allow dev UI preflight incl. PUT on /api/graph/nodes/:id/state
  // origins: source via ConfigService.fromEnv(); if unset, keep permissive true
  const cfg = ConfigService.fromEnv();
  const allowedOrigins = cfg.corsOrigins;

  const corsOptions: FastifyCorsOptions = {
    origin: allowedOrigins.length ? allowedOrigins : true,
    methods: [
      'GET',
      'HEAD',
      'PUT',
      'PATCH',
      'POST',
      'DELETE',
      'OPTIONS',
    ],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'Accept',
    ],
    credentials: false,
  };
  await fastify.register(fastifyCors, corsOptions);

  const app = await NestFactory.create(AppModule, adapter);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.init();

  const logger = app.get(LoggerService);
  const fastifyInstance = fastify;

  // Start Fastify then attach Socket.io
  const PORT = Number(process.env.PORT) || 3010;
  await fastifyInstance.listen({ port: PORT, host: '0.0.0.0' });
  logger.info(`HTTP server listening on :${PORT}`);

  // Attach Socket.IO gateway via DI and explicit init
  const gateway = app.get(GraphSocketGateway);
  gateway.init({ server: fastify.server });

  // Load graph
  const liveGraphRuntime = app.get(LiveGraphRuntime);
  logger.info('Loading live graph runtime...');
  await liveGraphRuntime.load();

  const shutdown = async () => {
    logger.info('Shutting down...');

    const cleanup = app.get(ContainerCleanupService);
    cleanup?.stop();

    await app.get(MongoService).close();
    await fastifyInstance.close();

    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

bootstrap().catch((e) => {
  console.error('Bootstrap failure', e);
  process.exit(1);
});

// Legacy Fastify helpers removed; Vault routes handled by Nest
