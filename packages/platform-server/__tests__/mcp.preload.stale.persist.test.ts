import { describe, it, expect, beforeEach } from 'vitest';
import { LocalMCPServer } from '../src/nodes/mcp/localMcpServer.node';
import { LoggerService } from '../src/core/services/logger.service.js';
import { ContainerService } from '../src/core/services/container.service.js';

describe('LocalMCPServer preload + staleness + persist', () => {
  let server: LocalMCPServer;
  let persisted: any = null;

  beforeEach(async () => {
    const logger = new LoggerService();
    const cs = new ContainerService(logger);
    server = new LocalMCPServer(cs as any, logger as any, undefined as any, undefined as any, undefined as any);
    await server.setConfig({ namespace: 'x', command: 'echo' } as any);
    (server as any).setContainerProvider({ provide: async () => ({ id: 'cid', stop: async () => {}, remove: async () => {} }) });
    server.setStatePersistor((s) => { persisted = s; });
  });

  it('preloads cached tools and persists after discovery', async () => {
    // Preload
    server.preloadCachedToolSummaries([{ name: 'cached' } as any], Date.now() - 1000);
    // Force discovery by marking stale
    server.setGlobalStaleTimeoutMs(1);
    // Stub discoverTools to avoid docker
    (server as any).discoverTools = async function() { (this as any).toolsCache = [{ name: 'fresh' }]; (this as any).toolsDiscovered = true; (this as any).lastToolsUpdatedAt = Date.now(); await (this as any).statePersistor?.({ mcp: { tools: (this as any).toolsCache, toolsUpdatedAt: (this as any).lastToolsUpdatedAt } }); return (this as any).toolsCache; };
    await (server as any).provision();
    const tools = server.listTools();
    expect(tools.find((t) => t.name === 'fresh')).toBeTruthy();
    expect(persisted?.mcp?.tools?.[0]?.name).toBe('fresh');
    expect(typeof persisted?.mcp?.toolsUpdatedAt).toBe('number');
  });
});
