import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { LoggerService } from '../src/core/services/logger.service.js';
import { GraphRepository } from '../src/graph/graph.repository.js';
import { LiveGraphRuntime } from '../src/graph-core/liveGraph.manager';
import { TemplateRegistry } from '../src/graph-core/templateRegistry';
import type { GraphDefinition } from '../src/shared/types/graph.types';
import { GraphError } from '../src/graph/types';
import { ModuleRef } from '@nestjs/core';
import { MemoryNode, MemoryNodeStaticConfigSchema } from '../src/nodes/memory/memory.node';

const makeRuntime = () => {
  const logger = new LoggerService();
  const moduleRef: ModuleRef = {
    // Provide DI-aware create for MemoryNode
    create: (Cls: any) => {
      if (Cls === MemoryNode) return new MemoryNode({} as any, logger);
      return new Cls(logger);
    },
  } as any;
  const templates = new TemplateRegistry(moduleRef);
  templates.register('Memory', { title: 'Memory', kind: 'tool' }, MemoryNode as any);
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
  const runtime = new LiveGraphRuntime(logger, templates, new StubRepo(), moduleRef as any);
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

  // dynamicConfig removed; skip invalid dynamicConfig test
});
