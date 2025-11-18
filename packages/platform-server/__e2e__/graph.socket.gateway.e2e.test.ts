import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import type { FastifyInstance } from 'fastify';
import type { AddressInfo } from 'net';
import { PassThrough } from 'node:stream';
import { io as createClient, type Socket } from 'socket.io-client';
import WebSocket, { type RawData } from 'ws';

import { GraphSocketGateway } from '../src/gateway/graph.socket.gateway';
import { LoggerService } from '../src/core/services/logger.service';
import { LiveGraphRuntime } from '../src/graph/liveGraph.manager';
import { ThreadsMetricsService } from '../src/agents/threads.metrics.service';
import { PrismaService } from '../src/core/services/prisma.service';
import { ContainerTerminalGateway } from '../src/infra/container/terminal.gateway';
import { TerminalSessionsService, type TerminalSessionRecord } from '../src/infra/container/terminal.sessions.service';
import { ContainerService } from '../src/infra/container/container.service';

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

class ContainerServiceStub {
  async execContainer(): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return { stdout: '', stderr: '', exitCode: 0 };
  }

  async openInteractiveExec(_containerId: string, _command: string | string[], _opts?: unknown) {
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    const execId = 'exec-stub';
    setTimeout(() => {
      stdout.write('ready\n');
      stdout.end();
      stderr.end();
      stdin.end();
    }, 50);
    return {
      execId,
      stdin,
      stdout,
      stderr,
      close: async () => ({ exitCode: 0 }),
    };
  }

  async resizeExec(): Promise<void> {
    return;
  }
}

class TerminalSessionsServiceStub {
  public connected = false;
  public closed = false;
  public readonly session: TerminalSessionRecord;

  constructor() {
    const now = Date.now();
    this.session = {
      sessionId: '11111111-1111-4111-8111-111111111111',
      token: 'stub-token',
      containerId: '22222222-2222-4222-8222-222222222222',
      shell: '/bin/sh',
      cols: 80,
      rows: 24,
      createdAt: now,
      lastActivityAt: now,
      idleTimeoutMs: 10 * 60 * 1000,
      maxDurationMs: 60 * 60 * 1000,
      state: 'pending',
    };
  }

  reset(): void {
    this.connected = false;
    this.closed = false;
    this.session.state = 'pending';
    this.session.lastActivityAt = Date.now();
  }

  validate(sessionId: string, token: string): TerminalSessionRecord {
    if (sessionId !== this.session.sessionId) throw new Error('session_not_found');
    if (token !== this.session.token) throw new Error('invalid_token');
    this.session.lastActivityAt = Date.now();
    return this.session;
  }

  markConnected(sessionId: string): void {
    if (sessionId !== this.session.sessionId) throw new Error('session_not_found');
    if (this.session.state === 'connected') throw new Error('session_already_connected');
    this.session.state = 'connected';
    this.session.lastActivityAt = Date.now();
    this.connected = true;
  }

  get(sessionId: string): TerminalSessionRecord | undefined {
    return sessionId === this.session.sessionId ? this.session : undefined;
  }

  touch(sessionId: string): void {
    if (sessionId === this.session.sessionId) {
      this.session.lastActivityAt = Date.now();
    }
  }

  close(sessionId: string): void {
    if (sessionId === this.session.sessionId) {
      this.closed = true;
    }
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

const waitForWsClose = (socket: WebSocket): Promise<void> =>
  new Promise((resolve) => {
    if (socket.readyState === WebSocket.CLOSED) {
      resolve();
      return;
    }
    socket.once('close', () => resolve());
    socket.close();
  });

const rawDataToString = (raw: RawData): string => {
  if (typeof raw === 'string') return raw;
  if (Buffer.isBuffer(raw)) return raw.toString('utf8');
  if (Array.isArray(raw)) return Buffer.concat(raw).toString('utf8');
  if (raw instanceof ArrayBuffer) return Buffer.from(raw).toString('utf8');
  return '';
};

describe('Socket gateway real server handshakes', () => {
  let app: NestFastifyApplication;
  let fastify: FastifyInstance;
  let baseUrl: string;
  let terminalSessions: TerminalSessionsServiceStub;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        GraphSocketGateway,
        LoggerService,
        { provide: LiveGraphRuntime, useClass: LiveGraphRuntimeStub },
        { provide: ThreadsMetricsService, useClass: ThreadsMetricsServiceStub },
        { provide: PrismaService, useClass: PrismaServiceStub },
        ContainerTerminalGateway,
        { provide: TerminalSessionsService, useClass: TerminalSessionsServiceStub },
        { provide: ContainerService, useClass: ContainerServiceStub },
      ],
    }).compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();

    fastify = app.getHttpAdapter().getInstance<FastifyInstance>();
    terminalSessions = app.get(TerminalSessionsService) as unknown as TerminalSessionsServiceStub;

    const terminalGateway = app.get(ContainerTerminalGateway);
    terminalGateway.registerRoutes(fastify);

    const graphGateway = app.get(GraphSocketGateway);
    graphGateway.init({ server: fastify.server });

    await app.listen(0, '127.0.0.1');

    const addressInfo = fastify.server.address() as AddressInfo;
    if (!addressInfo || typeof addressInfo.port !== 'number') {
      throw new Error('Failed to determine Fastify listen port');
    }
    baseUrl = `http://127.0.0.1:${addressInfo.port}`;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    terminalSessions.reset();
  });

  it('attaches socket.io and acknowledges subscriptions', async () => {
    let upgradeCount = 0;
    const upgradeListener = () => {
      upgradeCount += 1;
    };
    fastify.server.on('upgrade', upgradeListener);
    let client: Socket | null = null;
    try {
      client = createClient(baseUrl, {
        path: '/socket.io',
        transports: ['websocket'],
        reconnection: false,
      });

      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          client?.removeAllListeners('connect');
          client?.removeAllListeners('connect_error');
          reject(new Error('Timed out waiting for socket connect'));
        }, 3000);
        client?.once('connect', () => {
          clearTimeout(timer);
          resolve();
        });
        client?.once('connect_error', (err) => {
          clearTimeout(timer);
          reject(err);
        });
      });

      const ack = await new Promise<{ ok: boolean; rooms?: string[]; error?: string }>((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(new Error('Timed out waiting for subscribe ack'));
        }, 3000);
        client?.emit('subscribe', { rooms: ['threads'] }, (response: { ok: boolean; rooms?: string[]; error?: string }) => {
          clearTimeout(timer);
          resolve(response);
        });
      });

      expect(ack.ok).toBe(true);
      expect(ack.rooms).toContain('threads');
      expect(upgradeCount).toBeGreaterThanOrEqual(1);
    } finally {
      if (client) {
        await waitForDisconnect(client);
      }
      fastify.server.off('upgrade', upgradeListener);
    }
  });

  it('handles container terminal websocket upgrades', async () => {
    let upgradeCount = 0;
    const upgradeListener = () => {
      upgradeCount += 1;
    };
    fastify.server.on('upgrade', upgradeListener);
    const session = terminalSessions.session;
    const wsUrl = new URL(baseUrl);
    wsUrl.protocol = wsUrl.protocol === 'https:' ? 'wss:' : 'ws:';
    wsUrl.pathname = `/api/containers/${session.containerId}/terminal/ws`;
    wsUrl.search = new URLSearchParams({ sessionId: session.sessionId, token: session.token }).toString();

    const client = new WebSocket(wsUrl.toString());
    try {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          client.removeAllListeners('open');
          client.removeAllListeners('error');
          reject(new Error('Timed out waiting for terminal websocket open'));
        }, 3000);
        client.once('open', () => {
          clearTimeout(timer);
          resolve();
        });
        client.once('error', (err) => {
          clearTimeout(timer);
          reject(err);
        });
      });

      const message = await new Promise<string>((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(new Error('Timed out waiting for terminal websocket message'));
        }, 3000);
        client.once('message', (data) => {
          clearTimeout(timer);
          resolve(rawDataToString(data as RawData));
        });
        client.once('error', (err) => {
          clearTimeout(timer);
          reject(err);
        });
      });

      const payload = JSON.parse(message) as { type?: string };
      expect(payload.type).toBeDefined();
      expect(upgradeCount).toBeGreaterThanOrEqual(1);
      expect(terminalSessions.connected).toBe(true);
    } finally {
      await waitForWsClose(client);
      fastify.server.off('upgrade', upgradeListener);
    }
  });
});
