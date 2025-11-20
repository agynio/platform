import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LocalMCPServerNode } from '../src/nodes/mcp/localMcpServer.node';
import { LoggerService } from '../src/core/services/logger.service.js';
import { ContainerService } from '../src/infra/container/container.service';
import { PassThrough } from 'node:stream';

function createBlockingMcpMock() {
  const tools = [
    { name: 'echo', description: 'Echo back provided text', inputSchema: { type: 'object' } },
  ];
  let release: (() => void) | null = null;
  const gate = new Promise<void>((resolve) => (release = resolve));

  function createFreshStreamPair() {
    const inbound = new PassThrough();
    const outbound = new PassThrough();
    let buf = '';
    inbound.setEncoding('utf8');
    inbound.on('data', (chunk) => {
      buf += chunk;
      while (true) {
        const ix = buf.indexOf('\n');
        if (ix === -1) break;
        const line = buf.slice(0, ix).trim();
        buf = buf.slice(ix + 1);
        if (!line) continue;
        try {
          const msg = JSON.parse(line);
          void handle(msg);
        } catch {
          // ignore parse errors in test harness
        }
      }
    });
    const send = (o: any) => outbound.write(JSON.stringify(o) + '\n');
    async function handle(msg: any) {
      if (msg.method === 'initialize') {
        send({ jsonrpc: '2.0', id: msg.id, result: { protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'm', version: '0' } } });
        return;
      }
      if (msg.method === 'tools/list') {
        send({ jsonrpc: '2.0', id: msg.id, result: { tools } });
        return;
      }
      if (msg.method === 'tools/call') {
        await gate; // block until released
        send({ jsonrpc: '2.0', id: msg.id, result: { content: [{ type: 'text', text: 'ok' }] } });
        return;
      }
      if (msg.method === 'ping') {
        send({ jsonrpc: '2.0', id: msg.id, result: {} });
        return;
      }
      send({ jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: 'nf' } });
    }
    const stream: any = {
      write: (...a: any[]) => (inbound as any).write(...a),
      end: (...a: any[]) => (inbound as any).end(...a),
      pipe: (dest: any) => outbound.pipe(dest),
      on: (ev: string, h: any) => outbound.on(ev, h),
    };
    return { stream };
  }
  return { createFreshStreamPair, release: () => release && release() };
}

describe('LocalMCPServer heartbeat behavior', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('touches last_used during session and stops after completion', async () => {
    const logger = new LoggerService();
    const containerService = new ContainerService(logger);
    const docker: any = containerService.getDocker();
    const mock = createBlockingMcpMock();
    if (docker.modem) docker.modem.demuxStream = (s: any, out: any) => s.pipe(out);
    docker.getContainer = () => ({
      exec: async () => ({
        start: (_: any, cb: any) => {
          const { stream } = mock.createFreshStreamPair();
          cb(undefined, stream);
        },
        inspect: async () => ({ ExitCode: 0 }),
      }),
    });

    const envStub = { resolveEnvItems: async () => ({}), resolveProviderEnv: async () => ({}) } as any;
    const server = new LocalMCPServerNode(containerService as any, logger as any, envStub, {} as any, undefined as any);
    server.setContainerProvider({ provide: async (t: string) => ({ id: `cid-${t}` }) } as any);
    await server.setConfig({ namespace: 'mock', command: 'ignored', heartbeatIntervalMs: 100 } as any);

    const touchSpy = vi.spyOn(containerService, 'touchLastUsed').mockResolvedValue(undefined as any);

    const p = server.callTool('echo', { text: 'x' }, { threadId: 'thr', timeoutMs: 10 * 60 * 60 * 1000 });
    await Promise.resolve();
    await Promise.resolve();
    expect(touchSpy).toHaveBeenCalledTimes(1); // initial touch

    await vi.advanceTimersByTimeAsync(60_000);
    expect(touchSpy.mock.calls.length).toBeGreaterThanOrEqual(2);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(touchSpy.mock.calls.length).toBeGreaterThanOrEqual(3);

    mock.release();
    await p;
    const before = touchSpy.mock.calls.length;
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(touchSpy.mock.calls.length).toBe(before);
  });
});
