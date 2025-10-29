import { describe, it, expect, beforeEach } from 'vitest';
import { LocalMCPServerNode } from '../src/graph/nodes/mcp/localMcpServer.node';
import { LoggerService } from '../src/core/services/logger.service.js';
import { ContainerService } from '../src/infra/container/container.service';

describe('LocalMCPServer preload + staleness + persist', () => {
  let server: LocalMCPServerNode;
  let lastUpdate: { tools: any[]; updatedAt: number } | null = null;

  beforeEach(async () => {
    const logger = new LoggerService();
    const cs = new ContainerService(logger);
    server = new LocalMCPServerNode(cs as any, logger as any, undefined as any, undefined as any, undefined as any);
    await server.setConfig({ namespace: 'x', command: 'echo' } as any);
    (server as any).setContainerProvider({ provide: async () => ({ id: 'cid', stop: async () => {}, remove: async () => {} }) });
    (server as any).on('mcp.tools_updated', (p: { tools: any[]; updatedAt: number }) => { lastUpdate = p; });
  });

  it('preloads cached tools and persists after discovery', async () => {
    // Preload
    (server as any).preloadCachedTools([{ name: 'cached', description: 'd', inputSchema: { type: 'object' } } as any], Date.now() - 1000);
    // Force discovery by marking stale
    await server.setConfig({ namespace: 'x', command: 'echo', staleTimeoutMs: 1 } as any);
    // Stub discoverTools to avoid docker
    (server as any).discoverTools = async function() { (this as any).preloadCachedTools([{ name: 'fresh', description: 'd', inputSchema: { type: 'object' } }], Date.now()); return (this as any).listTools(); };
    await (server as any).provision();
    const tools = server.listTools();
    expect(tools.find((t) => String(t.name).endsWith('_fresh'))).toBeTruthy();
    expect(typeof lastUpdate?.updatedAt).toBe('number');
  });
});
