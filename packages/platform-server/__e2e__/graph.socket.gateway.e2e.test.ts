import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import type { FastifyInstance } from 'fastify';
import type { AddressInfo } from 'net';
import { PassThrough } from 'node:stream';
import { io as createClient, type Socket } from 'socket.io-client';
import WebSocket, { type RawData } from 'ws';

import type { MessageKind, RunStatus } from '@prisma/client';
import { RunEventsService } from '../src/events/run-events.service';
import { GraphEventsPublisher } from '../src/gateway/graph.events.publisher';
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
  private readonly runEvents = new Map<string, unknown>();

  setRunEvent(event: { id: string }): void {
    this.runEvents.set(event.id, event);
  }

  clear(): void {
    this.runEvents.clear();
  }

  getClient() {
    return {
      $queryRaw: async () => [],
      runEvent: {
        findUnique: async ({ where }: { where: { id: string } }) => {
          const id = where?.id;
          if (!id) return null;
          const stored = this.runEvents.get(id);
          return stored ?? null;
        },
      },
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
  public validations = 0;
  public connects = 0;
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
    this.validations = 0;
    this.connects = 0;
    this.session.state = 'pending';
    this.session.lastActivityAt = Date.now();
  }

  validate(sessionId: string, token: string): TerminalSessionRecord {
    this.validations += 1;
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
    this.connects += 1;
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

type RunEventRecordStub = {
  id: string;
  runId: string;
  threadId: string;
  type: string;
  status: string;
  ts: Date;
  startedAt: Date | null;
  endedAt: Date | null;
  durationMs: number | null;
  nodeId: string | null;
  sourceKind: string;
  sourceSpanId: string | null;
  metadata: unknown;
  errorCode: string | null;
  errorMessage: string | null;
  llmCall: unknown;
  toolExecution: unknown;
  summarization: unknown;
  injection: unknown;
  eventMessage: unknown;
  attachments: unknown[];
};

const createRunEventRecord = (overrides: Partial<RunEventRecordStub> = {}): RunEventRecordStub => {
  const now = new Date();
  return {
    id: 'evt-stub',
    runId: 'run-stub',
    threadId: 'thread-stub',
    type: 'tool_execution',
    status: 'running',
    ts: now,
    startedAt: now,
    endedAt: null,
    durationMs: null,
    nodeId: 'node-1',
    sourceKind: 'internal',
    sourceSpanId: null,
    metadata: {},
    errorCode: null,
    errorMessage: null,
    llmCall: null,
    toolExecution: null,
    summarization: null,
    injection: null,
    eventMessage: null,
    attachments: [],
    ...overrides,
  };
};

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
  let graphGateway: GraphSocketGateway;
  let runEventsService: RunEventsService;
  let prismaStub: PrismaServiceStub;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        GraphSocketGateway,
        { provide: GraphEventsPublisher, useExisting: GraphSocketGateway },
        LoggerService,
        { provide: LiveGraphRuntime, useClass: LiveGraphRuntimeStub },
        { provide: ThreadsMetricsService, useClass: ThreadsMetricsServiceStub },
        { provide: PrismaService, useClass: PrismaServiceStub },
        ContainerTerminalGateway,
        { provide: TerminalSessionsService, useClass: TerminalSessionsServiceStub },
        { provide: ContainerService, useClass: ContainerServiceStub },
        RunEventsService,
      ],
    }).compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();

    fastify = app.getHttpAdapter().getInstance<FastifyInstance>();
    terminalSessions = app.get(TerminalSessionsService) as unknown as TerminalSessionsServiceStub;
    prismaStub = app.get(PrismaService) as unknown as PrismaServiceStub;
    runEventsService = app.get(RunEventsService);

    const terminalGateway = app.get(ContainerTerminalGateway);
    terminalGateway.registerRoutes(fastify);

    graphGateway = app.get(GraphSocketGateway);
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
    prismaStub.clear();
  });

  it('attaches socket.io, subscribes, and receives graph events', async () => {
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

      const threadId = 'thread-123';
      const runId = 'run-456';

      const messagePromise = new Promise<Record<string, unknown>>((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(new Error('Timed out waiting for message_created event'));
        }, 3000);
        client?.once('message_created', (payload: Record<string, unknown>) => {
          clearTimeout(timer);
          resolve(payload);
        });
      });

      const statusPromise = new Promise<Record<string, unknown>>((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(new Error('Timed out waiting for run_status_changed event'));
        }, 3000);
        client?.once('run_status_changed', (payload: Record<string, unknown>) => {
          clearTimeout(timer);
          resolve(payload);
        });
      });

      const runEventAppendedPromise = new Promise<Record<string, unknown>>((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(new Error('Timed out waiting for run_event_appended event'));
        }, 3000);
        client?.once('run_event_appended', (payload: Record<string, unknown>) => {
          clearTimeout(timer);
          resolve(payload);
        });
      });

      const runEventUpdatedPromise = new Promise<Record<string, unknown>>((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(new Error('Timed out waiting for run_event_updated event'));
        }, 3000);
        client?.once('run_event_updated', (payload: Record<string, unknown>) => {
          clearTimeout(timer);
          resolve(payload);
        });
      });

      const ack = await new Promise<{ ok: boolean; rooms?: string[]; error?: string }>((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(new Error('Timed out waiting for subscribe ack'));
        }, 3000);
        client?.emit(
          'subscribe',
          { rooms: ['threads', `thread:${threadId}`, `run:${runId}`] },
          (response: { ok: boolean; rooms?: string[]; error?: string }) => {
            clearTimeout(timer);
            resolve(response);
          },
        );
      });

      expect(ack.ok).toBe(true);
      expect(ack.rooms).toEqual(expect.arrayContaining(['threads', `thread:${threadId}`, `run:${runId}`]));

      const createdAt = new Date();
      graphGateway.emitMessageCreated(threadId, {
        id: 'msg-1',
        kind: 'assistant' as MessageKind,
        text: 'hello world',
        source: { role: 'assistant' },
        createdAt,
        runId,
      });

      graphGateway.emitRunStatusChanged(threadId, {
        id: runId,
        status: 'running' as RunStatus,
        createdAt,
        updatedAt: createdAt,
      });

      const runEventId = 'evt-1';
      const appendRecord = createRunEventRecord({
        id: runEventId,
        runId,
        threadId,
        status: 'running',
        ts: createdAt,
        startedAt: createdAt,
      });
      prismaStub.setRunEvent(appendRecord);
      const publishAppendResult = await runEventsService.publishEvent(runEventId, 'append');
      expect(publishAppendResult).not.toBeNull();

      const [messagePayload, statusPayload, appendedPayload] = await Promise.all([messagePromise, statusPromise, runEventAppendedPromise]);
      expect(messagePayload).toMatchObject({ threadId, message: expect.any(Object) });
      expect(statusPayload).toMatchObject({ threadId, run: expect.objectContaining({ id: runId }) });
      expect(appendedPayload).toMatchObject({ runId, mutation: 'append' });

      const updatedAt = new Date(createdAt.getTime() + 1000);
      const updateRecord = createRunEventRecord({
        id: runEventId,
        runId,
        threadId,
        status: 'success',
        ts: updatedAt,
        startedAt: createdAt,
        endedAt: updatedAt,
      });
      prismaStub.setRunEvent(updateRecord);
      const publishUpdateResult = await runEventsService.publishEvent(runEventId, 'update');
      expect(publishUpdateResult).not.toBeNull();
      const updatedPayload = await runEventUpdatedPromise;
      expect(updatedPayload).toMatchObject({ runId, mutation: 'update' });
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

      expect(client.readyState).toBe(WebSocket.OPEN);

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
      expect(client.readyState).toBe(WebSocket.OPEN);
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(client.readyState).toBe(WebSocket.OPEN);
      expect(payload.type).toBeDefined();
      expect(upgradeCount).toBeGreaterThanOrEqual(1);
      expect(terminalSessions.connected).toBe(true);
      expect(terminalSessions.validations).toBeGreaterThan(0);
      expect(terminalSessions.connects).toBeGreaterThan(0);
    } finally {
      await waitForWsClose(client);
      fastify.server.off('upgrade', upgradeListener);
    }
  });

  it('supports concurrent graph and terminal connections with event flow', async () => {
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

    const client = createClient(baseUrl, {
      path: '/socket.io',
      transports: ['websocket'],
      reconnection: false,
    });

    const terminalClient = new WebSocket(wsUrl.toString());

    try {
      await Promise.all([
        new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => {
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
        }),
        new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => {
            reject(new Error('Timed out waiting for terminal websocket open'));
          }, 3000);
          terminalClient.once('open', () => {
            clearTimeout(timer);
            resolve();
          });
          terminalClient.once('error', (err) => {
            clearTimeout(timer);
            reject(err);
          });
        }),
      ]);

      const threadId = 'thread-999';
      const runId = 'run-999';

      const subscribeAck = await new Promise<{ ok: boolean; rooms?: string[]; error?: string }>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Timed out waiting for subscribe ack')), 3000);
        client.emit(
          'subscribe',
          { rooms: ['threads', `thread:${threadId}`, `run:${runId}`] },
          (response: { ok: boolean; rooms?: string[]; error?: string }) => {
            clearTimeout(timer);
            resolve(response);
          },
        );
      });

      expect(subscribeAck.ok).toBe(true);
      expect(terminalClient.readyState).toBe(WebSocket.OPEN);

      const runEventReceived = new Promise<Record<string, unknown>>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Timed out waiting for run_event_appended event')), 3000);
        client.once('run_event_appended', (payload: Record<string, unknown>) => {
          clearTimeout(timer);
          resolve(payload);
        });
      });

      const terminalMessage = new Promise<string>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Timed out waiting for terminal message')), 3000);
        terminalClient.once('message', (data) => {
          clearTimeout(timer);
          expect(terminalClient.readyState).toBe(WebSocket.OPEN);
          resolve(rawDataToString(data as RawData));
        });
      });

      graphGateway.emitRunEvent(runId, threadId, {
        runId,
        threadId,
        mutation: 'append',
        event: {
          id: 'evt-999',
          runId,
          threadId,
          type: 'checkpoint',
          status: 'running',
          ts: new Date().toISOString(),
        },
      });

      const [runEventPayload, terminalFrame] = await Promise.all([runEventReceived, terminalMessage]);
      expect(runEventPayload).toMatchObject({ runId, mutation: 'append' });
      expect(terminalFrame.length).toBeGreaterThan(0);
      expect(terminalSessions.validations).toBeGreaterThan(0);
      expect(terminalSessions.connects).toBeGreaterThan(0);
      expect(terminalSessions.connected).toBe(true);
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(terminalClient.readyState).toBe(WebSocket.OPEN);
      expect(upgradeCount).toBeGreaterThanOrEqual(1);
    } finally {
      await waitForDisconnect(client);
      terminalClient.close();
      await waitForWsClose(terminalClient);
      fastify.server.off('upgrade', upgradeListener);
    }
  });
});
