import { describe, it, expect, vi } from 'vitest';
import { PassThrough } from 'node:stream';
import { ConfigService, configSchema } from '../src/core/services/config.service';
import { EnvService } from '../src/env/env.service';
import { ShellCommandNode } from '../src/nodes/tools/shell_command/shell_command.node';
import { LocalMCPServerNode } from '../src/nodes/mcp/localMcpServer.node';
import { Signal } from '../src/signal';

class FakeContainer {
  last: unknown;
  constructor(public id: string, private baseEnv: Record<string,string>) {}
  async exec(cmd: string, options?: { env?: Record<string,string>; workdir?: string }) {
    this.last = { cmd, options };
    // Return visible env for assertions
    const eff = { ...this.baseEnv, ...(options?.env || {}) } as Record<string,string>;
    const out = Object.entries(eff).map(([k,v]) => `${k}=${v}`).join('\n');
    return { stdout: out, stderr: '', exitCode: 0 };
  }
}

class SharedProvider {
  c = new FakeContainer('cid', { BASE: '1', SHELL_ONLY: 'S', MCP_ONLY: 'M' });
  async provide(_: string) { return this.c; }
}

describe('Mixed Shell + MCP overlay isolation', () => {
  it('does not leak env between Shell and MCP nodes', async () => {
    const provider = new SharedProvider();
    const cfg = new ConfigService().init(
      configSchema.parse({
        llmProvider: 'openai',
        agentsDatabaseUrl: 'postgres://localhost/agents',
      }),
    );
    const resolver = { resolve: async (input: unknown) => ({ output: input, report: {} as unknown }) };
    const envService = new EnvService(resolver as any);

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
    shell.setContainerProvider(provider);
    await shell.setConfig({ env: [ { name: 'S_VAR', value: 's' } ] });

    // Mock docker for MCP
    const captured: Array<Record<string, unknown>> = [];
    const docker = {
      modem: { demuxStream: (_s: unknown, _o: unknown, _e: unknown) => {} },
      getContainer: () => ({
        exec: async (opts: Record<string, unknown>) => { captured.push(opts); return { start: (_: unknown, cb: (err: unknown, stream: NodeJS.ReadableStream) => void) => { const s = new PassThrough(); setTimeout(()=>s.end(),1); cb(undefined, s); }, inspect: async () => ({ ExitCode: 0 }) }; },
      }),
    } as const;
    const cs = { getDocker: () => docker };
    const mcp = new LocalMCPServerNode(cs as any, envService as any, cfg as any, undefined as any);
    mcp.init({ nodeId: 'mcp' });
    (mcp as any).setContainerProvider(provider);
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
    expect(captured.length).toBeGreaterThan(0);
    const env: string[] = captured[0].Env || [];
    expect(env).toEqual(expect.arrayContaining(['M_VAR=m']));
  });
});
