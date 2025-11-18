import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import type { FastifyInstance } from 'fastify';
import type { AddressInfo } from 'net';
import { io as createClient, type Socket } from 'socket.io-client';

import { GraphSocketGateway } from '../src/gateway/graph.socket.gateway';
import { LoggerService } from '../src/core/services/logger.service';
import { LiveGraphRuntime } from '../src/graph/liveGraph.manager';
import { ThreadsMetricsService } from '../src/agents/threads.metrics.service';
import { PrismaService } from '../src/core/services/prisma.service';

class LiveGraphRuntimeStub {
  subscribe() {
    return () => undefined;
  }
}

class ThreadsMetricsServiceStub {
  async getThreadsMetrics(): Promise<Record<string, { activity: 'idle'; remindersCount: number }>> {
    return {};
  }
}

class PrismaServiceStub {
  getClient() {
    return {
      $queryRaw: async () => [],
    };
  }
}

const waitForDisconnect = (socket: Socket): Promise<void> =>
  new Promise((resolve) => {
    if (!socket.connected) {
      resolve();
      return;
    }
    socket.once('disconnect', () => resolve());
    socket.disconnect();
  });

describe('GraphSocketGateway real server handshake', () => {
  let app: NestFastifyApplication;
  let fastify: FastifyInstance;
  let baseUrl: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        GraphSocketGateway,
        LoggerService,
        { provide: LiveGraphRuntime, useClass: LiveGraphRuntimeStub },
        { provide: ThreadsMetricsService, useClass: ThreadsMetricsServiceStub },
        { provide: PrismaService, useClass: PrismaServiceStub },
      ],
    }).compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();

    fastify = app.getHttpAdapter().getInstance<FastifyInstance>();
    await app.listen(0, '127.0.0.1');

    const addressInfo = fastify.server.address() as AddressInfo;
    if (!addressInfo || typeof addressInfo.port !== 'number') {
      throw new Error('Failed to determine Fastify listen port');
    }
    baseUrl = `http://127.0.0.1:${addressInfo.port}`;

    const gateway = app.get(GraphSocketGateway);
    gateway.init({ server: fastify.server });
  });

  afterAll(async () => {
    await app.close();
  });

  it('attaches socket.io and acknowledges subscriptions', async () => {
    const client = createClient(baseUrl, {
      path: '/socket.io',
      transports: ['websocket'],
      reconnection: false,
    });

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        client.removeAllListeners('connect');
        client.removeAllListeners('connect_error');
        reject(new Error('Timed out waiting for socket connect'));
      }, 3000);
      client.once('connect', () => {
        clearTimeout(timer);
        resolve();
      });
      client.once('connect_error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });

    const ack = await new Promise<{ ok: boolean; rooms?: string[]; error?: string }>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('Timed out waiting for subscribe ack'));
      }, 3000);
      client.emit('subscribe', { rooms: ['threads'] }, (response: { ok: boolean; rooms?: string[]; error?: string }) => {
        clearTimeout(timer);
        resolve(response);
      });
    });

    expect(ack.ok).toBe(true);
    expect(ack.rooms).toContain('threads');

    await waitForDisconnect(client);
  });
});
