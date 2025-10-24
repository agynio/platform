import { describe, it, expect, vi } from 'vitest';
import { TemplateRegistry } from '../src/graph/templateRegistry';
import { LiveGraphRuntime } from '../src/graph/liveGraph.manager';
import { GraphDefinition, GraphError } from '../src/graph/types';
import { LoggerService } from '../src/core/services/logger.service.js';
import { z } from 'zod';

// Fake template with strict config schemas
class StrictNode {
  public appliedStatic?: Record<string, unknown>;
  public appliedDynamic?: Record<string, unknown>;
  setConfig(cfg: Record<string, unknown>) {
    const schema = z.object({ foo: z.string() }).strict();
    const parsed = schema.parse(cfg);
    this.appliedStatic = parsed;
  }
  setDynamicConfig(cfg: Record<string, unknown>) {
    const schema = z.object({ bar: z.number() }).strict();
    const parsed = schema.parse(cfg);
    this.appliedDynamic = parsed;
  }
}

const makeRuntime = () => {
  const templates = new TemplateRegistry();
  templates.register('Strict', () => new StrictNode());
  class StubRepo extends GraphRepository { async initIfNeeded(): Promise<void> {} async get(): Promise<any> { return null; } async upsert(): Promise<any> { throw new Error('not-implemented'); } async upsertNodeState(): Promise<void> {} }
  const runtime = new LiveGraphRuntime(new LoggerService(), templates, new StubRepo());
  return runtime;
};

describe('runtime config unknown keys handling', () => {
  it('strips extra keys during initial setConfig and stores cleaned config', async () => {
    const runtime = makeRuntime();
    const g: GraphDefinition = {
      nodes: [{ id: 'n1', data: { template: 'Strict', config: { foo: 'ok', extra: 'x' } } }],
      edges: [],
    };
    const res = await runtime.apply(g);
    expect(res.errors.length).toBe(0);
    const inst = runtime.getNodeInstance('n1') as StrictNode;
    expect(inst.appliedStatic).toEqual({ foo: 'ok' });
    // live config should be cleaned
    const live = runtime.getNodes().find((n) => n.id === 'n1')!;
    expect(live.config).toEqual({ foo: 'ok' });
  });

  it('throws GraphError with nodeId on true validation error', async () => {
    const runtime = makeRuntime();
    const g: GraphDefinition = {
      nodes: [{ id: 'bad', data: { template: 'Strict', config: { foo: 123 } } }],
      edges: [],
    };
    await expect(runtime.apply(g)).rejects.toMatchObject({
      name: 'GraphError',
      code: 'NODE_INIT_ERROR',
      nodeId: 'bad',
    } as Partial<GraphError>);
  });

  it('strips extra keys for dynamic config updates', async () => {
    const runtime = makeRuntime();
    const g: GraphDefinition = {
      nodes: [
        {
          id: 'n2',
          data: { template: 'Strict', config: { foo: 'ok' }, dynamicConfig: { bar: 1, ignore: true } },
        },
      ],
      edges: [],
    };
    const res = await runtime.apply(g);
    expect(res.errors.length).toBe(0);
    const inst = runtime.getNodeInstance('n2') as StrictNode;
    expect(inst.appliedDynamic).toEqual({ bar: 1 });
  });

  it('strips extra keys on config update path and updates live config', async () => {
    const runtime = makeRuntime();
    const g1: GraphDefinition = {
      nodes: [{ id: 'n3', data: { template: 'Strict', config: { foo: 'ok' } } }],
      edges: [],
    };
    await runtime.apply(g1);
    const g2: GraphDefinition = {
      nodes: [{ id: 'n3', data: { template: 'Strict', config: { foo: 'next', extra: 'x' } } }],
      edges: [],
    };
    const res = await runtime.apply(g2);
    expect(res.updatedConfigNodes).toContain('n3');
    const inst = runtime.getNodeInstance('n3') as StrictNode;
    expect(inst.appliedStatic).toEqual({ foo: 'next' });
    const live = runtime.getNodes().find((n) => n.id === 'n3')!;
    expect(live.config).toEqual({ foo: 'next' });
  });

  it('invalid dynamicConfig at init rejects with NODE_INIT_ERROR and nodeId', async () => {
    const runtime = makeRuntime();
    const g: GraphDefinition = {
      nodes: [
        {
          id: 'dyn-bad',
          data: { template: 'Strict', config: { foo: 'ok' }, dynamicConfig: { bar: 'nope' as unknown as number } },
        },
      ],
      edges: [],
    };
    await expect(runtime.apply(g)).rejects.toMatchObject({
      name: 'GraphError',
      code: 'NODE_INIT_ERROR',
      nodeId: 'dyn-bad',
    } as Partial<GraphError>);
  });
});
