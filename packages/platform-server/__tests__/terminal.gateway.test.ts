import { PassThrough } from 'node:stream';
import Fastify from 'fastify';
import type { AddressInfo } from 'net';
import WebSocket from 'ws';
import { describe, expect, it, vi } from 'vitest';

import { ContainerTerminalGateway } from '../src/infra/container/terminal.gateway';
import type { TerminalSessionsService, TerminalSessionRecord } from '../src/infra/container/terminal.sessions.service';
import type { ContainerService } from '../src/infra/container/container.service';
import { LoggerService } from '../src/core/services/logger.service';
import { waitFor, waitForWsClose } from './helpers/ws';

const logger = new LoggerService();

const createSessionRecord = (overrides: Partial<TerminalSessionRecord> = {}): TerminalSessionRecord => {
  const now = Date.now();
  return {
    sessionId: '11111111-1111-4111-8111-111111111111',
    token: 'tok',
    containerId: '22222222-2222-4222-8222-222222222222',
    shell: '/bin/sh',
    cols: 80,
    rows: 24,
    createdAt: now,
    lastActivityAt: now,
    idleTimeoutMs: 60_000,
    maxDurationMs: 120_000,
    state: 'pending',
    ...overrides,
  };
};

const listenFastify = async (app: ReturnType<typeof Fastify>): Promise<number> => {
  await app.listen({ port: 0, host: '127.0.0.1' });
  const address = app.server.address() as AddressInfo | null;
  if (!address || typeof address.port !== 'number') {
    throw new Error('Failed to determine Fastify port');
  }
  return address.port;
};

describe('ContainerTerminalGateway (custom websocket server)', () => {
  it('closes connection when required query params are missing', async () => {
    const record = createSessionRecord();
    const sessionMocks = {
      validate: vi.fn(),
      markConnected: vi.fn(),
      get: vi.fn(),
      touch: vi.fn(),
      close: vi.fn(),
    };
    const containerMocks = {
      openInteractiveExec: vi.fn(),
      resizeExec: vi.fn(),
    };

    const gateway = new ContainerTerminalGateway(
      sessionMocks as unknown as TerminalSessionsService,
      containerMocks as unknown as ContainerService,
      logger,
    );

    const app = Fastify();
    gateway.registerRoutes(app);
    const port = await listenFastify(app);

    const ws = new WebSocket(
      `ws://127.0.0.1:${port}/api/containers/${record.containerId}/terminal/ws?sessionId=${record.sessionId}`,
    );

    const messages: Array<Record<string, unknown> | string> = [];
    ws.on('message', (data) => {
      const text = typeof data === 'string' ? data : data.toString('utf8');
      try {
        messages.push(JSON.parse(text));
      } catch {
        messages.push(text);
      }
    });

    const closeInfo = await waitForWsClose(ws, 2000);

    expect(closeInfo.code).toBe(1008);
    expect(closeInfo.reason).toBe('invalid_query');
    expect(sessionMocks.validate).not.toHaveBeenCalled();
    const errorMessage = messages.find((msg) => typeof msg === 'object' && msg !== null);
    if (errorMessage && typeof errorMessage === 'object') {
      expect(errorMessage).toMatchObject({ code: 'invalid_query' });
    }

    await app.close();
  });

  it('handles terminal websocket session end-to-end', async () => {
    const record = createSessionRecord({ shell: '/bin/bash', cols: 120, rows: 32, maxDurationMs: 300_000 });
    const sessionMocks = {
      validate: vi.fn().mockReturnValue(record),
      markConnected: vi.fn().mockImplementation(() => {
        record.state = 'connected';
      }),
      get: vi.fn().mockImplementation(() => record),
      touch: vi.fn().mockImplementation(() => {
        record.lastActivityAt = Date.now();
      }),
      close: vi.fn(),
    };

    let stdinBuffer = '';
    const stdin = new PassThrough();
    stdin.on('data', (chunk) => {
      stdinBuffer += chunk.toString();
    });
    const stdout = new PassThrough();
    const closeExec = vi.fn().mockResolvedValue({ exitCode: 0 });

    const containerMocks = {
      openInteractiveExec: vi.fn().mockResolvedValue({
        stdin,
        stdout,
        stderr: undefined,
        close: closeExec,
        execId: 'exec-123',
      }),
      resizeExec: vi.fn().mockResolvedValue(undefined),
    };

    const gateway = new ContainerTerminalGateway(
      sessionMocks as unknown as TerminalSessionsService,
      containerMocks as unknown as ContainerService,
      logger,
    );

    const app = Fastify();
    gateway.registerRoutes(app);
    const port = await listenFastify(app);

    const messages: { type?: string; phase?: string }[] = [];
    const ws = new WebSocket(
      `ws://127.0.0.1:${port}/api/containers/${record.containerId}/terminal/ws?sessionId=${record.sessionId}&token=${record.token}`,
    );
    ws.on('message', (data) => {
      const text = typeof data === 'string' ? data : data.toString('utf8');
      try {
        messages.push(JSON.parse(text) as { type?: string; phase?: string });
      } catch {
        // ignore non-json frames
      }
    });

    await waitFor(() => messages.some((msg) => msg.type === 'status' && msg.phase === 'running'), 3000);

    ws.send(JSON.stringify({ type: 'input', data: 'echo hi\r\n' }));
    await waitFor(() => stdinBuffer.length > 0);
    expect(stdinBuffer).toBe('echo hi\r');

    ws.close();
    const closeInfo = await waitForWsClose(ws, 3000);

    expect([1000, 1005]).toContain(closeInfo.code);
    expect(closeExec).toHaveBeenCalled();
    expect(sessionMocks.close).toHaveBeenCalledWith(record.sessionId);

    await app.close();
  });
});
