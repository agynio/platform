import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ContainerProviderEntity, type ContainerProviderStaticConfig } from '../entities/containerProvider.entity';
import { ContainerService } from '../core/services/container.service';
import { LoggerService } from '../core/services/logger.service';
import { ContainerEntity } from '../entities/container.entity';

class StubLogger extends LoggerService {
  override info = vi.fn();
  override debug = vi.fn();
  override error = vi.fn();
}

class FakeContainer extends ContainerEntity {
  private calls: { cmd: string; opts?: any; rc: number }[] = [];
  constructor(svc: ContainerService, id: string, private execPlan: ((cmd: string) => { rc: number }) | null) {
    super(svc, id);
  }
  override async exec(command: string[] | string, options?: { timeoutMs?: number; idleTimeoutMs?: number; tty?: boolean }) {
    const cmd = Array.isArray(command) ? command.join(' ') : command;
    const plan = this.execPlan || (() => ({ rc: 0 }));
    const { rc } = plan(cmd);
    this.calls.push({ cmd, opts: options, rc });
    return { stdout: '', stderr: '', exitCode: rc } as { stdout: string; stderr: string; exitCode: number };
  }
  getExecCalls() { return this.calls; }
}

class StubContainerService extends ContainerService {
  constructor() { super(new LoggerService()); }
  created?: FakeContainer;
  override async start(): Promise<ContainerEntity> {
    // Default: container with all exec returning rc=0
    this.created = new FakeContainer(this, 'c', null);
    return this.created;
  }
  override async findContainerByLabels(): Promise<ContainerEntity | undefined> { return undefined; }
  override async findContainersByLabels(): Promise<ContainerEntity[]> { return []; }
  override async getContainerLabels(): Promise<Record<string, string>> { return {}; }
}

function makeProvider(execPlan?: (cmd: string) => { rc: number }) {
  const svc = new StubContainerService();
  const provider = new ContainerProviderEntity(svc, undefined, {}, () => ({}));
  const logger = new StubLogger();
  provider.setLogger(logger);
  // Inject custom plan into created container
  vi.spyOn(svc, 'start').mockImplementation(async () => {
    svc.created = new FakeContainer(svc, 'c', execPlan || null);
    return svc.created;
  });
  return { provider, svc, logger };
}

describe('ContainerProviderEntity nix install', () => {
  beforeEach(() => vi.clearAllMocks());

  it('skips when no packages', async () => {
    const { provider, svc, logger } = makeProvider();
    provider.setConfig({ image: 'alpine:3' } as unknown as ContainerProviderStaticConfig);
    await provider.provide('t');
    const calls = (svc.created as FakeContainer).getExecCalls();
    // No nix detection nor install
    expect(calls.length).toBe(0);
    expect((logger.info as unknown as { mock: { calls: unknown[][] } }).mock.calls.find((c) => String(c[0]).includes('skipping install'))).toBeFalsy();
  });

  it('skips with info when nix not present', async () => {
    // Plan: first call is detection -> return rc != 0
    let first = true;
    const plan = (cmd: string) => {
      if (first && cmd.includes('nix --version')) { first = false; return { rc: 1 }; }
      return { rc: 0 };
    };
    const { provider, svc, logger } = makeProvider(plan);
    provider.setConfig({ image: 'alpine:3', nix: { packages: [{ commitHash: 'a'.repeat(40), attributePath: 'htop' }] } } as unknown as ContainerProviderStaticConfig);
    await provider.provide('t');
    const calls = (svc.created as FakeContainer).getExecCalls();
    expect(calls.length).toBe(1); // only detection
    expect((logger.info as unknown as { mock: { calls: unknown[][] } }).mock.calls.some((c) => String(c[0]).includes('Nix not present'))).toBe(true);
  });

  it('runs combined install when nix present', async () => {
    // Plan: detection rc=0; combined rc=0
    let seq = 0;
    const plan = (cmd: string) => {
      seq += 1;
      if (cmd.includes('nix --version')) return { rc: 0 };
      if (cmd.includes('nix profile install')) return { rc: 0 };
      return { rc: 0 };
    };
    const { provider, svc, logger } = makeProvider(plan);
    provider.setConfig({ image: 'alpine:3', nix: { packages: [
      { commitHash: 'b'.repeat(40), attributePath: 'htop' },
      { commitHash: 'c'.repeat(40), attributePath: 'curl' },
    ] } } as unknown as ContainerProviderStaticConfig);
    await provider.provide('t');
    const calls = (svc.created as FakeContainer).getExecCalls();
    expect(calls.length).toBeGreaterThanOrEqual(2);
    const combined = calls.find((c) => String(c.cmd).includes('nix profile install'));
    expect(combined).toBeDefined();
    // Verify both refs are present
    expect(String((combined as { cmd: string }).cmd)).toContain(`github:NixOS/nixpkgs/${'b'.repeat(40)}#htop`);
    expect(String((combined as { cmd: string }).cmd)).toContain(`github:NixOS/nixpkgs/${'c'.repeat(40)}#curl`);
    // Info log about combined
    expect((logger.info as unknown as { mock: { calls: unknown[][] } }).mock.calls.some((c) => String(c[0]).includes('Nix install'))).toBe(true);
  });

  it('falls back per-package on combined failure', async () => {
    // Plan: detection rc=0; combined rc=1; per-package: first rc=0, second rc=1
    let stage: 'detect' | 'combined' | 'pkg1' | 'pkg2' = 'detect';
    const plan = (cmd: string) => {
      if (cmd.includes('nix --version')) { stage = 'combined'; return { rc: 0 }; }
      if (stage === 'combined' && cmd.includes('nix profile install') && cmd.includes('#htop') && cmd.includes('#curl')) { stage = 'pkg1'; return { rc: 1 }; }
      if (stage === 'pkg1' && cmd.includes('#htop')) { stage = 'pkg2'; return { rc: 0 }; }
      if (stage === 'pkg2' && cmd.includes('#curl')) { return { rc: 1 }; }
      return { rc: 0 };
    };
    const { provider, svc, logger } = makeProvider(plan);
    provider.setConfig({ image: 'alpine:3', nix: { packages: [
      { commitHash: 'd'.repeat(40), attributePath: 'htop' },
      { commitHash: 'e'.repeat(40), attributePath: 'curl' },
    ] } } as unknown as ContainerProviderStaticConfig);
    await provider.provide('t');
    const calls = (svc.created as FakeContainer).getExecCalls();

    // Ensure sequential per-package fallback executed in order
    const pkgCalls = calls.filter((c) => String(c.cmd).includes('nix profile install') && !String(c.cmd).includes('#htop #curl'));
    // Expect exactly two per-package calls
    expect(pkgCalls.length).toBeGreaterThanOrEqual(2);
    // Order should be htop then curl per our staged plan
    expect(String(pkgCalls[0].cmd)).toContain('#htop');
    expect(String(pkgCalls[1].cmd)).toContain('#curl');
    // Expect detection + combined + 2 per-package = 4 execs
    expect(calls.length).toBeGreaterThanOrEqual(4);
    // Error logs recorded
    expect((logger.error as unknown as { mock: { calls: unknown[][] } }).mock.calls.some((c) => String(c[0]).includes('combined'))).toBe(true);
    // Success/failure logs per package
    expect((logger.info as unknown as { mock: { calls: unknown[][] } }).mock.calls.some((c) => String(c[0]).includes('succeeded for'))).toBe(true);
    expect((logger.error as unknown as { mock: { calls: unknown[][] } }).mock.calls.some((c) => String(c[0]).includes('failed for'))).toBe(true);
  });

  it('logs unresolved legacy/UI shapes and skips', async () => {
    const { provider, svc, logger } = makeProvider();
    provider.setConfig({ image: 'alpine:3', nix: { packages: [ { attr: 'htop' }, { name: 'htop', version: '1.2.3' } ] } } as unknown as ContainerProviderStaticConfig);
    await provider.provide('t');
    const calls = (svc.created as FakeContainer).getExecCalls();
    // No detection nor install
    expect(calls.length).toBe(0);
    expect((logger.info as unknown as { mock: { calls: unknown[][] } }).mock.calls.some((c) => String(c[0]).includes('unresolved'))).toBe(true);
  });
});
