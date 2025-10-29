import { describe, it, expect, vi } from 'vitest';
import { LoggerService } from '../../src/core/services/logger.service';
import { ShellCommandNode } from '../../src/nodes/tools/shell_command/shell_command.node';
import { EnvService } from '../../src/env/env.service';

class FakeContainer {
  public lastExec: { cmd: string; env?: Record<string, string>; workdir?: string } | null = null;
  constructor(private baseEnv: Record<string, string>, private baseWd: string) {}
  async getEnv() { return { ...this.baseEnv }; }
  async exec(command: string, options?: { env?: Record<string, string>; workdir?: string }) {
    this.lastExec = { cmd: command, env: options?.env, workdir: options?.workdir };
    // Simulate env effects for validation
    const overlay = (options?.env || {}) as Record<string, string>;
    const eff: Record<string, string> = { ...this.baseEnv, ...overlay };
    const keys = ['FOO', 'BAR', 'BASE_ONLY'];
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

describe('ShellTool env/workdir isolation with vault-backed overlay', () => {
  it('applies per-node overlay and sets workdir without leaking; supports vault refs', async () => {
    const logger = new LoggerService();
    const provider: any = new FakeProvider();

    const fakeVault = { isEnabled: () => true, getSecret: vi.fn(async () => 'VAULTED') } as any;
    const envSvc = new EnvService(fakeVault as any);

    const archiveStub = { createSingleFileTar: async () => Buffer.from('tar') } as const;
    const moduleRefStub = { create: (cls: any) => new (cls as any)(archiveStub) } as const;
    const a = new ShellCommandNode(envSvc as any, new LoggerService() as any, moduleRefStub as any); a.setContainerProvider(provider as any);
    await a.setConfig({ env: [ { key: 'FOO', value: 'A' }, { key: 'BAR', value: 'secret/path/key', source: 'vault' } ], workdir: '/w/a' });
    const b = new ShellCommandNode(new EnvService(undefined as any) as any, new LoggerService() as any, moduleRefStub as any); b.setContainerProvider(provider as any);
    await b.setConfig({ env: [ { key: 'FOO', value: 'B' } ], workdir: '/w/b' });

    const at = a.getTool();
    const bt = b.getTool();

    const aRes = String(await at.execute({ command: 'printenv' } as any, { threadId: 't', finishSignal: { activate() {}, deactivate() {}, isActive: false } as any, callerAgent: {} as any } as any));
    const bRes = String(await bt.execute({ command: 'printenv' } as any, { threadId: 't', finishSignal: { activate() {}, deactivate() {}, isActive: false } as any, callerAgent: {} as any } as any));

    const parse = (s: string) => Object.fromEntries(s.trim().split('\n').map((l) => l.split('=')));
    const A = parse(aRes), B = parse(bRes);
    expect(A.WD).toBe('/w/a');
    expect(A.FOO).toBe('A');
    expect(A.BAR).toBe('VAULTED');
    expect(A.BASE_ONLY).toBe('1');
    expect(B.WD).toBe('/w/b');
    expect(B.FOO).toBe('B');
    expect(B.BAR).toBe('');
    expect(B.BASE_ONLY).toBe('1');
  });
});
