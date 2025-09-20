import { describe, it, expect } from 'vitest';
import { TemplateRegistry } from '../src/graph/templateRegistry';

import { LiveGraphRuntime } from '../src/graph/liveGraph.manager';
import { GraphDefinition } from '../src/graph/types';
import { TemplatePortsRegistry } from '../src/graph/ports.types';
import { LoggerService } from '../src/services/logger.service';

// Simple fixtures
class A {
  value = 0;
  setConfig(cfg: any) {
    this.value = cfg.value;
  }
  attach(b: any) {
    /* simulate linking */
  }
  detach(b: any) {
    /* simulate unlink */
  }
}
class B {
  count = 0;
  setConfig(cfg: any) {
    this.count = cfg.count;
  }
  subscribe(t: any) {
    /* creation */
  }
  unsubscribe(t: any) {
    /* destroy */
  }
}

// ports now provided inline during template registration; kept type import for clarity

const makeRuntime = () => {
  const templates = new TemplateRegistry();
  templates
    .register('A', () => new A(), {
      sourcePorts: { self: { kind: 'instance' } },
      targetPorts: { self: { kind: 'instance' }, link: { kind: 'method', create: 'attach', destroy: 'detach' } },
    })
    .register('B', () => new B(), {
      sourcePorts: { self: { kind: 'instance' } },
      targetPorts: {
        self: { kind: 'instance' },
        subscribe: { kind: 'method', create: 'subscribe', destroy: 'unsubscribe' },
      },
    });
  const runtime = new LiveGraphRuntime(new LoggerService(), templates);
  return runtime;
};

describe('LiveGraphRuntime basic diff', () => {
  it('adds nodes and edges then updates config', async () => {
    const runtime = makeRuntime();
    const graph1: GraphDefinition = {
      nodes: [
        { id: 'a', data: { template: 'A', config: { value: 1 } } },
        { id: 'b', data: { template: 'B', config: { count: 2 } } },
      ],
      edges: [{ source: 'a', sourceHandle: 'self', target: 'b', targetHandle: 'subscribe' }],
    };
    const res1 = await runtime.apply(graph1);
    expect(res1.addedNodes).toEqual(['a', 'b']);
    expect(res1.addedEdges.length).toBe(1);

    const graph2: GraphDefinition = {
      nodes: [
        { id: 'a', data: { template: 'A', config: { value: 5 } } }, // config change
        { id: 'b', data: { template: 'B', config: { count: 2 } } },
      ],
      edges: graph1.edges,
    };
    const res2 = await runtime.apply(graph2);
    expect(res2.updatedConfigNodes).toContain('a');
  });

  it('recreates node when template changes', async () => {
    const runtime = makeRuntime();
    const g1: GraphDefinition = { nodes: [{ id: 'a', data: { template: 'A', config: { value: 1 } } }], edges: [] };
    await runtime.apply(g1);
    const g2: GraphDefinition = { nodes: [{ id: 'a', data: { template: 'B', config: { count: 3 } } }], edges: [] };
    const res = await runtime.apply(g2);
    expect(res.recreatedNodes).toContain('a');
  });

  it('removes node and edges', async () => {
    const runtime = makeRuntime();
    const g1: GraphDefinition = {
      nodes: [
        { id: 'a', data: { template: 'A', config: { value: 1 } } },
        { id: 'b', data: { template: 'B', config: { count: 2 } } },
      ],
      edges: [{ source: 'a', sourceHandle: 'self', target: 'b', targetHandle: 'subscribe' }],
    };
    await runtime.apply(g1);
    const g2: GraphDefinition = { nodes: [{ id: 'a', data: { template: 'A', config: { value: 1 } } }], edges: [] };
    const res = await runtime.apply(g2);
    expect(res.removedNodes).toContain('b');
    expect(res.removedEdges.length).toBe(1);
  });

  it('reversible edge executes and reverses on removal', async () => {
    const runtime = makeRuntime();
    const g1: GraphDefinition = {
      nodes: [
        { id: 'b', data: { template: 'B', config: { count: 0 } } },
        { id: 'a', data: { template: 'A', config: { value: 0 } } },
      ],
      edges: [{ source: 'b', sourceHandle: 'self', target: 'a', targetHandle: 'link' }],
    };
    await runtime.apply(g1);
    const g2: GraphDefinition = { nodes: g1.nodes, edges: [] };
    const res = await runtime.apply(g2);
    expect(res.removedEdges.length).toBe(1);
  });
});
