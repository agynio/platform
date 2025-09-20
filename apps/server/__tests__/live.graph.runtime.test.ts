import { describe, it, expect } from 'vitest';
import { TemplateRegistry } from '../src/graph/templateRegistry';
import { HandleRegistry } from '../src/graph/handleRegistry';
import { LiveGraphRuntime } from '../src/graph/liveGraph.manager';
import { GraphDefinition } from '../src/graph/types';
import { TemplatePortsRegistry } from '../src/graph/ports.types';

// Simple fixtures
class A {
  value = 0;
  setConfig(cfg: any) { this.value = cfg.value; }
  attach(b: any) { /* simulate linking */ }
  detach(b: any) { /* simulate unlink */ }
}
class B {
  count = 0;
  setConfig(cfg: any) { this.count = cfg.count; }
  subscribe(t: any) { /* creation */ }
  unsubscribe(t: any) { /* destroy */ }
}

const ports: TemplatePortsRegistry = {
  A: {
    sourcePorts: { self: { kind: 'instance' } },
    targetPorts: { self: { kind: 'instance' }, link: { kind: 'method', create: 'attach', destroy: 'detach' } }
  },
  B: {
    sourcePorts: {
      self: { kind: 'instance' }
    },
    targetPorts: {
      self: { kind: 'instance' },
      subscribe: { kind: 'method', create: 'subscribe', destroy: 'unsubscribe' }
    }
  }
};

const makeRuntime = () => {
  const templates = new TemplateRegistry();
  templates.register('A', () => new A());
  templates.register('B', () => new B());
  const handles = new HandleRegistry();
  const runtime = new LiveGraphRuntime(templates, handles, {}, {}, ports);
  return runtime;
};

describe('LiveGraphRuntime basic diff', () => {
  it('adds nodes and edges then updates config', async () => {
    const runtime = makeRuntime();
    const graph1: GraphDefinition = {
      nodes: [
        { id: 'a', data: { template: 'A', config: { value: 1 } } },
        { id: 'b', data: { template: 'B', config: { count: 2 } } }
      ],
      edges: [
  { source: 'a', sourceHandle: 'self', target: 'b', targetHandle: 'subscribe' }
      ]
    };
    const res1 = await runtime.init(graph1);
    expect(res1.addedNodes).toEqual(['a','b']);
    expect(res1.addedEdges.length).toBe(1);

    const graph2: GraphDefinition = {
      nodes: [
        { id: 'a', data: { template: 'A', config: { value: 5 } } }, // config change
        { id: 'b', data: { template: 'B', config: { count: 2 } } }
      ],
      edges: graph1.edges
    };
    const res2 = await runtime.applyGraph(graph2);
    expect(res2.updatedConfigNodes).toContain('a');
  });

  it('recreates node when template changes', async () => {
    const runtime = makeRuntime();
    const g1: GraphDefinition = { nodes: [{ id: 'a', data: { template: 'A', config: { value: 1 } } }], edges: [] };
    await runtime.init(g1);
    const g2: GraphDefinition = { nodes: [{ id: 'a', data: { template: 'B', config: { count: 3 } } }], edges: [] };
    const res = await runtime.applyGraph(g2);
    expect(res.recreatedNodes).toContain('a');
  });

  it('removes node and edges', async () => {
    const runtime = makeRuntime();
    const g1: GraphDefinition = {
      nodes: [
        { id: 'a', data: { template: 'A', config: { value: 1 } } },
        { id: 'b', data: { template: 'B', config: { count: 2 } } }
      ],
  edges: [ { source: 'a', sourceHandle: 'self', target: 'b', targetHandle: 'subscribe' } ]
    };
    await runtime.init(g1);
    const g2: GraphDefinition = { nodes: [{ id: 'a', data: { template: 'A', config: { value: 1 } } }], edges: [] };
    const res = await runtime.applyGraph(g2);
    expect(res.removedNodes).toContain('b');
    expect(res.removedEdges.length).toBe(1);
  });

  it('reversible edge executes and reverses on removal', async () => {
    const runtime = makeRuntime();
    const g1: GraphDefinition = {
      nodes: [
        { id: 'b', data: { template: 'B', config: { count: 0 } } },
        { id: 'a', data: { template: 'A', config: { value: 0 } } }
      ],
  edges: [ { source: 'b', sourceHandle: 'self', target: 'a', targetHandle: 'link' } ]
    };
    await runtime.init(g1);
    const g2: GraphDefinition = { nodes: g1.nodes, edges: [] };
    const res = await runtime.applyGraph(g2);
    expect(res.removedEdges.length).toBe(1);
  });
});
