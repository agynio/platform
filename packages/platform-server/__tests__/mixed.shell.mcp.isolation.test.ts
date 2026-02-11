import { describe, it, expect, vi } from 'vitest';
import { ConfigService, configSchema } from '../src/core/services/config.service';
import { EnvService } from '../src/env/env.service';
import { ShellCommandNode } from '../src/nodes/tools/shell_command/shell_command.node';
import { LocalMCPServerNode } from '../src/nodes/mcp/localMcpServer.node';
import { Signal } from '../src/signal';
import { createModuleRefStub } from './helpers/module-ref.stub';
import { WorkspaceProviderStub, WorkspaceNodeStub } from './helpers/workspace-provider.stub';

describe('Mixed Shell + MCP overlay isolation', () => {
  it('does not leak env between Shell and MCP nodes', async () => {
    const provider = new WorkspaceProviderStub({ BASE: '1', SHELL_ONLY: 'S', MCP_ONLY: 'M' });
    const workspaceNode = new WorkspaceNodeStub(provider);
    const cfg = new ConfigService().init(
      configSchema.parse({
        agentsDatabaseUrl: 'postgres://localhost/agents',
        litellmBaseUrl: 'http://localhost:4000',
        litellmMasterKey: 'sk-test',
      }),
    );
    const envService = new EnvService();

    const moduleRefStub = {};
    const archiveStub = { createSingleFileTar: vi.fn(async () => Buffer.from('tar')) } as const;
    const runEventsStub = {
      appendToolOutputChunk: vi.fn(async (payload) => payload),
      finalizeToolOutputTerminal: vi.fn(async (payload) => payload),
    };
    const eventsBusStub = {
      emitToolOutputChunk: vi.fn(),
      emitToolOutputTerminal: vi.fn(),
    };
    const prismaStub = {
      getClient: vi.fn(() => ({
        container: {
          findUnique: vi.fn(async () => null),
        },
        containerEvent: {
          findFirst: vi.fn(async () => null),
        },
      })),
    };
    const shell = new ShellCommandNode(
      envService as any,
      moduleRefStub as any,
      archiveStub as any,
      runEventsStub as any,
      eventsBusStub as any,
      prismaStub as any,
    );
    shell.init({ nodeId: 'shell' });
    shell.setContainerProvider(workspaceNode as unknown as ShellCommandNode['provider']);
    await shell.setConfig({ env: [ { name: 'S_VAR', value: 's' } ] });

    const mcp = new LocalMCPServerNode(envService as any, cfg as any, createModuleRefStub());
    mcp.init({ nodeId: 'mcp' });
    (mcp as any).setContainerProvider(workspaceNode);
    await mcp.setConfig({ namespace: 'n', command: 'mcp start --stdio', env: [ { name: 'M_VAR', value: 'm' } ], startupTimeoutMs: 10 });

    // Shell exec
    const tool = shell.getTool();
    const out = String(await tool.execute({ command: 'printenv' }, { threadId: 't', finishSignal: new Signal(), terminateSignal: new Signal(), callerAgent: { invoke: async () => undefined } } as unknown as import('../src/llm/types').LLMContext));
    expect(out).toContain('S_VAR=s');
    expect(out).not.toContain('M_VAR=m');

    // MCP discovery creates an exec with Env containing only M_VAR
    try { await mcp.discoverTools(); } catch {
      // ignore discovery errors in test
    }
    expect(provider.interactiveRequests.length).toBeGreaterThan(0);
    const interactiveEnv = provider.interactiveRequests[0].env;
    const envEntries = Array.isArray(interactiveEnv)
      ? interactiveEnv
      : interactiveEnv
        ? Object.entries(interactiveEnv).map(([key, value]) => `${key}=${value}`)
        : [];
    expect(envEntries).toEqual(expect.arrayContaining(['M_VAR=m']));
  });
});
