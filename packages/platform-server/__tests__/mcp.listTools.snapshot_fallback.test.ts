import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LocalMCPServerNode } from '../src/nodes/mcp/localMcpServer.node';
import { createModuleRefStub } from './helpers/module-ref.stub';

class MockContainerService {
  getDocker() {
    return {};
  }
}

const makeEnvService = () => ({ resolveEnvItems: vi.fn(async () => ({})), resolveProviderEnv: vi.fn(async () => ({})) });

describe('LocalMCPServerNode listTools: snapshot-first, fallback-to-setState, namespacing', () => {
  let server: LocalMCPServerNode;
  let logger: { log: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    logger = { log: vi.fn(), error: vi.fn(), debug: vi.fn() };
    const nodeStateService = { getSnapshot: vi.fn((_id: string) => undefined) } as any; // snapshot not ready
    const moduleRef = createModuleRefStub({ get: () => nodeStateService });
    server = new LocalMCPServerNode(new MockContainerService() as any, makeEnvService() as any, {} as any, moduleRef);
    (server as any).init({ nodeId: 'node-x' });
    await server.setConfig({ namespace: 'ns' } as any);
    (server as any).preloadCachedTools(
      [
        { name: 'a', description: 'A', inputSchema: { type: 'object' } },
        { name: 'b', description: 'B', inputSchema: { type: 'object' } },
      ],
      Date.now(),
    );
    (server as any).logger = logger;
    (server as any).nodeStateService = nodeStateService;
  });

  it('returns [] when enabledTools is not provided', () => {
    const tools = server.listTools();
    expect(tools).toEqual([]);
  });

  it('falls back to setState enabledTools when snapshot is undefined', async () => {
    await server.setState({ mcp: { enabledTools: ['a', 'c'] } as any });
    const tools = server.listTools();
    expect(tools.map((t) => t.name)).toEqual(['ns_a']);
    expect(logger.log.mock.calls.find((c: any[]) => String(c[0]).includes('unknown tool'))).toBeTruthy();
  });

  it('accepts raw names from snapshot and maps to runtime namespaced form', async () => {
    const ns = { getSnapshot: vi.fn((_id: string) => ({ mcp: { enabledTools: ['a'] } })) } as any;
    (server as any).nodeStateService = ns;
    const tools = server.listTools();
    expect(tools.map((t) => t.name)).toEqual(['ns_a']);
  });
});
