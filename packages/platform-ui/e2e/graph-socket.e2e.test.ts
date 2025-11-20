// @vitest-environment node

import { describe, it, expect, vi } from 'vitest';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Server as SocketIOServer } from 'socket.io';

const TEST_TIMEOUT_MS = 5000;

describe('graphSocket real socket handshake', () => {
  it('connects and receives run events via websocket transport', async () => {
    const originalApiBase = process.env.VITE_API_BASE_URL;
    const httpServer = createServer((_req, res) => {
      res.statusCode = 404;
      res.end('not-found');
    });

    const ioServer = new SocketIOServer(httpServer, {
      path: '/socket.io',
      transports: ['websocket'],
    });

    const addressReady = new Promise<AddressInfo>((resolve, reject) => {
      httpServer.listen(0, '127.0.0.1', () => {
        const info = httpServer.address();
        if (!info || typeof info === 'string') {
          reject(new Error('failed to obtain server address'));
          return;
        }
        resolve(info);
      });
      httpServer.once('error', reject);
    });

    const { port } = await addressReady;
    const baseUrl = `http://127.0.0.1:${port}`;

    const runEventPayload = {
      runId: 'run-42',
      mutation: 'append' as const,
      event: {
        id: 'evt-1',
        runId: 'run-42',
        threadId: 'thread-7',
        type: 'tool_execution' as const,
        status: 'running' as const,
        ts: new Date().toISOString(),
        startedAt: new Date().toISOString(),
        endedAt: null,
        durationMs: null,
        nodeId: 'node-1',
        sourceKind: 'internal' as const,
        sourceSpanId: null,
        metadata: {},
        errorCode: null,
        errorMessage: null,
        llmCall: undefined,
        toolExecution: {
          toolName: 'demo-tool',
          toolCallId: 'call-1',
          execStatus: 'success' as const,
          input: { example: true },
          output: { answer: 42 },
          errorMessage: null,
          raw: null,
        },
        summarization: undefined,
        injection: undefined,
        message: undefined,
        attachments: [],
      },
    };

    const updatedPayload = {
      ...runEventPayload,
      mutation: 'update' as const,
      event: {
        ...runEventPayload.event,
        toolExecution: {
          ...runEventPayload.event.toolExecution,
          output: { answer: 99 },
        },
      },
    };

    ioServer.on('connection', (socket) => {
      socket.on('subscribe', (payload: { room?: string; rooms?: string[] }) => {
        const rooms = [
          ...(Array.isArray(payload.rooms) ? payload.rooms : []),
          ...(payload.room ? [payload.room] : []),
        ].filter(Boolean);
        if (rooms.length === 0) return;
        for (const room of rooms) {
          socket.join(room);
          ioServer.to(room).emit('run_event_appended', runEventPayload);
          setTimeout(() => {
            ioServer.to(room).emit('run_event_updated', updatedPayload);
          }, 25);
        }
      });
    });

    vi.stubEnv('VITE_API_BASE_URL', baseUrl);
    if (process?.env) process.env.VITE_API_BASE_URL = baseUrl;
    await vi.resetModules();

    const { graphSocket } = await import('@/lib/graph/socket');

    let socketClient: ReturnType<typeof graphSocket.connect> | null = null;
    try {
      const connected = new Promise<void>((resolve, reject) => {
        let unsubscribe = () => {};
        const timeout = setTimeout(() => {
          unsubscribe();
          reject(new Error('timeout waiting for socket connect'));
        }, TEST_TIMEOUT_MS);
        unsubscribe = graphSocket.onConnected(() => {
          clearTimeout(timeout);
          unsubscribe();
          resolve();
        });
      });

      socketClient = graphSocket.connect();
      await connected;

      const roomName = 'thread:thread-7';
      const receivedEvents = await new Promise<[typeof runEventPayload, typeof updatedPayload]>((resolve, reject) => {
        let detach = () => {};
        const events: Array<typeof runEventPayload> = [];
        const timeout = setTimeout(() => {
          detach();
          reject(new Error('timeout waiting for run events'));
        }, TEST_TIMEOUT_MS);
        detach = graphSocket.onRunEvent((payload) => {
          if (payload.runId !== runEventPayload.runId) return;
          events.push(payload);
          if (events.length === 2) {
            clearTimeout(timeout);
            detach();
            resolve([events[0] as typeof runEventPayload, events[1] as typeof updatedPayload]);
          }
        });
        graphSocket.subscribe([roomName]);
      });

      expect(socketClient.connected).toBe(true);
      expect(graphSocket.isConnected()).toBe(true);
      expect(receivedEvents[0]).toEqual(runEventPayload);
      expect(receivedEvents[1]).toEqual(updatedPayload);
      expect(graphSocket.getRunCursor(runEventPayload.runId)).toEqual({ ts: updatedPayload.event.ts, id: updatedPayload.event.id });

      graphSocket.unsubscribe([roomName]);
    } finally {
      socketClient?.disconnect();
      graphSocket.dispose();
      await new Promise<void>((resolve) => ioServer.close(() => resolve()));
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));

      const workerId = Number.parseInt(process.env.VITEST_WORKER_ID ?? '0', 10);
      const defaultBase = originalApiBase ?? `http://127.0.0.1:${3010 + (Number.isFinite(workerId) ? workerId : 0)}`;
      vi.stubEnv('VITE_API_BASE_URL', defaultBase);
      if (process?.env) process.env.VITE_API_BASE_URL = defaultBase;
      await vi.resetModules();
    }
  }, TEST_TIMEOUT_MS * 2);
});
