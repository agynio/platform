import { describe, it, expect, vi } from 'vitest';
import { LoggerService } from '../../services/logger.service';
import { ShellTool } from '../../tools/shell_command';

class FakeContainer {
  public lastExec: { cmd: string; env?: Record<string, string>; workdir?: string } | null = null;
  constructor(private baseEnv: Record<string, string>, private baseWd: string) {}
  async exec(command: string, options?: { env?: Record<string, string>; workdir?: string }) {
    this.lastExec = { cmd: command, env: options?.env, workdir: options?.workdir };
    // Simulate env/unset effects for validation
    let unsetVars: string[] = [];
    const m = /^unset\s+([^;]+);\s*/.exec(command);
    if (m) unsetVars = m[1].trim().split(/\s+/).filter(Boolean);
    const overlay = (options?.env || {}) as Record<string, string>;
    const eff: Record<string, string> = { ...this.baseEnv, ...overlay };
    for (const k of unsetVars) delete eff[k];
    const keys = ['FOO', 'BAR', 'UNSETME', 'BASE_ONLY'];
    const out = [
      `WD=${options?.workdir || this.baseWd}`,
      ...keys.map((k) => `${k}=${eff[k] ?? ''}`),
    ].join('\n');
    return { stdout: out, stderr: '', exitCode: 0 };
  }
}

class FakeProvider {
  private c = new FakeContainer({ UNSETME: '1', BASE_ONLY: '1' }, '/workspace');
  async provide(_thread: string) { return this.c as any; }
}

describe('ShellTool env/unset/workdir isolation', () => {
  it('applies per-node overlay, unsets vars, and sets workdir without leaking', async () => {
    const logger = new LoggerService();
    const provider: any = new FakeProvider();

    const a = new ShellTool(logger); a.setContainerProvider(provider);
    await a.setConfig({ env: { FOO: 'A' }, unset: ['UNSETME'], workdir: '/w/a' });
    const b = new ShellTool(logger); b.setContainerProvider(provider);
    await b.setConfig({ env: { FOO: 'B', BAR: 'b' }, workdir: '/w/b' });

    const at = a.init();
    const bt = b.init();

    const aRes = String(await at.invoke({ command: 'printenv' }, { configurable: { thread_id: 't' } } as any));
    const bRes = String(await bt.invoke({ command: 'printenv' }, { configurable: { thread_id: 't' } } as any));

    const parse = (s: string) => Object.fromEntries(s.trim().split('\n').map((l) => l.split('=')));
    const A = parse(aRes), B = parse(bRes);
    expect(A.WD).toBe('/w/a');
    expect(A.FOO).toBe('A');
    expect(A.UNSETME).toBe(''); // unset removed
    expect(A.BASE_ONLY).toBe('1');
    expect(B.WD).toBe('/w/b');
    expect(B.FOO).toBe('B');
    expect(B.BAR).toBe('b');
    expect(B.UNSETME).toBe('1'); // unset not applied for node B
  });
});

