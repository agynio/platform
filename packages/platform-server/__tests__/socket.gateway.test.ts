import { describe, it, expect } from 'vitest';
import { AppModule } from '../src/bootstrap/app.module';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { GraphSocketGateway } from '../src/gateway/graph.socket.gateway';

describe('GraphSocketGateway', () => {
  it('gateway initializes without errors', async () => {
    const adapter = new FastifyAdapter();
    const app = await NestFactory.create(AppModule, adapter);
    await app.init();
    const gateway = app.get(GraphSocketGateway);
    const fastify = adapter.getInstance();
    expect(() => gateway.init({ server: fastify.server })).not.toThrow();
    await app.close();
  });
});

