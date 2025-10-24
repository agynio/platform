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
import cors from '@fastify/cors';

import { LoggerService } from './core/services/logger.service';
import { ContainerCleanupService } from './infra/container/containerCleanup.job';

import { AppModule } from './bootstrap/app.module';
import { MongoService } from './core/services/mongo.service';
// Remove central platform.services.factory usage; rely on DI providers

// Graceful shutdown after 60 seconds
setTimeout(() => {
  process.exit(0);
}, 60000);

async function bootstrap() {
  // NestJS HTTP bootstrap using FastifyAdapter and resolve services via DI
  const adapter = new FastifyAdapter();
  await adapter.getInstance().register(cors, { origin: true });

  const app = await NestFactory.create(AppModule, adapter);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.init();

  const logger = app.get(LoggerService);
  const fastify = adapter.getInstance();

  // Start Fastify then attach Socket.io
  const PORT = Number(process.env.PORT) || 3010;
  await fastify.listen({ port: PORT, host: '0.0.0.0' });
  logger.info(`HTTP server listening on :${PORT}`);

  const shutdown = async () => {
    logger.info('Shutting down...');

    const cleanup = app.get(ContainerCleanupService);
    cleanup?.stop();

    await app.get(MongoService).close();
    await fastify.close();

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
