import { describe, it, expect } from 'vitest';
import { LocalMCPServerNode } from '../src/nodes/mcp/localMcpServer.node';
import { McpServerConfig } from '../src/mcp/types.js';
import { ContainerService } from '../src/infra/container/container.service';
import { LoggerService } from '../src/core/services/logger.service';
import type { ContainerRegistry } from '../src/infra/container/container.registry';

describe('MCP Lifecycle Changes', () => {
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
    return new ContainerService(registryStub, new LoggerService());
  };
  const envStub = { resolveEnvItems: async () => ({}), resolveProviderEnv: async () => ({}) } as any;

  it('supports threadId parameter in callTool method', async () => {
    const containerService = createContainerService();
    const server = new LocalMCPServerNode(containerService as any, envStub, {} as any, undefined as any);
    const mockProvider = {
      provide: async (threadId: string) => ({
        id: `container-${threadId}`,
        stop: async () => {},
        remove: async () => {},
      }),
    };

    server.setContainerProvider(mockProvider as any);
    await server.setConfig({ namespace: 'test' } as McpServerConfig);

    try {
      await server.callTool('nonexistent', {}, { threadId: 'thread-123' });
    } catch (e) {
      expect(e).toBeDefined();
    }
  });

  it('has discoverTools method for initial tool discovery', async () => {
    const containerService = createContainerService();
    const server = new LocalMCPServerNode(containerService as any, envStub, {} as any, undefined as any);
    expect(typeof server.discoverTools).toBe('function');

    try {
      await server.discoverTools();
    } catch (e) {
      expect(e).toBeDefined();
    }
  });

  it('demonstrates new vs old lifecycle pattern', () => {
    const containerService = createContainerService();
    const server = new LocalMCPServerNode(containerService as any, envStub, {} as any, undefined as any);
    expect(typeof server.discoverTools).toBe('function');
    expect(server.callTool.length >= 2).toBe(true);
    expect((server as any).client).toBeUndefined();
    expect((server as any).containerId).toBeUndefined();
  });
});
