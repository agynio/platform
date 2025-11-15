import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import WebSocket from 'ws';
import { describe, expect, it, vi } from 'vitest';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { ContainerTerminalGateway } from '../src/infra/container/terminal.gateway';
import type { TerminalSessionsService, TerminalSessionRecord } from '../src/infra/container/terminal.sessions.service';
import type { ContainerService } from '../src/infra/container/container.service';
import { LoggerService } from '../src/core/services/logger.service';

class MockSocket extends EventEmitter {
  readyState = WebSocket.OPEN;
  send = vi.fn();
  close = vi.fn((code?: number, reason?: string) => {
    this.readyState = WebSocket.CLOSED;
    super.emit('close', code, reason);
  });
  override removeAllListeners(event?: string): this {
    super.removeAllListeners(event);
    return this;
  }
}

const logger = new LoggerService();

const flush = () => new Promise((resolve) => setImmediate(resolve));

describe('ContainerTerminalGateway', () => {
  it('registers websocket route only once', () => {
    const sessions = {} as unknown as TerminalSessionsService;
    const containers = {} as unknown as ContainerService;
    const gateway = new ContainerTerminalGateway(sessions, containers, logger);

    const register = vi.fn();
    const get = vi.fn();
    const fastify = { register, get } as unknown as FastifyInstance;

    gateway.registerRoutes(fastify);
    gateway.registerRoutes(fastify);

    expect(register).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledTimes(1);
    expect(get.mock.calls[0][0]).toBe('/api/containers/:containerId/terminal/ws');
  });

  it('handles a successful terminal websocket session', async () => {
    const now = Date.now();
    const sessionId = '00000000-0000-0000-0000-000000000000';
    const record: TerminalSessionRecord = {
      sessionId,
      token: 'tok',
      containerId: 'cid',
      shell: '/bin/bash',
      cols: 120,
      rows: 32,
      createdAt: now,
      lastActivityAt: now,
      idleTimeoutMs: 60_000,
      maxDurationMs: 300_000,
      state: 'pending',
    };

    const sessionMocks = {
      validate: vi.fn().mockReturnValue(record),
      markConnected: vi.fn().mockImplementation(() => {
        record.state = 'connected';
      }),
      get: vi.fn().mockImplementation(() => record),
      touch: vi.fn(),
      close: vi.fn(),
    };
    const sessions = sessionMocks as unknown as TerminalSessionsService;

    const stdout = new PassThrough();
    const stdin = new PassThrough();
    const close = vi.fn().mockResolvedValue({ exitCode: 0 });

    const containerMocks = {
      openInteractiveExec: vi.fn().mockResolvedValue({
        stdin,
        stdout,
        stderr: undefined,
        close,
        execId: 'exec-1',
      }),
      resizeExec: vi.fn().mockResolvedValue(undefined),
    };
    const containers = containerMocks as unknown as Pick<ContainerService, 'openInteractiveExec' | 'resizeExec'>;

    const gateway = new ContainerTerminalGateway(sessions as TerminalSessionsService, containers as ContainerService, logger);

    const socket = new MockSocket();
    const request = {
      params: { containerId: 'cid' },
      query: { sessionId, token: 'tok' },
    } as unknown as FastifyRequest;

    await (gateway as unknown as { handleConnection(s: MockSocket, r: FastifyRequest): Promise<void> }).handleConnection(
      socket,
      request,
    );

    await flush();

    expect(socket.send).toHaveBeenCalledWith(expect.stringContaining('"phase":"starting"'));
    expect(socket.send).toHaveBeenCalledWith(expect.stringContaining('"phase":"running"'));
    expect(containerMocks.openInteractiveExec).toHaveBeenCalledWith('cid', expect.stringContaining('exec /bin/bash'), {
      tty: true,
      demuxStderr: false,
    });
    expect(containerMocks.resizeExec).toHaveBeenCalledWith('exec-1', { cols: 120, rows: 32 });

    stdout.write('hello-world');
    await flush();
    expect(socket.send).toHaveBeenCalledWith(expect.stringContaining('hello-world'));

    socket.emit('message', JSON.stringify({ type: 'close' }));
    await flush();

    expect(close).toHaveBeenCalled();
    expect(sessionMocks.close).toHaveBeenCalledWith(sessionId);
    expect(socket.close).toHaveBeenCalledWith(1000, 'client_closed');
  });

  it('rejects invalid query parameters', async () => {
    const sessionMocks = {
      validate: vi.fn(),
    };
    const sessions = sessionMocks as unknown as TerminalSessionsService;
    const containers = {
      openInteractiveExec: vi.fn(),
    } as unknown as ContainerService;
    const gateway = new ContainerTerminalGateway(sessions, containers, logger);
    const socket = new MockSocket();
    const request = {
      params: { containerId: 'cid' },
      query: { sessionId: 'not-a-uuid', token: '' },
    } as unknown as FastifyRequest;

    await (gateway as unknown as { handleConnection(s: MockSocket, r: FastifyRequest): Promise<void> }).handleConnection(
      socket,
      request,
    );

    expect(socket.close).toHaveBeenCalledWith(1008, 'invalid_query');
    expect(sessionMocks.validate).not.toHaveBeenCalled();
  });
});
