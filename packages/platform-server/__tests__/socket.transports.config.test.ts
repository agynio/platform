import { describe, it, expect } from 'vitest';
import { createServer, type Server as HTTPServer } from 'http';
import type { AddressInfo } from 'net';
import { io as createClient } from 'socket.io-client';
import { GraphSocketGateway } from '../src/gateway/graph.socket.gateway';
import type { LiveGraphRuntime } from '../src/graph/liveGraph.manager';
import type { ThreadsMetricsService } from '../src/agents/threads.metrics.service';
import type { PrismaService } from '../src/core/services/prisma.service';
import type { LoggerService } from '../src/core/services/logger.service';

const noopLogger = {
  info: () => undefined,
  debug: () => undefined,
  warn: () => undefined,
  error: () => undefined,
} as unknown as LoggerService;

const runtimeStub = {
  subscribe: () => () => undefined,
} as unknown as LiveGraphRuntime;

const metricsStub = {
  getThreadsMetrics: async () => ({}),
} as unknown as ThreadsMetricsService;

const prismaStub = {
  getClient: () => ({
    $queryRaw: async () => [],
  }),
} as unknown as PrismaService;

async function listen(server: HTTPServer): Promise<number> {
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  return port;
}

describe('GraphSocketGateway transports configuration', () => {
  it('rejects polling-only socket.io clients', async () => {
    const httpServer = createServer();
    const port = await listen(httpServer);
    const gateway = new GraphSocketGateway(noopLogger, runtimeStub, metricsStub, prismaStub);
    gateway.init({ server: httpServer });

    const client = createClient(`http://127.0.0.1:${port}`, {
      path: '/socket.io',
      transports: ['polling'],
      reconnection: false,
      timeout: 2000,
    });

    const outcome = await new Promise<{ type: 'connect' } | { type: 'error'; error: Error } | { type: 'timeout' }>((resolve) => {
      const timer = setTimeout(() => {
        resolve({ type: 'timeout' });
      }, 3000);
      client.once('connect', () => {
        clearTimeout(timer);
        resolve({ type: 'connect' });
      });
      client.once('connect_error', (err: unknown) => {
        clearTimeout(timer);
        const error = err instanceof Error ? err : new Error(String(err));
        resolve({ type: 'error', error });
      });
      client.once('error', (err: unknown) => {
        clearTimeout(timer);
        const error = err instanceof Error ? err : new Error(String(err));
        resolve({ type: 'error', error });
      });
    });

    client.close();
    (gateway as unknown as { io?: { close(): void } }).io?.close();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));

    expect(outcome.type).toBe('error');
    if (outcome.type === 'error') {
      expect(outcome.error.message.toLowerCase()).toMatch(/(transport|poll)/);
    }
  });
});
