import { describe, it, expect } from 'vitest';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { AppModule } from '../src/bootstrap/app.module';
import { LiveGraphRuntime } from '../src/graph/liveGraph.manager';

describe('GET /api/graph/nodes/:id/status shape', () => {
  it('returns provisionStatus with { state, details? }', async () => {
    const adapter = new FastifyAdapter();
    const app = await NestFactory.create(AppModule, adapter);
    await app.init();
    const server = adapter.getInstance();

    const runtime = app.get(LiveGraphRuntime);
    // Install a minimal node into runtime directly for test
    await runtime.apply({ nodes: [{ id: 'n1', data: { template: 'agent', config: { name: 't' } } }], edges: [] } as any);

    const res = await server.inject({ method: 'GET', url: '/api/graph/nodes/n1/status' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as unknown as { provisionStatus?: { state: string; details?: unknown } };
    expect(body).toBeTruthy();
    expect(typeof body.provisionStatus?.state).toBe('string');
    // details is optional; ensure no unexpected fields present
    const keys = Object.keys(body.provisionStatus || {});
    for (const k of keys) expect(['state', 'details']).toContain(k);

    await app.close();
  });
});

