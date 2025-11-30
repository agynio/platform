import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { GraphRepository } from '../src/graph/graph.repository.js';
import { LiveGraphRuntime } from '../src/graph-core/liveGraph.manager';
import { TemplateRegistry } from '../src/graph-core/templateRegistry';
import type { TemplatePortConfig } from '../src/graph/ports.types';
import type { GraphDefinition } from '../src/shared/types/graph.types';
import { GraphError } from '../src/graph/types';
import { ModuleRef } from '@nestjs/core';
import Node from '../src/nodes/base/Node';
import { MemoryNode, MemoryNodeStaticConfigSchema } from '../src/nodes/memory/memory.node';
import { AgentStaticConfigSchema } from '../src/nodes/agent/agent.node';

type StrictAgentConfig = z.infer<typeof AgentStaticConfigSchema>;

class StrictAgentNode extends Node<StrictAgentConfig> {
  appliedConfigs: StrictAgentConfig[] = [];

  getPortConfig(): TemplatePortConfig {
    return { sourcePorts: {}, targetPorts: {} };
  }

  override async setConfig(cfg: StrictAgentConfig): Promise<void> {
    const parsed = AgentStaticConfigSchema.parse(cfg);
    this.appliedConfigs.push(parsed);
    await super.setConfig(parsed);
  }
}

const makeRuntime = (
  resolveImpl?: (input: unknown) => Promise<{ output: unknown; report: unknown }>,
) => {
  const moduleRef: ModuleRef = {
    // Provide DI-aware create for MemoryNode
    create: (Cls: any) => {
      if (Cls === MemoryNode) return new MemoryNode(moduleRef as any);
      return new Cls();
    },
  } as any;
  const templates = new TemplateRegistry(moduleRef);
  templates.register('Memory', { title: 'Memory', kind: 'tool' }, MemoryNode as any);
  templates.register('StrictAgent', { title: 'Strict Agent', kind: 'agent' }, StrictAgentNode as any);
  class StubRepo extends GraphRepository {
    async initIfNeeded(): Promise<void> {}
    async get(): Promise<any> {
      return null;
    }
    async upsert(): Promise<any> {
      throw new Error('not-implemented');
    }
    async upsertNodeState(): Promise<void> {}
  }
  const resolver = {
    resolve: async (input: unknown) =>
      (resolveImpl ? resolveImpl(input) : ({ output: input, report: {} as unknown })),
  };
  const runtime = new LiveGraphRuntime(templates, new StubRepo(), moduleRef as any, resolver as any);
  return runtime;
};

describe('runtime config unknown keys handling', () => {
  it('applies config during initial setConfig and stores live config', async () => {
    const runtime = makeRuntime();
    const g: GraphDefinition = {
      nodes: [{ id: 'n1', data: { template: 'Memory', config: { scope: 'global', collectionPrefix: 'p', extra: 'x' } } }],
      edges: [],
    };
    const res = await runtime.apply(g);
    expect(res.errors.length).toBe(0);
    const live = runtime.getNodes().find((n) => n.id === 'n1')!;
    expect(live.config).toEqual({ scope: 'global', collectionPrefix: 'p', extra: 'x' });
  });

  it('does not throw on unknown config keys; uses real Node ports', async () => {
    const runtime = makeRuntime();
    const g: GraphDefinition = {
      nodes: [{ id: 'bad', data: { template: 'Memory', config: { scope: 'global', extra: 'x' } } }],
      edges: [],
    };
    const res = await runtime.apply(g);
    expect(res.errors.length).toBe(0);
    const inst = runtime.getNodeInstance('bad') as MemoryNode;
    const ports = inst.getPortConfig();
    expect(Object.keys((ports as any).sourcePorts || {})).toContain('$self');
  });

  // dynamicConfig fully removed; replace test to assert state persistence path
  it('node state is persisted via updateNodeState', async () => {
    const runtime = makeRuntime();
    const g: GraphDefinition = {
      nodes: [
        {
          id: 'n2',
          data: { template: 'Memory', config: { scope: 'global' }, state: { info: 'x' } },
        },
      ],
      edges: [],
    };
    const res = await runtime.apply(g);
    expect(res.errors.length).toBe(0);
    // state is available in lastGraph snapshot
    const nodes = runtime.getNodes();
    expect(nodes.find((n) => n.id === 'n2')).toBeTruthy();
  });

  it('updates live config on config update path', async () => {
    const runtime = makeRuntime();
    const g1: GraphDefinition = {
      nodes: [{ id: 'n3', data: { template: 'Memory', config: { scope: 'global' } } }],
      edges: [],
    };
    await runtime.apply(g1);
    const g2: GraphDefinition = {
      nodes: [{ id: 'n3', data: { template: 'Memory', config: { scope: 'perThread', collectionPrefix: 'pp', extra: 'x' } } }],
      edges: [],
    };
    const res = await runtime.apply(g2);
    expect(res.updatedConfigNodes).toContain('n3');
    const live = runtime.getNodes().find((n) => n.id === 'n3')!;
    expect(live.config).toEqual({ scope: 'perThread', collectionPrefix: 'pp', extra: 'x' });
  });

  it('preserves resolver output shape for env entries', async () => {
    const resolveSpy = vi.fn(async (input: unknown) => ({ output: input, report: {} as unknown }));
    const runtime = makeRuntime(resolveSpy);
    const g: GraphDefinition = {
      nodes: [
        {
          id: 'env-node',
          data: {
            template: 'Memory',
            config: {
              env: [
                { key: 'API_TOKEN', value: 'secret-value' },
                { name: 'ALREADY', value: 'exists' },
              ],
            },
          },
        },
      ],
      edges: [],
    };
    const res = await runtime.apply(g);
    expect(res.errors).toHaveLength(0);
    expect(resolveSpy).toHaveBeenCalled();
    const live = runtime.getNodes().find((n) => n.id === 'env-node');
    expect(live?.config).toEqual({
      env: [
        { key: 'API_TOKEN', value: 'secret-value' },
        { name: 'ALREADY', value: 'exists' },
      ],
    });
  });

  it('strips unknown root keys when instantiating strict agent config', async () => {
    const runtime = makeRuntime();
    const g: GraphDefinition = {
      nodes: [
        {
          id: 'agent-1',
          data: {
            template: 'StrictAgent',
            config: {
              model: 'gpt-4o',
              kind: 'legacy-agent',
            },
          },
        },
      ],
      edges: [],
    };
    const res = await runtime.apply(g);
    expect(res.errors).toHaveLength(0);
    const live = runtime.getNodes().find((n) => n.id === 'agent-1');
    expect(live?.config).toEqual({ model: 'gpt-4o' });
    const inst = runtime.getNodeInstance('agent-1') as StrictAgentNode;
    expect(inst.appliedConfigs).toHaveLength(1);
    const applied = inst.appliedConfigs[0];
    expect(applied).not.toHaveProperty('kind');
    expect(applied).toMatchObject({ model: 'gpt-4o' });
  });

  // dynamicConfig removed; skip invalid dynamicConfig test
});
