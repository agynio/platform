import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ContainerProviderEntity } from '../entities/containerProvider.entity';
import { ContainerService, type ContainerOpts } from '../services/container.service';
import { LoggerService } from '../services/logger.service';
import { ConfigService, configSchema } from '../services/config.service';

// Reuse TestContainerEntity pattern from other tests
class TestContainerEntity extends (await import('../entities/container.entity')).ContainerEntity {
  constructor(service: ContainerService, id: string, public env: Record<string, string>, public labels: Record<string, string>) {
    super(service, id);
  }
}

class FakeContainerService extends ContainerService {
  constructor() { super(new LoggerService()); }
  override async findContainerByLabels(): Promise<ReturnType<ContainerService['findContainerByLabels']> extends Promise<infer R> ? R : never> {
    return undefined as never;
  }
  override async findContainersByLabels(): Promise<ReturnType<ContainerService['findContainersByLabels']> extends Promise<infer R> ? R : never> {
    return [] as never;
  }
  override async start(opts?: ContainerOpts): Promise<TestContainerEntity> {
    const env: Record<string, string> = (opts?.env && !Array.isArray(opts.env) ? opts.env : {}) || {};
    const labels: Record<string, string> = opts?.labels || {};
    return new TestContainerEntity(this, Math.random().toString(36).slice(2), env, labels);
  }
  override async getContainerLabels(): Promise<Record<string, string>> {
    return {};
  }
}

// Minimal logger that captures messages
class CaptureLogger extends LoggerService {
  logs: { level: string; msg: string }[] = [];
  override info(msg: string, ..._args: unknown[]) { this.logs.push({ level: 'info', msg }); }
  override warn(msg: string, ..._args: unknown[]) { this.logs.push({ level: 'warn', msg }); }
}

describe('ContainerProviderEntity NCPS pubkey runtime fetch', () => {
  const svc = new FakeContainerService();
  const baseCfg = {
    githubAppId: 'x', githubAppPrivateKey: 'x', githubInstallationId: 'x', openaiApiKey: 'x', githubToken: 'x', mongodbUrl: 'x',
    graphStore: 'mongo', graphRepoPath: './data/graph', graphBranch: 'graph-state',
    dockerMirrorUrl: 'http://registry-mirror:5000', nixAllowedChannels: 'nixpkgs-unstable', nixHttpTimeoutMs: '5000', nixCacheTtlMs: String(300000), nixCacheMax: '500',
    mcpToolsStaleTimeoutMs: '0', ncpsEnabled: 'true', ncpsUrl: 'http://ncps:8501', ncpsKeyTtlMs: '50',
  } as const;

  beforeEach(() => {
    // Reset seams and caches for deterministic tests
    ContainerProviderEntity.setNcpsHttpClient();
    ContainerProviderEntity.resetNcpsCaches();
  });

  it('fetches pubkey once and injects NIX_CONFIG; caches and respects TTL; logs rotation', async () => {
    const cfg = new ConfigService(configSchema.parse(baseCfg));
    const entA = new ContainerProviderEntity(svc, undefined, {}, () => ({}), cfg);
    const entB = new ContainerProviderEntity(svc, undefined, {}, () => ({}), cfg);
    const logger = new CaptureLogger();
    entA.setLogger(logger);
    entB.setLogger(logger);

    let calls = 0;
    let value = 'pub:key1';
    const timers: { timeouts: Array<[fn: (...args: any[]) => void, delay?: number]>; now: number } = { timeouts: [], now: 0 };
    ContainerProviderEntity.setNcpsHttpClient({
      fetch: (async () => { calls++; return { ok: true, text: async () => value } as any; }) as any,
      setTimeout: ((handler: (...args: any[]) => void, timeout?: number, ...args: any[]) => { timers.timeouts.push([handler, timeout]); try { handler(...args); } catch {} return 1 as any; }) as any,
      clearTimeout: ((_id: any) => {}) as any,
      now: () => timers.now,
    });

    entA.setConfig({});
    entB.setConfig({});
    // Trigger two concurrent provides -> coalesced to a single fetch
    const [c1, c2] = await Promise.all([
      entA.provide('t1') as Promise<TestContainerEntity>,
      entB.provide('t2') as Promise<TestContainerEntity>,
    ]);
    expect(calls).toBe(1);
    expect(c1.env['NIX_CONFIG']).toContain('substituters = http://ncps:8501');
    expect(c1.env['NIX_CONFIG']).toContain('trusted-public-keys = pub:key1');
    expect(c2.env['NIX_CONFIG']).toContain('trusted-public-keys = pub:key1');

    // Second call within TTL -> no additional fetch
    const c3 = (await entA.provide('t3')) as TestContainerEntity;
    expect(c3.env['NIX_CONFIG']).toContain('trusted-public-keys = pub:key1');
    expect(calls).toBe(1);

    // Advance after TTL, rotate key and ensure fetch called again and rotation logged
    // Simulate TTL elapsing by advancing now
    timers.now += 1000;
    value = 'pub:key2';
    const c4 = (await entA.provide('t4')) as TestContainerEntity;
    expect(c4.env['NIX_CONFIG']).toContain('trusted-public-keys = pub:key2');
    expect(calls).toBeGreaterThanOrEqual(2);
    const rotated = logger.logs.some((l) => l.level === 'info' && l.msg.includes('rotated'));
    expect(rotated).toBe(true);
  });

  it('skips injection on fetch/validation failure and warns; NIX_CONFIG not overridden', async () => {
    const cfg = new ConfigService(configSchema.parse(baseCfg));
    const ent = new ContainerProviderEntity(svc, undefined, {}, () => ({}), cfg);
    const logger = new CaptureLogger();
    ent.setLogger(logger);
    // invalid value (no colon)
    ContainerProviderEntity.setNcpsHttpClient({
      fetch: (async () => ({ ok: true, text: async () => 'invalid' } as any)) as any,
      setTimeout: ((h: (...args: any[]) => void) => { try { h(); } catch {} return 1 as any; }) as any,
      clearTimeout: ((_id: any) => {}) as any,
      now: () => 0,
    });
    ent.setConfig({});
    const c = (await ent.provide('t5')) as TestContainerEntity;
    expect(c.env['NIX_CONFIG']).toBeUndefined();
    const warned = logger.logs.some((l) => l.level === 'warn' && l.msg.includes('pubkey fetch failed'));
    expect(warned).toBe(true);
  });

  afterEach(() => {
    // restore seams
    ContainerProviderEntity.setNcpsHttpClient();
  });
});
