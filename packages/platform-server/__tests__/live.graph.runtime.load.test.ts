import { describe, it, expect, vi } from 'vitest';
import { LiveGraphRuntime } from '../src/graph/liveGraph.manager';
import type { GraphRepository } from '../src/graph/graph.repository';
import type { PersistedGraph } from '../src/graph/types';
// Avoid importing LoggerService to prevent external deps; use a minimal stub

class TestLogger {
  logs: { level: 'info' | 'error' | 'debug'; msg: string }[] = [];
  info(message: string, ..._optionalParams: any[]) {
    this.logs.push({ level: 'info', msg: `${message}` });
  }
  error(message: string, ..._optionalParams: any[]) {
    this.logs.push({ level: 'error', msg: `${message}` });
  }
  debug(message: string, ..._optionalParams: any[]) {
    this.logs.push({ level: 'debug', msg: `${message}` });
  }
}

// Simple fixture classes
class A { setConfig(cfg: any) { /* no-op */ } }
class B { setConfig(cfg: any) { /* no-op */ } }

// Minimal template registry stub to avoid DI dependencies
class MinimalTemplateRegistry {
  private classes = new Map<string, new () => any>();
  register(name: string, _meta: any, cls: new () => any) {
    this.classes.set(name, cls);
    return this;
  }
  getClass(name: string) {
    return this.classes.get(name);
  }
}

// Fake repository with configurable response
class FakeRepo implements GraphRepository {
  constructor(private readonly persisted: PersistedGraph | null, private readonly throwOnGet = false) { }
  async initIfNeeded(): Promise<void> {}
  async get(name: string): Promise<PersistedGraph | null> {
    if (this.throwOnGet) throw new Error('boom');
    if (!this.persisted) return null;
    return this.persisted;
  }
  async upsert(): Promise<any> { throw new Error('not-implemented'); }
  async upsertNodeState(): Promise<void> { /* noop */ }
}

const makeRuntime = () => {
  const templates = new MinimalTemplateRegistry();
  templates
    .register('A', { title: 'A', kind: 'service' as any }, A as any)
    .register('B', { title: 'B', kind: 'service' as any }, B as any);
  const logger = new TestLogger();
  const runtime = new LiveGraphRuntime(logger as any, templates as any, stubRepo as any);
  return { runtime, logger };
};

// Mock DI resolve to avoid spinning up Nest/Prisma in unit tests
vi.mock('../src/bootstrap/di', () => ({
  resolve: async (token: any) => {
    // token is a class constructor
    return new (token as any)();
  },
}));

describe('LiveGraphRuntime.load', () => {
  it('applies persisted graph when present and returns success', async () => {
    const { runtime, logger } = makeRuntime();
    const persisted: PersistedGraph = {
      name: 'main',
      version: 1,
      updatedAt: new Date().toISOString(),
      nodes: [
        { id: 'a', template: 'A', config: { v: 1 } },
        { id: 'b', template: 'B', config: { c: 2 } },
      ],
      edges: [],
    };
    const repo = new FakeRepo(persisted);
    const res = await runtime.load(repo);
    expect(res.applied).toBe(true);
    expect(res.version).toBe(1);
    expect(runtime.getNodes().length).toBe(2);
    expect(logger.logs.find((l) => l.level === 'info' && l.msg.includes('Applying persisted graph'))).toBeTruthy();
  });

  it('logs and returns applied=false when no graph is found', async () => {
    const { runtime, logger } = makeRuntime();
    const repo = new FakeRepo(null);
    const res = await runtime.load(repo);
    expect(res.applied).toBe(false);
    expect(runtime.getNodes().length).toBe(0);
    expect(logger.logs.find((l) => l.level === 'info' && l.msg.includes('No persisted graph found'))).toBeTruthy();
  });

  it('logs errors and returns applied=false when apply fails', async () => {
    const { runtime, logger } = makeRuntime();
    const bad: PersistedGraph = {
      name: 'main',
      version: 2,
      updatedAt: new Date().toISOString(),
      nodes: [ { id: 'x', template: 'Unknown' } as any ],
      edges: [],
    };
    const repo = new FakeRepo(bad);
    const res = await runtime.load(repo);
    expect(res.applied).toBe(false);
    expect(logger.logs.find((l) => l.level === 'error' && l.msg.includes('Failed to apply initial persisted graph'))).toBeTruthy();
  });

  it('is idempotent across consecutive loads of the same graph', async () => {
    const { runtime } = makeRuntime();
    const persisted: PersistedGraph = {
      name: 'main',
      version: 3,
      updatedAt: new Date().toISOString(),
      nodes: [
        { id: 'a', template: 'A', config: { v: 1 } },
        { id: 'b', template: 'B', config: { c: 2 } },
      ],
      edges: [],
    };
    const repo = new FakeRepo(persisted);
    const res1 = await runtime.load(repo);
    const nodeCount1 = runtime.getNodes().length;
    const res2 = await runtime.load(repo);
    const nodeCount2 = runtime.getNodes().length;
    expect(res1.applied).toBe(true);
    expect(res2.applied).toBe(true); // load success again; apply diff should be no-ops
    expect(nodeCount1).toBe(2);
    expect(nodeCount2).toBe(2); // no duplicates
  });
});
