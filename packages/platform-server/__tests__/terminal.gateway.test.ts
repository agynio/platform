import { PassThrough } from 'node:stream';
import Fastify from 'fastify';
import type { AddressInfo } from 'net';
import WebSocket from 'ws';
import { describe, expect, it, vi } from 'vitest';

import { ContainerTerminalGateway } from '../src/infra/container/terminal.gateway';
import type { TerminalSessionsService, TerminalSessionRecord } from '../src/infra/container/terminal.sessions.service';
import type { ContainerService } from '../src/infra/container/container.service';
import { waitFor, waitForWsClose } from './helpers/ws';

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

const createSessionServiceHarness = (overrides: Partial<TerminalSessionRecord> = {}) => {
  let current: TerminalSessionRecord | null = createSessionRecord(overrides);
  const baseRecord = current;
  const service = {
    validate: vi.fn((sessionId: string, token: string) => {
      if (!current || current.sessionId !== sessionId) throw new Error('session_not_found');
      if (current.token !== token) throw new Error('invalid_token');
      return current;
    }),
    markConnected: vi.fn((sessionId: string) => {
      if (!current || current.sessionId !== sessionId) throw new Error('session_not_found');
      if (current.state === 'connected') throw new Error('session_already_connected');
      current.state = 'connected';
      current.lastActivityAt = Date.now();
    }),
    get: vi.fn((sessionId: string) => (current && current.sessionId === sessionId ? current : undefined)),
    touch: vi.fn((sessionId: string) => {
      if (current && current.sessionId === sessionId) {
        current.lastActivityAt = Date.now();
      }
    }),
    close: vi.fn((sessionId: string) => {
      if (current && current.sessionId === sessionId) {
        current = null;
      }
    }),
  };

  return {
    service,
    baseRecord,
    getRecord: () => current,
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
    const record = createSessionRecord({ containerId: 'a'.repeat(64) });
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
    const record = createSessionRecord({
      shell: '/bin/bash',
      cols: 120,
      rows: 32,
      maxDurationMs: 300_000,
      containerId: 'b'.repeat(64),
    });
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
    setImmediate(() => {
      stdout.write('BOOTSTRAP_OK\nLANG=C.UTF-8\nLC_ALL=C.UTF-8\nTERM=xterm-256color\nSTTY=... iutf8\n');
    });
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
    );

    const app = Fastify();
    gateway.registerRoutes(app);
    const port = await listenFastify(app);

    const messages: { type?: string; phase?: string; data?: unknown }[] = [];
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
    await waitFor(
      () => messages.some((msg) => msg.type === 'output' && typeof msg.data === 'string' && msg.data.includes('BOOTSTRAP_OK')),
      3000,
    );
    expect(containerMocks.openInteractiveExec).toHaveBeenCalledWith(
      record.containerId,
      expect.stringContaining('BOOTSTRAP_OK'),
      expect.objectContaining({
        env: expect.objectContaining({ TERM: 'xterm-256color', LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' }),
        tty: true,
      }),
    );

    ws.send(JSON.stringify({ type: 'input', data: 'echo hi\r\n' }));
    await waitFor(() => stdinBuffer.endsWith('echo hi\r'));
    expect(stdinBuffer).toBe('echo hi\r');

    ws.close();
    const closeInfo = await waitForWsClose(ws, 3000);

    expect([1000, 1005]).toContain(closeInfo.code);
    expect(closeExec).toHaveBeenCalled();
    expect(sessionMocks.close).toHaveBeenCalledWith(record.sessionId);

    await app.close();
  });

  it('replays history for arrow-up input without leaking escape text', async () => {
    const harness = createSessionServiceHarness({
      shell: '/bin/bash',
      containerId: 'c'.repeat(64),
      cols: 120,
      rows: 32,
      maxDurationMs: 300_000,
    });

    const sessionMocks = harness.service as unknown as TerminalSessionsService;
    const record = harness.getRecord();
    if (!record) {
      throw new Error('expected active terminal session');
    }

    const stdin = new PassThrough();
    const stdout = new PassThrough();
    setImmediate(() => {
      stdout.write('BOOTSTRAP_OK\nLANG=C.UTF-8\nLC_ALL=C.UTF-8\nTERM=xterm-256color\nSTTY=... iutf8\n');
    });
    const closeExec = vi.fn().mockResolvedValue({ exitCode: 0 });

    const containerMocks = {
      execContainer: vi.fn().mockResolvedValue({ stdout: 'C.UTF-8\n', stderr: '', exitCode: 0 }),
      openInteractiveExec: vi.fn().mockResolvedValue({
        stdin,
        stdout,
        stderr: undefined,
        close: closeExec,
        execId: 'exec-history',
      }),
      resizeExec: vi.fn().mockResolvedValue(undefined),
    } as unknown as ContainerService;

    const gateway = new ContainerTerminalGateway(sessionMocks, containerMocks);

    let stdinBuffer = '';
    let pending = '';
    const history: string[] = [];

    stdin.on('data', (chunk) => {
      const text = chunk.toString('utf8');
      stdinBuffer += text;
      pending += text;

      const processArrows = () => {
        const escIndex = pending.indexOf('\u001b');
        if (escIndex === -1) {
          return false;
        }
        if (pending.length < escIndex + 3) {
          return false; // wait for full sequence
        }
        const sequence = pending.slice(escIndex, escIndex + 3);
        if (sequence === '\u001b[A') {
          pending = pending.slice(0, escIndex) + pending.slice(escIndex + 3);
          const last = history[history.length - 1];
          if (last) {
            setImmediate(() => {
              stdout.write(last);
            });
          }
          return true;
        }
        return false;
      };

      while (processArrows()) {
        // keep processing until no additional arrow sequences remain
      }

      while (pending.includes('\r')) {
        const idx = pending.indexOf('\r');
        const raw = pending.slice(0, idx);
        pending = pending.slice(idx + 1);
        const command = raw.trim();
        if (!command) {
          continue;
        }
        if (command.startsWith('stty') || command.startsWith('export')) {
          continue;
        }
        history.push(command);
        setImmediate(() => {
          stdout.write(`${command}\r\n`);
        });
      }
    });

    const app = Fastify();
    gateway.registerRoutes(app);
    const port = await listenFastify(app);

    const messages: { type?: string; data?: unknown; phase?: string }[] = [];
    const ws = new WebSocket(
      `ws://127.0.0.1:${port}/api/containers/${record.containerId}/terminal/ws?sessionId=${record.sessionId}&token=${record.token}`,
    );
    ws.on('message', (payload) => {
      const text = typeof payload === 'string' ? payload : payload.toString('utf8');
      try {
        messages.push(JSON.parse(text) as { type?: string; data?: unknown });
      } catch {
        messages.push({ data: text });
      }
    });

    await waitFor(() => messages.some((msg) => msg.type === 'status' && msg.phase === 'running'), 3000);
    await waitFor(
      () => messages.some((msg) => msg.type === 'output' && typeof msg.data === 'string' && msg.data.includes('BOOTSTRAP_OK')),
      3000,
    );
    messages.length = 0;

    ws.send(JSON.stringify({ type: 'input', data: 'echo first\r\n' }));
    await waitFor(
      () => messages.some((msg) => msg.type === 'output' && typeof msg.data === 'string' && msg.data.includes('echo first')),
      3000,
    );
    messages.length = 0;

    ws.send(JSON.stringify({ type: 'input', data: 'echo second\r\n' }));
    await waitFor(
      () => messages.some((msg) => msg.type === 'output' && typeof msg.data === 'string' && msg.data.includes('echo second')),
      3000,
    );
    messages.length = 0;

    ws.send(JSON.stringify({ type: 'input', data: '\u001b[A' }));
    await waitFor(
      () => messages.some((msg) => msg.type === 'output' && typeof msg.data === 'string' && msg.data.includes('echo second')),
      3000,
    );

    expect(
      messages.some((msg) => msg.type === 'output' && typeof msg.data === 'string' && msg.data.includes('[A')),
    ).toBe(false);
    expect(stdinBuffer).toContain('\u001b[A');

    ws.send(JSON.stringify({ type: 'close' }));
    await waitForWsClose(ws, 3000);

    await app.close();
  });

  describe('docker multiplex decoding', () => {
    const createFrame = (data: string): Buffer => {
      const payload = Buffer.from(data, 'utf8');
      const frame = Buffer.alloc(8 + payload.length);
      frame.writeUInt8(1, 0);
      frame.writeUInt8(0, 1);
      frame.writeUInt8(0, 2);
      frame.writeUInt8(0, 3);
      frame.writeUInt32BE(payload.length, 4);
      payload.copy(frame, 8);
      return frame;
    };

    const setupMuxHarness = async () => {
      const harness = createSessionServiceHarness({
        shell: '/bin/bash',
        containerId: 'd'.repeat(64),
      });
      const sessionMocks = harness.service as unknown as TerminalSessionsService;
      const record = harness.getRecord();
      if (!record) {
        throw new Error('expected active terminal session');
      }

      const stdin = new PassThrough();
      const stdout = new PassThrough();
      setImmediate(() => {
        stdout.write('BOOTSTRAP_OK\n');
      });
      const closeExec = vi.fn().mockResolvedValue({ exitCode: 0 });

      const containerMocks = {
        openInteractiveExec: vi.fn().mockResolvedValue({
          stdin,
          stdout,
          stderr: undefined,
          close: closeExec,
          execId: 'exec-mux',
        }),
        resizeExec: vi.fn().mockResolvedValue(undefined),
      } as unknown as ContainerService;

      const gateway = new ContainerTerminalGateway(sessionMocks, containerMocks);

      const app = Fastify();
      gateway.registerRoutes(app);
      const port = await listenFastify(app);

      const messages: { type?: string; data?: unknown; phase?: string }[] = [];
      const ws = new WebSocket(
        `ws://127.0.0.1:${port}/api/containers/${record.containerId}/terminal/ws?sessionId=${record.sessionId}&token=${record.token}`,
      );
      ws.on('message', (payload) => {
        const text = typeof payload === 'string' ? payload : payload.toString('utf8');
        try {
          messages.push(JSON.parse(text) as { type?: string; data?: unknown; phase?: string });
        } catch {
          messages.push({ data: text });
        }
      });

      await waitFor(() => messages.some((msg) => msg.type === 'status' && msg.phase === 'running'), 3000);
      await waitFor(
        () => messages.some((msg) => msg.type === 'output' && typeof msg.data === 'string' && msg.data.includes('BOOTSTRAP_OK')),
        3000,
      );
      messages.length = 0;

      return {
        stdout,
        messages,
        ws,
        async cleanup() {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'close' }));
            await waitForWsClose(ws, 3000);
          } else if (ws.readyState === WebSocket.CONNECTING) {
            await new Promise((resolve) => ws.once('open', resolve));
            ws.send(JSON.stringify({ type: 'close' }));
            await waitForWsClose(ws, 3000);
          } else if (ws.readyState === WebSocket.CLOSING) {
            await waitForWsClose(ws, 3000);
          }
          await app.close();
        },
      };
    };

    const expectForwarded = async (chunks: Buffer[]) => {
      const harness = await setupMuxHarness();
      try {
        for (const chunk of chunks) {
          harness.stdout.write(chunk);
        }

        await waitFor(
          () =>
            harness.messages.some(
              (msg) => msg.type === 'output' && typeof msg.data === 'string' && msg.data.includes('hello'),
            ),
          3000,
        );
        const forwarded = harness.messages.find((msg) => msg.type === 'output')?.data;
        expect(forwarded).toBe('hello\n');
        expect(typeof forwarded === 'string' && forwarded.includes('\u0001')).toBe(false);
      } finally {
        await harness.cleanup();
      }
    };

    it('strips multiplex headers delivered in a single chunk', async () => {
      const frame = createFrame('hello\n');
      await expectForwarded([frame]);
    });

    it.each([
      ['split header 1/7', [1]],
      ['split header 4/4', [4]],
      ['split header 7/1', [7]],
      ['split header 2/3/3', [2, 5]],
    ])('strips multiplex headers with %s', async (_label, splitSizes) => {
      const frame = createFrame('hello\n');
      const header = frame.subarray(0, 8);
      const payload = frame.subarray(8);
      const chunks: Buffer[] = [];
      let offset = 0;
      for (const size of splitSizes) {
        const end = Math.min(offset + size, 8);
        if (end > offset) {
          chunks.push(header.subarray(offset, end));
        }
        offset = end;
      }
      if (offset < 8) {
        chunks.push(header.subarray(offset, 8));
      }
      chunks.push(payload);
      await expectForwarded(chunks);
    });

    it.each([
      ['payload split 2+rest', [2]],
      ['payload split 1+2+rest', [1, 3]],
    ])('strips multiplex headers when %s', async (_label, splitPoints) => {
      const frame = createFrame('hello\n');
      const header = frame.subarray(0, 8);
      const payload = frame.subarray(8);
      const chunks: Buffer[] = [header];
      let offset = 0;
      for (const size of splitPoints) {
        const end = Math.min(offset + size, payload.length);
        if (end > offset) {
          chunks.push(payload.subarray(offset, end));
        }
        offset = end;
      }
      if (offset < payload.length) {
        chunks.push(payload.subarray(offset));
      }
      await expectForwarded(chunks);
    });
  });

  it('aborts exec when socket closes before start', async () => {
    const record = createSessionRecord({
      containerId: 'c'.repeat(64),
    });
    const sessionMocks = {
      validate: vi.fn().mockReturnValue(record),
      markConnected: vi.fn().mockImplementation(() => {
        record.state = 'connected';
      }),
      get: vi.fn().mockReturnValue(record),
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
    );

    const app = Fastify();
    gateway.registerRoutes(app);
    const port = await listenFastify(app);

    const ws = new WebSocket(
      `ws://127.0.0.1:${port}/api/containers/${record.containerId}/terminal/ws?sessionId=${record.sessionId}&token=${record.token}`,
    );

    await new Promise<void>((resolve) => ws.once('open', resolve));
    ws.close();

    const closeInfo = await waitForWsClose(ws, 3000);
    expect(containerMocks.openInteractiveExec).not.toHaveBeenCalled();
    expect(sessionMocks.markConnected).not.toHaveBeenCalled();
    expect(sessionMocks.close).not.toHaveBeenCalled();
    expect(sessionMocks.touch).toHaveBeenCalledWith(record.sessionId);
    expect([1000, 1005, 1006]).toContain(closeInfo.code);

    await app.close();
  });

  it('allows reconnecting after early close before exec start', async () => {
    const harness = createSessionServiceHarness({
      containerId: 'd'.repeat(64),
    });
    const sessionService = harness.service;
    const record = harness.baseRecord;

    const containerMocks = {
      openInteractiveExec: vi.fn().mockImplementation(() => {
        const stdin = new PassThrough();
        const stdout = new PassThrough();
        const closeExec = vi.fn().mockResolvedValue({ exitCode: 0 });
        return {
          stdin,
          stdout,
          stderr: undefined,
          close: closeExec,
          execId: 'exec-reconnect',
        };
      }),
      resizeExec: vi.fn().mockResolvedValue(undefined),
    } satisfies Partial<ContainerService>;

    const gateway = new ContainerTerminalGateway(
      sessionService as unknown as TerminalSessionsService,
      containerMocks as unknown as ContainerService,
    );

    const app = Fastify();
    gateway.registerRoutes(app);
    const port = await listenFastify(app);

    const firstMessages: Array<Record<string, unknown>> = [];
    const ws1 = new WebSocket(
      `ws://127.0.0.1:${port}/api/containers/${record.containerId}/terminal/ws?sessionId=${record.sessionId}&token=${record.token}`,
    );
    ws1.on('message', (data) => {
      const text = typeof data === 'string' ? data : data.toString('utf8');
      try {
        firstMessages.push(JSON.parse(text) as Record<string, unknown>);
      } catch {
        // ignore non-json
      }
    });

    await new Promise<void>((resolve) => ws1.once('open', resolve));
    ws1.close();
    await waitForWsClose(ws1, 3000);

    expect(containerMocks.openInteractiveExec).not.toHaveBeenCalled();
    expect(sessionService.markConnected).not.toHaveBeenCalled();
    expect(sessionService.close).not.toHaveBeenCalled();
    expect(sessionService.touch).toHaveBeenCalledWith(record.sessionId);
    expect(firstMessages).toHaveLength(0);

    containerMocks.openInteractiveExec.mockClear();
    sessionService.validate.mockClear();
    sessionService.touch.mockClear();
    sessionService.markConnected.mockClear();
    sessionService.close.mockClear();

    const secondMessages: Array<{ type?: string; phase?: string }> = [];
    const ws2 = new WebSocket(
      `ws://127.0.0.1:${port}/api/containers/${record.containerId}/terminal/ws?sessionId=${record.sessionId}&token=${record.token}`,
    );
    ws2.on('message', (data) => {
      const text = typeof data === 'string' ? data : data.toString('utf8');
      try {
        secondMessages.push(JSON.parse(text) as { type?: string; phase?: string });
      } catch {
        // ignore non-json
      }
    });

    await waitFor(() => secondMessages.some((msg) => msg.type === 'status' && msg.phase === 'running'), 3000);

    expect(containerMocks.openInteractiveExec).toHaveBeenCalledTimes(1);
    expect(sessionService.markConnected).toHaveBeenCalledWith(record.sessionId);
    expect(harness.getRecord()).not.toBeNull();

    ws2.close();
    await waitForWsClose(ws2, 3000);

    expect(sessionService.close).toHaveBeenCalledWith(record.sessionId);
    expect(harness.getRecord()).toBeNull();

    await app.close();
  });

  it('removes session after exec close preventing reconnect', async () => {
    const harness = createSessionServiceHarness({
      containerId: 'e'.repeat(64),
    });
    const sessionService = harness.service;
    const record = harness.baseRecord;

    const stdin = new PassThrough();
    const stdout = new PassThrough();
    const closeExec = vi.fn().mockResolvedValue({ exitCode: 0 });
    const containerMocks = {
      openInteractiveExec: vi.fn().mockResolvedValue({
        stdin,
        stdout,
        stderr: undefined,
        close: closeExec,
        execId: 'exec-final',
      }),
      resizeExec: vi.fn().mockResolvedValue(undefined),
    } satisfies Partial<ContainerService>;

    const gateway = new ContainerTerminalGateway(
      sessionService as unknown as TerminalSessionsService,
      containerMocks as unknown as ContainerService,
    );

    const app = Fastify();
    gateway.registerRoutes(app);
    const port = await listenFastify(app);

    const messages: Array<{ type?: string; phase?: string }> = [];
    const ws = new WebSocket(
      `ws://127.0.0.1:${port}/api/containers/${record.containerId}/terminal/ws?sessionId=${record.sessionId}&token=${record.token}`,
    );
    ws.on('message', (data) => {
      const text = typeof data === 'string' ? data : data.toString('utf8');
      try {
        messages.push(JSON.parse(text) as { type?: string; phase?: string });
      } catch {
        // ignore non-json
      }
    });

    await waitFor(() => messages.some((msg) => msg.type === 'status' && msg.phase === 'running'), 3000);

    expect(containerMocks.openInteractiveExec).toHaveBeenCalledTimes(1);
    expect(sessionService.markConnected).toHaveBeenCalledWith(record.sessionId);

    ws.close();
    await waitForWsClose(ws, 3000);

    expect(sessionService.close).toHaveBeenCalledWith(record.sessionId);
    expect(harness.getRecord()).toBeNull();

    containerMocks.openInteractiveExec.mockClear();
    sessionService.validate.mockClear();

    const reconnectMessages: Array<Record<string, unknown>> = [];
    const wsReconnect = new WebSocket(
      `ws://127.0.0.1:${port}/api/containers/${record.containerId}/terminal/ws?sessionId=${record.sessionId}&token=${record.token}`,
    );
    wsReconnect.on('message', (data) => {
      const text = typeof data === 'string' ? data : data.toString('utf8');
      try {
        reconnectMessages.push(JSON.parse(text) as Record<string, unknown>);
      } catch {
        // ignore non-json
      }
    });

    const reconnectClose = await waitForWsClose(wsReconnect, 3000);

    expect(reconnectClose.code).toBe(1008);
    expect(reconnectClose.reason).toBe('session_not_found');
    expect(containerMocks.openInteractiveExec).not.toHaveBeenCalled();
    const errorFrame = reconnectMessages.find((msg) => msg.type === 'error');
    expect(errorFrame).toMatchObject({ code: 'session_not_found', message: 'Terminal session validation failed' });

    await app.close();
  });
});
