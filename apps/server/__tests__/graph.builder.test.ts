import { describe, it, expect } from 'vitest';
import {
  GraphBuilderService,
  TemplateRegistry,
  HandleRegistry,
  GraphDefinition,
  GraphError,
} from '../src/graph';

// Minimal fake classes to test wiring logic
class ToolA { name = 'A'; }
class ToolB { name = 'B'; }
class Agent {
  tools: any[] = [];
  config: any;
  addTool(t: any) { this.tools.push(t); }
  setConfig(c: any) { this.config = c; }
}
class SubscriberTarget {
  subs: any[] = [];
  subscribe(agent: any) { this.subs.push(agent); }
}

describe('GraphBuilderService', () => {
  const createBuilder = () => {
    const registry = new TemplateRegistry()
      .register('toolA', () => new ToolA())
      .register('toolB', () => new ToolB())
      .register('agent', () => new Agent())
      .register('subscriber', () => new SubscriberTarget());
    const handleRegistry = new HandleRegistry();
    return new GraphBuilderService(registry, handleRegistry);
  };

  it('wires method(self) edges and applies config automatically', async () => {
    const builder = createBuilder();
    const graph: GraphDefinition = {
      nodes: [
        { id: 'a', data: { template: 'toolA' } },
        { id: 'b', data: { template: 'toolB' } },
        { id: 'agent', data: { template: 'agent', config: { role: 'architect' } } },
        { id: 'sub', data: { template: 'subscriber' } },
      ],
      edges: [
        { source: 'agent', sourceHandle: 'addTool', target: 'a', targetHandle: '$self' },
        { source: 'agent', sourceHandle: 'addTool', target: 'b', targetHandle: '$self' },
        { source: 'sub', sourceHandle: 'subscribe', target: 'agent', targetHandle: '$self' },
      ],
    };
    const { instances, errors } = await builder.build(graph, {});
    expect(errors).toHaveLength(0);
    const agent = instances['agent'] as Agent;
    expect(agent.tools.map(t => t.name).sort()).toEqual(['A','B']);
    expect(agent.config).toEqual({ role: 'architect' });
    const sub = instances['sub'] as SubscriberTarget;
    expect(sub.subs[0]).toBe(agent);
  });

  it('errors when both endpoints are methods', async () => {
    const builder = createBuilder();
    const graph: GraphDefinition = {
      nodes: [
        { id: 'agent', data: { template: 'agent' } },
        { id: 'sub', data: { template: 'subscriber' } },
      ],
      edges: [
        // subscribe(agent) but we incorrectly call addTool(agent) (method-method) by referencing wrong handle
        { source: 'agent', sourceHandle: 'addTool', target: 'sub', targetHandle: 'subscribe' },
      ],
    };
  await expect(builder.build(graph, {})).rejects.toMatchObject({ code: 'AMBIGUOUS_CALLABLE' });
  });

  it('errors when no endpoint is a method', async () => {
    const builder = createBuilder();
    const graph: GraphDefinition = {
      nodes: [
        { id: 'a', data: { template: 'toolA' } },
        { id: 'b', data: { template: 'toolB' } },
      ],
      edges: [
        // toolA.name -> toolB.name (both properties)
        { source: 'a', sourceHandle: 'name', target: 'b', targetHandle: 'name' },
      ],
    };
  await expect(builder.build(graph, {})).rejects.toMatchObject({ code: 'MISSING_CALLABLE' });
  });

  it('collects multiple errors in continueOnError mode', async () => {
    const builder = createBuilder();
    const graph: GraphDefinition = {
      nodes: [
        { id: 'agent', data: { template: 'agent' } },
        { id: 'missing', data: { template: 'notRegistered' } },
        { id: 'tool', data: { template: 'toolA' } },
      ],
      edges: [
        { source: 'agent', sourceHandle: 'addTool', target: 'tool', targetHandle: '$self' },
        { source: 'agent', sourceHandle: 'addTool', target: 'ghost', targetHandle: '$self' }, // missing node
      ],
    };
    const { errors } = await builder.build(graph, {}, { continueOnError: true });
    const codes = errors.map(e => e.code).sort();
    expect(codes).toContain('UNKNOWN_TEMPLATE');
    expect(codes).toContain('MISSING_NODE');
  });
});
