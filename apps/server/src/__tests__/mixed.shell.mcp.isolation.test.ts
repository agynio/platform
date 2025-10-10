import { describe, it, expect, vi } from 'vitest';
import { LoggerService } from '../services/logger.service';
import { ShellTool } from '../tools/shell_command';
import { LocalMCPServer } from '../mcp/localMcpServer';

class FakeContainer {
  last: any;
  constructor(public id: string, private baseEnv: Record<string,string>) {}
  async exec(cmd: string, options?: { env?: Record<string,string>; workdir?: string }) {
    this.last = { cmd, options };
    // Return visible env for assertions
    const unset: string[] = (/^unset\s+([^;]+);/.exec(cmd)?.[1] || '').split(/\s+/).filter(Boolean);
    const eff = { ...this.baseEnv, ...(options?.env || {}) } as Record<string,string>;
    for (const k of unset) delete eff[k];
    const out = Object.entries(eff).map(([k,v]) => `${k}=${v}`).join('\n');
    return { stdout: out, stderr: '', exitCode: 0 };
  }
}

class SharedProvider {
  c = new FakeContainer('cid', { BASE: '1', SHELL_ONLY: 'S', MCP_ONLY: 'M' });
  async provide(_: string) { return this.c as any; }
}

describe('Mixed Shell + MCP overlay isolation', () => {
  it('does not leak env between Shell and MCP nodes', async () => {
    const logger = new LoggerService();
    const provider: any = new SharedProvider();

    const shell = new ShellTool(logger); shell.setContainerProvider(provider);
    await shell.setConfig({ env: { S_VAR: 's' }, unset: ['MCP_ONLY'] });

    // Mock docker for MCP
    const captured: any[] = [];
    const docker: any = {
      modem: { demuxStream: (_s: any, _o: any, _e: any) => {} },
      getContainer: () => ({
        exec: async (opts: any) => { captured.push(opts); return { start: (_: any, cb: any) => { const { PassThrough } = require('node:stream'); const s = new PassThrough(); setTimeout(()=>s.end(),1); cb(undefined, s); }, inspect: async () => ({ ExitCode: 0 }) }; },
      }),
    };
    const cs: any = { getDocker: () => docker };
    const mcp = new LocalMCPServer(cs, logger as any);
    (mcp as any).setContainerProvider(provider);
    await mcp.setConfig({ namespace: 'n', command: 'mcp start --stdio', env: { M_VAR: 'm' }, unset: ['SHELL_ONLY'] } as any);

    // Shell exec
    const tool = shell.init();
    const out = String(await tool.invoke({ command: 'printenv' }, { configurable: { thread_id: 't' } } as any));
    expect(out).toContain('S_VAR=s');
    expect(out).not.toContain('M_VAR=m');

    // MCP discovery creates an exec with unset SHELL_ONLY and Env contains only M_VAR
    try { await mcp.discoverTools(); } catch {}
    expect(captured.length).toBeGreaterThan(0);
    const env: string[] = captured[0].Env || [];
    expect(env).toEqual(expect.arrayContaining(['M_VAR=m']));
  });
});

