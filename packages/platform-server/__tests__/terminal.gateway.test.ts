import { EventEmitter } from 'node:events';
import { PassThrough, Writable } from 'node:stream';
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
    const sessionId = '11111111-1111-4111-8111-111111111111';
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

  it('normalizes input newlines and streams output for interactive exec', async () => {
    const now = Date.now();
    const sessionId = '11111111-1111-4111-8111-111111111111';
    const record: TerminalSessionRecord = {
      sessionId,
      token: 'tok',
      containerId: 'cid',
      shell: '/bin/sh',
      cols: 80,
      rows: 24,
      createdAt: now,
      lastActivityAt: now,
      idleTimeoutMs: 60_000,
      maxDurationMs: 120_000,
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

    let written = '';
    const writeSpy = vi.fn();
    const stdin = new Writable({
      write(chunk, _encoding, callback) {
        written += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
        callback();
        writeSpy();
      },
    });
    const stdout = new PassThrough();

    const close = vi.fn().mockResolvedValue({ exitCode: 0 });

    const containerMocks = {
      openInteractiveExec: vi.fn().mockResolvedValue({
        stdin,
        stdout,
        stderr: undefined,
        close,
        execId: 'exec-2',
      }),
      resizeExec: vi.fn().mockResolvedValue(undefined),
    };

    const gateway = new ContainerTerminalGateway(
      sessionMocks as unknown as TerminalSessionsService,
      containerMocks as unknown as ContainerService,
      logger,
    );

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

    expect(sessionMocks.validate).toHaveBeenCalled();

    socket.emit('message', JSON.stringify({ type: 'input', data: 'echo hi\r\nwhoami\r\nexit\r\n' }));
    await flush();

    const messages = socket.send.mock.calls
      .map(([payload]) => {
        if (typeof payload !== 'string') return null;
        try {
          return JSON.parse(payload) as { type?: string; code?: string };
        } catch {
          return null;
        }
      })
      .filter(Boolean);
    const errorMessage = messages.find((msg) => msg?.type === 'error');
    expect(errorMessage).toBeUndefined();

    expect(writeSpy).toHaveBeenCalled();
    expect(written).toBe('echo hi\rwhoami\rexit\r');

    stdout.write('hi\n');
    stdout.write('user\n');
    stdout.end();
    await flush();

    const outputs = socket.send.mock.calls
      .map(([payload]) => {
        if (typeof payload !== 'string') return null;
        try {
          return JSON.parse(payload) as { type?: string; data?: string };
        } catch {
          return null;
        }
      })
      .filter((message): message is { type: string; data: string } => Boolean(message && message.type === 'output'))
      .map((message) => message.data)
      .join('');

    expect(outputs).toContain('hi');
    expect(outputs).toContain('user');

    expect(close).toHaveBeenCalled();
    expect(sessionMocks.close).toHaveBeenCalledWith(sessionId);
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
