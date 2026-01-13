import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { PassThrough } from 'node:stream';

import { McpServerConfig } from '../src/mcp/types.js';
import { LocalMCPServerNode } from '../src/nodes/mcp/localMcpServer.node';
import { createModuleRefStub } from './helpers/module-ref.stub';
import { WorkspaceHandle } from '../src/workspace/workspace.handle';
import {
  WorkspaceProvider,
  type DestroyWorkspaceOptions,
  type ExecRequest,
  type ExecResult,
  type WorkspaceKey,
  type WorkspaceProviderCapabilities,
  type WorkspaceSpec,
} from '../src/workspace/providers/workspace.provider';
import type {
  WorkspaceStdioSession,
  WorkspaceStdioSessionRequest,
} from '../src/workspace/runtime/workspace.runtime.provider';

type JsonLike = Record<string, unknown>;

/**
 * In-process mock MCP server (no subprocess) using PassThrough streams.
 * Each session represents a single interactive exec over stdio.
 */
function createInProcessMock() {
  const tools = [
    {
      name: 'echo',
      description: 'Echo back provided text',
      inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
    },
  ];

  const createSession = (): WorkspaceStdioSession => {
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    stdin.setEncoding('utf8');

    let buffer = '';
    let closed = false;

    const send = (obj: JsonLike) => {
      if (closed) return;
      stdout.write(JSON.stringify(obj) + '\n');
    };

    const handleMessage = (msg: JsonLike) => {
      const method = typeof msg.method === 'string' ? msg.method : undefined;
      const id = msg.id;
      if (method === 'initialize') {
        send({
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: '2025-06-18',
            capabilities: { tools: {} },
            serverInfo: { name: 'mock', version: '0.0.1' },
          },
        });
        return;
      }
      if (method === 'ping') {
        send({ jsonrpc: '2.0', id, result: {} });
        return;
      }
      if (method === 'tools/list') {
        send({ jsonrpc: '2.0', id, result: { tools } });
        return;
      }
      if (method === 'tools/call') {
        const params = (msg.params ?? {}) as { name?: string; arguments?: JsonLike };
        if (params.name === 'echo') {
          const text = typeof params.arguments?.text === 'string' ? params.arguments.text : '';
          send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: `echo:${text}` }] } });
          return;
        }
        send({
          jsonrpc: '2.0',
          id,
          result: { isError: true, content: [{ type: 'text', text: `unknown tool ${String(params.name)}` }] },
        });
        return;
      }
      send({ jsonrpc: '2.0', id, error: { code: -32601, message: 'Method not found' } });
    };

    stdin.on('data', (chunk) => {
      buffer += chunk;
      while (true) {
        const idx = buffer.indexOf('\n');
        if (idx === -1) break;
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        if (!line) continue;
        try {
          const msg = JSON.parse(line) as JsonLike;
          handleMessage(msg);
        } catch {
          // ignore malformed payloads
        }
      }
    });

    const close = async () => {
      if (closed) return { exitCode: 0, stdout: '', stderr: '' };
      closed = true;
      stdin.end();
      stdout.end();
      stderr.end();
      return { exitCode: 0, stdout: '', stderr: '' };
    };

    return { stdin, stdout, stderr, close };
  };

  return { createSession };
}

class MockWorkspaceProvider extends WorkspaceProvider {
  public readonly execCalls: Array<{ workspaceId: string; request: WorkspaceStdioSessionRequest }> = [];
  public readonly touchCalls: string[] = [];
  public readonly destroyed: string[] = [];
  private readonly mock = createInProcessMock();

  capabilities(): WorkspaceProviderCapabilities {
    return {
      persistentVolume: false,
      network: false,
      networkAliases: false,
      dockerInDocker: false,
      stdioSession: true,
      terminalSession: false,
      logsSession: false,
    };
  }

  async ensureWorkspace(key: WorkspaceKey, _spec: WorkspaceSpec) {
    return { workspaceId: `mock-${key.threadId}`, created: true, providerType: 'docker', status: 'running' as const };
  }

  async exec(_workspaceId: string, _request: ExecRequest): Promise<ExecResult> {
    throw new Error('exec not implemented in MockWorkspaceProvider');
  }

  async openStdioSession(
    workspaceId: string,
    request: WorkspaceStdioSessionRequest,
  ): Promise<WorkspaceStdioSession> {
    this.execCalls.push({ workspaceId, request });
    return this.mock.createSession();
  }

  async openTerminalSession(): Promise<never> {
    throw new Error('terminal sessions not supported in MockWorkspaceProvider');
  }

  async openLogsSession(): Promise<never> {
    throw new Error('log sessions not supported in MockWorkspaceProvider');
  }

  async destroyWorkspace(workspaceId: string, _options?: DestroyWorkspaceOptions): Promise<void> {
    this.destroyed.push(workspaceId);
  }

  async touchWorkspace(workspaceId: string): Promise<void> {
    this.touchCalls.push(workspaceId);
  }

  async putArchive(): Promise<void> {
    return;
  }
}

describe('LocalMCPServer (mock)', () => {
  let server: LocalMCPServerNode;
  let provider: MockWorkspaceProvider;
  const handles = new Map<string, WorkspaceHandle>();
  let currentResolvedEnv: Record<string, string> | undefined;
  let envStub: { resolveProviderEnv: ReturnType<typeof vi.fn>; resolveEnvItems: ReturnType<typeof vi.fn> };

  beforeAll(async () => {
    provider = new MockWorkspaceProvider();
    envStub = {
      resolveProviderEnv: vi.fn(async () => currentResolvedEnv),
      resolveEnvItems: vi.fn(),
    };
    const configStub = { mcpToolsStaleTimeoutMs: 0 } as const;
    server = new LocalMCPServerNode(envStub as any, configStub as any, createModuleRefStub());
    const mockWorkspaceNode = {
      provide: async (threadId: string) => {
        let handle = handles.get(threadId);
        if (!handle) {
          handle = new WorkspaceHandle(provider, `mock-${threadId}`);
          handles.set(threadId, handle);
        }
        return handle;
      },
    };
    (server as any).setContainerProvider(mockWorkspaceNode);
    const cfg: McpServerConfig = { namespace: 'mock', command: 'ignored' } as any;
    await server.setConfig(cfg);
    await server.provision();
  }, 10_000);

  beforeEach(async () => {
    provider.execCalls.length = 0;
    provider.touchCalls.length = 0;
    provider.destroyed.length = 0;
    currentResolvedEnv = undefined;
    envStub.resolveProviderEnv.mockImplementation(async () => currentResolvedEnv);
    envStub.resolveProviderEnv.mockClear();
    envStub.resolveEnvItems.mockClear();
    await server.setConfig({ ...server.config, env: undefined });
  });

  afterAll(async () => {
    await server.deprovision();
  });

  it('lists tools when enabledTools are provided', async () => {
    expect(server.listTools()).toEqual([]);
    await server.setState({ mcp: { enabledTools: ['echo'] } as any });
    const tools = server.listTools();
    expect(tools.find((t) => String(t.name).endsWith('_echo'))).toBeTruthy();
  });

  it('passes resolved env to workspace exec during discovery', async () => {
    currentResolvedEnv = { STATIC: 'value', SECRET: 'resolved' };
    await server.setConfig({ ...server.config, env: [{ name: 'STATIC', value: '1' }] as any });
    (server as any).toolsDiscovered = false;
    (server as any).toolsCache = null;
    await server.discoverTools();
    expect(provider.execCalls.length).toBeGreaterThan(0);
    const discoveryCall = provider.execCalls[0];
    const envArr = discoveryCall.request.env as string[] | undefined;
    expect(envArr).toBeDefined();
    expect(envArr).toEqual(expect.arrayContaining(['STATIC=value', 'SECRET=resolved']));
  });

  it('calls tool', async () => {
    const result = await server.callTool('echo', { text: 'hello' }, { threadId: 'test-thread' });
    expect(result.content).toContain('echo:hello');
  });

  it('passes resolved env to workspace exec during tool calls', async () => {
    currentResolvedEnv = { TOOL_ENV: 'tool-value' };
    await server.setConfig({ ...server.config, env: [{ name: 'TOOL_ENV', value: 'placeholder' }] as any });
    (server as any).toolsDiscovered = false;
    (server as any).toolsCache = null;
    await server.callTool('echo', { text: 'env' }, { threadId: 'env-thread' });
    expect(provider.execCalls.length).toBeGreaterThan(0);
    const toolExec = provider.execCalls.at(-1);
    expect(toolExec?.workspaceId).toEqual('mock-env-thread');
    const envArr = toolExec?.request.env as string[] | undefined;
    expect(envArr).toBeDefined();
    expect(envArr).toEqual(expect.arrayContaining(['TOOL_ENV=tool-value']));
  });

  it('emits unified tools_updated events', async () => {
    let lastPayload: { tools: any[]; updatedAt: number } | null = null;
    (server as any).on('mcp.tools_updated', (p: { tools: any[]; updatedAt: number }) => {
      lastPayload = p;
    });
    (server as any).preloadCachedTools([{ name: 'pre' }], Date.now());
    expect(lastPayload).toBeTruthy();
    expect(Array.isArray(lastPayload!.tools)).toBe(true);
    await (server as any).discoverTools();
    expect(lastPayload).toBeTruthy();
    expect(typeof lastPayload!.updatedAt).toBe('number');
  });
});
