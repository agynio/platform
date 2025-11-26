import { Injectable } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PassThrough } from 'node:stream';
import type { AddressInfo } from 'net';
import WebSocket from 'ws';
import { ContainerTerminalController } from '../../src/infra/container/containerTerminal.controller';
import { ContainerTerminalGateway } from '../../src/infra/container/terminal.gateway';
import { TerminalSessionsService } from '../../src/infra/container/terminal.sessions.service';
import { ContainerService } from '../../src/infra/container/container.service';
import { waitFor, waitForWsClose } from '../helpers/ws';

type TerminalMessage = {
  type?: string;
  phase?: string;
  data?: unknown;
  raw?: string;
};

@Injectable()
class TestContainerService {
  public stdin?: PassThrough;
  public stdout?: PassThrough;
  public closeCalls = 0;
  public readonly resizes: Array<{ execId: string; cols: number; rows: number }> = [];

  async execContainer(_containerId: string, _command: string | string[], _opts?: unknown) {
    return { stdout: '/bin/bash\n', stderr: '', exitCode: 0 };
  }

  async openInteractiveExec(_containerId: string, _command: string | string[], _opts?: unknown) {
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    this.stdin = stdin;
    this.stdout = stdout;

    let buffer = '';
    stdin.on('data', (chunk: Buffer) => {
      buffer += chunk.toString('utf8');
      while (buffer.includes('\r')) {
        const idx = buffer.indexOf('\r');
        const raw = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 1);
        const command = raw.trim();
        if (!command) continue;
        if (command.startsWith('echo ')) {
          const message = command.slice(5);
          setImmediate(() => stdout.write(`${message}\n`));
        } else if (command === 'whoami') {
          setImmediate(() => stdout.write('test-user\n'));
        } else {
          setImmediate(() => stdout.write(`unknown:${command}\n`));
        }
      }
    });

    const close = async () => {
      this.closeCalls += 1;
      setImmediate(() => stdout.end());
      return { exitCode: 0 };
    };

    return { stdin, stdout, stderr: undefined, close, execId: 'exec-test' };
  }

  async resizeExec(execId: string, size: { cols: number; rows: number }) {
    this.resizes.push({ execId, ...size });
  }
}

describe('ContainerTerminalGateway E2E', () => {
  let app: NestFastifyApplication;
  let containerService: TestContainerService;
  let baseUrl: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ContainerTerminalController],
      providers: [
        ContainerTerminalGateway,
        TerminalSessionsService,
        { provide: ContainerService, useClass: TestContainerService },
      ],
    }).compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();

    const fastify = app.getHttpAdapter().getInstance();
    const gateway = app.get(ContainerTerminalGateway);
    gateway.registerRoutes(fastify);
    await app.listen(0, '127.0.0.1');

    const addressInfo = fastify.server.address() as AddressInfo;
    if (!addressInfo || typeof addressInfo.port !== 'number') {
      throw new Error('Failed to determine Fastify listen port');
    }
    baseUrl = `http://127.0.0.1:${addressInfo.port}`;

    containerService = app.get(ContainerService) as unknown as TestContainerService;
  });

  afterAll(async () => {
    await app.close();
  });

  it('supports full websocket terminal lifecycle', async () => {
    const fastify = app.getHttpAdapter().getInstance();
    const containerId = 'c'.repeat(64);

    const sessionResponse = await fastify.inject({
      method: 'POST',
      url: `/api/containers/${containerId}/terminal/sessions`,
      payload: { cols: 120, rows: 32 },
    });
    expect(sessionResponse.statusCode).toBe(201);
    const { sessionId, token } = sessionResponse.json() as { sessionId: string; token: string };

    const messages: TerminalMessage[] = [];
    const wsUrl = new URL(baseUrl);
    wsUrl.protocol = wsUrl.protocol === 'https:' ? 'wss:' : 'ws:';
    wsUrl.pathname = `/api/containers/${containerId}/terminal/ws`;
    wsUrl.search = new URLSearchParams({ sessionId, token }).toString();

    const ws = new WebSocket(wsUrl.toString());
    ws.on('message', (payload) => {
      const text = typeof payload === 'string' ? payload : payload.toString('utf8');
      try {
        messages.push(JSON.parse(text) as TerminalMessage);
      } catch {
        messages.push({ raw: text });
      }
    });

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        ws.removeAllListeners('open');
        ws.removeAllListeners('error');
        reject(new Error('Timed out waiting for terminal websocket open'));
      }, 3000);
      ws.once('open', () => {
        clearTimeout(timer);
        resolve();
      });
      ws.once('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });

    await waitFor(() => messages.some((msg) => msg.type === 'status' && msg.phase === 'running'), 2000);

    ws.send(JSON.stringify({ type: 'input', data: 'echo hi\n' }));
    await waitFor(
      () => messages.some((msg) => msg.type === 'output' && typeof msg.data === 'string' && msg.data.includes('hi')),
      2000,
    );

    ws.send(JSON.stringify({ type: 'input', data: 'whoami\n' }));
    await waitFor(
      () => messages.some((msg) => msg.type === 'output' && typeof msg.data === 'string' && msg.data.includes('test-user')),
      2000,
    );

    ws.send(JSON.stringify({ type: 'resize', cols: 150, rows: 48 }));
    await waitFor(() => containerService.resizes.some((item) => item.cols === 150 && item.rows === 48), 2000);

    ws.send(JSON.stringify({ type: 'close' }));
    const closeInfo = await waitForWsClose(ws, 3000);

    expect([1000, 1005]).toContain(closeInfo.code);
    expect(messages.some((msg) => msg.type === 'status' && msg.phase === 'exited')).toBe(true);
    expect(messages.some((msg) => msg.type === 'error')).toBe(false);
    expect(containerService.closeCalls).toBeGreaterThan(0);
  });
});
