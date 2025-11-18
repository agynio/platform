import { describe, it, expect, vi } from 'vitest';
import { PassThrough } from 'node:stream';
import { LoggerService } from '../src/core/services/logger.service';
import { ConfigService, configSchema } from '../src/core/services/config.service';
import { EnvService } from '../src/env/env.service';
import { VaultService } from '../src/vault/vault.service';
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
    const logger = new LoggerService();
    const provider = new SharedProvider();
    const cfg = new ConfigService().init(
      configSchema.parse({
        llmProvider: 'openai', mongodbUrl: 'mongodb://localhost/test', agentsDatabaseUrl: 'mongodb://localhost/agents',
      }),
    );
    const vault = new VaultService(cfg, logger);
    const envService = new EnvService(vault);

    const shell = new ShellCommandNode(envService, logger);
    shell.init({ nodeId: 'shell' });
    shell.setContainerProvider(provider);
    await shell.setConfig({ env: [ { key: 'S_VAR', value: 's' } ] });

    // Mock docker for MCP
    const captured: Array<Record<string, unknown>> = [];
    const docker = {
      modem: { demuxStream: (_s: unknown, _o: unknown, _e: unknown) => {} },
      getContainer: () => ({
        exec: async (opts: Record<string, unknown>) => { captured.push(opts); return { start: (_: unknown, cb: (err: unknown, stream: NodeJS.ReadableStream) => void) => { const s = new PassThrough(); setTimeout(()=>s.end(),1); cb(undefined, s); }, inspect: async () => ({ ExitCode: 0 }) }; },
      }),
    } as const;
    const cs = { getDocker: () => docker };
    const mcp = new LocalMCPServerNode(cs, logger, vault, envService, cfg);
    mcp.init({ nodeId: 'mcp' });
    (mcp as any).setContainerProvider(provider);
    await mcp.setConfig({ namespace: 'n', command: 'mcp start --stdio', env: [ { key: 'M_VAR', value: 'm' } ], startupTimeoutMs: 10 });

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
