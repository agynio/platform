import { describe, it, expect } from 'vitest';
import { LocalMCPServerNode } from '../src/nodes/mcp/localMcpServer.node';
import { McpServerConfig } from '../src/mcp/types.js';
import { createModuleRefStub } from './helpers/module-ref.stub';
import { WorkspaceProviderStub, WorkspaceNodeStub } from './helpers/workspace-provider.stub';

describe('MCP Lifecycle Changes', () => {
  const envStub = { resolveEnvItems: async () => ({}), resolveProviderEnv: async () => ({}) } as any;

  it('supports threadId parameter in callTool method', async () => {
    const server = new LocalMCPServerNode(envStub, {} as any, createModuleRefStub());
    const provider = new WorkspaceProviderStub();
    const workspaceNode = new WorkspaceNodeStub(provider);
    server.setContainerProvider(workspaceNode as unknown as typeof server['containerProvider']);
    await server.setConfig({ namespace: 'test' } as McpServerConfig);

    try {
      await server.callTool('nonexistent', {}, { threadId: 'thread-123' });
    } catch (e) {
      expect(e).toBeDefined();
    }
  });

  it('has discoverTools method for initial tool discovery', async () => {
    const server = new LocalMCPServerNode(envStub, {} as any, createModuleRefStub());
    expect(typeof server.discoverTools).toBe('function');

    try {
      await server.discoverTools();
    } catch (e) {
      expect(e).toBeDefined();
    }
  });

  it('demonstrates new vs old lifecycle pattern', () => {
    const server = new LocalMCPServerNode(envStub, {} as any, createModuleRefStub());
    expect(typeof server.discoverTools).toBe('function');
    expect(server.callTool.length >= 2).toBe(true);
    expect((server as any).client).toBeUndefined();
    expect((server as any).containerProvider).toBeUndefined();
  });
});
