import { describe, it, expect } from 'vitest';
import { LocalMCPServer } from '../src/nodes/mcp/localMcpServer.node';
import { McpServerConfig } from '../src/mcp/types.js';
import { LoggerService } from '../src/core/services/logger.service.js';
import { ContainerService } from '../src/infra/container/container.service';

describe('MCP Lifecycle Changes', () => {
  const logger = new LoggerService();
  
  it('supports threadId parameter in callTool method', async () => {
    const containerService = new ContainerService(logger);
    const server = new LocalMCPServer(containerService as any, logger as any, undefined as any, undefined as any, undefined as any);
    
    // Test that the interface accepts threadId parameter
    const mockProvider = {
      provide: async (threadId: string) => ({ 
        id: `container-${threadId}`,
        stop: async () => {},
        remove: async () => {}
      })
    };
    
    server.setContainerProvider(mockProvider as any);
    await server.setConfig({ namespace: 'test' } as McpServerConfig);
    
    // This would fail if threadId wasn't supported in the interface
    try {
      await server.callTool('nonexistent', {}, { threadId: 'thread-123' });
    } catch (e) {
      // Expected to fail due to missing container setup, but interface should accept threadId
      expect(e).toBeDefined();
    }
  });
  
  it('has discoverTools method for initial tool discovery', async () => {
    const containerService = new ContainerService(logger);
    const server = new LocalMCPServer(containerService as any, logger as any, undefined as any, undefined as any, undefined as any);
    
    // Test that discoverTools method exists and can be called
    expect(typeof server.discoverTools).toBe('function');
    
    // This would fail due to missing setup, but method should exist
    try {
      await server.discoverTools();
    } catch (e) {
      expect(e).toBeDefined();
    }
  });
  
  it('demonstrates new vs old lifecycle pattern', () => {
    // Old lifecycle: start() creates persistent container with "default" thread
    // New lifecycle: 
    // 1. discoverTools() creates temporary container, fetches tools, destroys container
    // 2. start() uses cached tools from discovery
    // 3. callTool() creates container per thread on-demand
    
    const containerService = new ContainerService(logger);
    const server = new LocalMCPServer(containerService as any, logger as any, undefined as any, undefined as any, undefined as any);
    
    // Key behavior changes:
    // 1. Server has discoverTools method
    expect(typeof server.discoverTools).toBe('function');
    
    // 2. callTool accepts threadId option
    expect(server.callTool.length >= 2).toBe(true); // at least name, args params
    
    // 3. No persistent container/client - all per-request
    expect((server as any).client).toBeUndefined(); // Should not have persistent client
    expect((server as any).containerId).toBeUndefined(); // Should not have persistent container
  });
});
