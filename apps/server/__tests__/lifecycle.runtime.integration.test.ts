import { describe, it, expect, vi } from 'vitest';
import { TemplateRegistry } from '../src/graph/templateRegistry';
import { LiveGraphRuntime } from '../src/graph/liveGraph.manager';
import { LoggerService } from '../src/services/logger.service';
import type { GraphDefinition } from '../src/graph/types';
import type { NodeLifecycle } from '../src/nodes/types';

class LifeNode implements NodeLifecycle<{ a?: number }> {
  public calls: string[] = [];
  configure(_cfg: { a?: number }) { this.calls.push('configure'); }
  start() { this.calls.push('start'); }
  stop() { this.calls.push('stop'); }
  delete() { this.calls.push('delete'); }
}

describe('LiveGraphRuntime lifecycle integration', () => {
  it('calls configure+start on create and stop+delete on removal', async () => {
    const templates = new TemplateRegistry();
    templates.register('Life', () => new LifeNode());
    const runtime = new LiveGraphRuntime(new LoggerService(), templates);

    const g1: GraphDefinition = { nodes: [{ id: 'n1', data: { template: 'Life', config: { a: 1 } } }], edges: [] };
    await runtime.apply(g1);
    const inst = runtime.getNodeInstance<LifeNode>('n1')!;
    expect(inst.calls.slice(0,2)).toEqual(['configure','start']);

    // Update (configure only)
    await runtime.apply({ nodes: [{ id: 'n1', data: { template: 'Life', config: { a: 2 } } }], edges: [] });
    expect(inst.calls).toContain('configure');

    // Remove; should stop+delete
    await runtime.apply({ nodes: [], edges: [] });
    expect(inst.calls.includes('stop')).toBe(true);
    expect(inst.calls.includes('delete')).toBe(true);
  });
});

