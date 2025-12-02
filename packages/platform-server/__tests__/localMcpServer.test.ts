import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { LocalMCPServerNode } from '../src/nodes/mcp/localMcpServer.node';
import { McpServerConfig } from '../src/mcp/types.js';
import { PassThrough } from 'node:stream';
import { ContainerService } from '../src/infra/container/container.service';
import type { ContainerRegistry } from '../src/infra/container/container.registry';
import { createModuleRefStub } from './helpers/module-ref.stub';
// no extra imports

/**
 * In-process mock MCP server (no subprocess) using PassThrough streams.
 * Creates fresh streams for each exec call to simulate real docker behavior.
 */
function createInProcessMock() {
  const tools = [
    {
      name: 'echo',
      description: 'Echo back provided text',
      inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
    },
  ];

  function createFreshStreamPair() {
    const inbound = new PassThrough(); // what client writes to
    const outbound = new PassThrough(); // what server writes to

    let buffer = '';
    inbound.setEncoding('utf8');
    inbound.on('data', (chunk) => {
      buffer += chunk;
      while (true) {
        const idx = buffer.indexOf('\n');
        if (idx === -1) break;
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        if (!line) continue;
        try {
          const msg = JSON.parse(line);
          handle(msg);
        } catch {
          /* ignore */
        }
      }
    });

    function send(obj: any) {
      outbound.write(JSON.stringify(obj) + '\n');
    }

    function handle(msg: any) {
      if (msg.method === 'initialize') {
        send({
          jsonrpc: '2.0',
          id: msg.id,
          result: {
            protocolVersion: '2025-06-18',
            capabilities: { tools: {} },
            serverInfo: { name: 'mock', version: '0.0.1' },
          },
        });
        return;
      }
      if (msg.method === 'ping') {
        send({ jsonrpc: '2.0', id: msg.id, result: {} });
        return;
      }
      if (msg.method === 'tools/list') {
        send({ jsonrpc: '2.0', id: msg.id, result: { tools } });
        return;
      }
      if (msg.method === 'tools/call') {
        const args = msg.params || {};
        if (args.name === 'echo') {
          const text = args.arguments?.text ?? '';
          send({ jsonrpc: '2.0', id: msg.id, result: { content: [{ type: 'text', text: `echo:${text}` }] } });
          return;
        }
        send({
          jsonrpc: '2.0',
          id: msg.id,
          result: { isError: true, content: [{ type: 'text', text: `unknown tool ${args.name}` }] },
        });
        return;
      }
      send({ jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: 'Method not found' } });
    }

    // Pseudo-duplex stream object used by DockerExecTransport (expects stream.pipe + write/end)
    const stream: any = {
      write: (...a: any[]) => (inbound as any).write(...a),
      end: (...a: any[]) => (inbound as any).end(...a),
      pipe: (dest: any) => outbound.pipe(dest),
      on: (event: string, handler: any) => outbound.on(event, handler),
    };

    return { stream };
  }

  return { createFreshStreamPair };
}

describe('LocalMCPServer (mock)', () => {
  let server: LocalMCPServerNode;
  let containerService: ContainerService;

  const createContainerService = () => {
    const registryStub = {
      registerStart: async () => {},
      updateLastUsed: async () => {},
      markStopped: async () => {},
      markTerminating: async () => {},
      claimForTermination: async () => true,
      recordTerminationFailure: async () => {},
      findByVolume: async () => null,
      listByThread: async () => [],
      ensureIndexes: async () => {},
    } as unknown as ContainerRegistry;
    return new ContainerService(registryStub);
  };

  beforeAll(async () => {
    containerService = createContainerService();
    // Mock docker exec via getDocker override
    const docker: any = containerService.getDocker();
    const mock = createInProcessMock();
    // Override demuxStream to simple pass-through for mock (non-multiplexed) stream
    if (docker.modem) {
      docker.modem.demuxStream = (stream: any, stdout: any, _stderr: any) => {
        stream.pipe(stdout);
      };
    }
    docker.getContainer = () => ({
      exec: async () => ({
        start: (_opts: any, cb: any) => {
          // Create fresh stream for each exec call
          const { stream } = mock.createFreshStreamPair();
          cb(undefined, stream);
        },
        inspect: async () => ({ ExitCode: 0 }),
      }),
    });
    const envStub = { resolveEnvItems: async () => ({}), resolveProviderEnv: async () => ({}) } as any;
    server = new LocalMCPServerNode(containerService as any, envStub, {} as any, createModuleRefStub());
    // Provide a dummy container provider to satisfy start precondition (reuse mocked docker above)
    const mockProvider = {
      provide: async (threadId: string) => ({ 
        id: `mock-container-${threadId}`,
        stop: async () => {},
        remove: async () => {}
      })
    };
    (server as any).setContainerProvider(mockProvider);
    const cfg: McpServerConfig = { namespace: 'mock', command: 'ignored' } as any;
    await server.setConfig(cfg);
    await server.provision();
  }, 10000);

  afterAll(async () => {
    await server.deprovision();
  });

  it('lists tools when enabledTools are provided', async () => {
    expect(server.listTools()).toEqual([]);
    await server.setState({ mcp: { enabledTools: ['echo'] } as any });
    const tools = server.listTools();
    expect(tools.find((t) => String(t.name).endsWith('_echo'))).toBeTruthy();
  });

  it('calls tool', async () => {
    const result = await server.callTool('echo', { text: 'hello' }, { threadId: 'test-thread' });
    expect(result.content).toContain('echo:hello');
  });

  it('emits unified tools_updated events', async () => {
    let lastPayload: { tools: any[]; updatedAt: number } | null = null;
    (server as any).on('mcp.tools_updated', (p: { tools: any[]; updatedAt: number }) => {
      lastPayload = p;
    });
    // Preload cached tools -> should emit tools_updated
    (server as any).preloadCachedTools([{ name: 'pre' }], Date.now());
    expect(lastPayload).toBeTruthy();
    expect(Array.isArray(lastPayload!.tools)).toBe(true);
    // Dynamic config path removed; ensure discover emits update
    // Re-discovery via manual call -> should emit tools_updated
    await (server as any).discoverTools();
    expect(lastPayload).toBeTruthy();
    expect(typeof lastPayload!.updatedAt).toBe('number');
  });
});
