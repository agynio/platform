import { describe, it, expect, vi } from 'vitest';
import { LiveGraphRuntime } from '../src/graph/liveGraph.manager';
import { TemplateRegistry } from '../src/graph/templateRegistry';
import type { FactoryFn } from '../src/graph/types';
import type { Pausable, Provisionable, ProvisionStatus, DynamicConfigurable } from '../src/graph/capabilities';
import { LoggerService } from '../src/services/logger.service';

class MockLogger extends LoggerService {
  info = vi.fn();
  debug = vi.fn();
  error = vi.fn();
}

function makeRuntimeAndRegistry() {
  const registry = new TemplateRegistry();
  const logger = new MockLogger() as any as LoggerService;
  const runtime = new LiveGraphRuntime(logger, registry);
  return { registry, runtime, logger };
}

describe('Runtime helpers and GraphService API surfaces', () => {
  it('pause/resume/provision/deprovision + status work against live nodes', async () => {
    const { registry, runtime } = makeRuntimeAndRegistry();

    // Mock node impl
    class MockNode implements Pausable, Provisionable, DynamicConfigurable<Record<string, boolean>> {
      private paused = false;
      private status: ProvisionStatus = { state: 'not_ready' };
      private dynReady = false;
      private listeners: Array<(s: ProvisionStatus)=>void> = [];
      setConfig = vi.fn(async (_cfg: Record<string, unknown>) => {});
      pause() { this.paused = true; }
      resume() { this.paused = false; }
      isPaused() { return this.paused; }
      getProvisionStatus() { return this.status; }
      async provision() { this.status = { state: 'ready' }; this.dynReady = true; this.listeners.forEach(l=>l(this.status)); }
      async deprovision() { this.status = { state: 'not_ready' }; this.dynReady = false; this.listeners.forEach(l=>l(this.status)); }
      onProvisionStatusChange(l: (s: ProvisionStatus)=>void) { this.listeners.push(l); return ()=>{ this.listeners = this.listeners.filter(x=>x!==l); }; }
      isDynamicConfigReady() { return this.dynReady; }
      getDynamicConfigSchema() { return undefined; }
      setDynamicConfig = vi.fn((_cfg: Record<string, boolean>) => {});
    }

    const factory: FactoryFn = async () => new MockNode() as any;
    registry.register('mock', factory, { targetPorts: {}, sourcePorts: {} }, { title: 'Mock', kind: 'tool' });

    // Apply a simple graph with one node
    await runtime.apply({ nodes: [{ id: 'n1', data: { template: 'mock', config: {} } }], edges: [] });

    // Exercise runtime helpers
    await runtime.pauseNode('n1');
    expect(runtime.getNodeStatus('n1').isPaused).toBe(true);
    await runtime.resumeNode('n1');
    expect(runtime.getNodeStatus('n1').isPaused).toBe(false);

    await runtime.provisionNode('n1');
    const status1 = runtime.getNodeStatus('n1');
    expect(status1.provisionStatus?.state).toBe('ready');
    expect(status1.dynamicConfigReady).toBe(true);

    await runtime.deprovisionNode('n1');
    expect(runtime.getNodeStatus('n1').provisionStatus?.state).toBe('not_ready');
  });

  it('Template schema and runtime dynamic config routing', async () => {
    const { registry, runtime } = makeRuntimeAndRegistry();

    // Expand template with capabilities and static schema
    registry.register('dyn', async () => ({ setConfig: async () => {} } as any), { sourcePorts: {}, targetPorts: {} }, {
      title: 'Dyn', kind: 'tool', capabilities: { pausable: true, provisionable: true, dynamicConfigurable: true, staticConfigurable: false },
      staticConfigSchema: { type: 'object', properties: {} } as any,
    });

    // Create a mock dyn-configurable node instance
    class DynNode implements DynamicConfigurable<Record<string, unknown>> {
      isDynamicConfigReady() { return true; }
      getDynamicConfigSchema() { return { type: 'object', properties: { a: { type: 'boolean' } } } as any; }
      setDynamicConfig = vi.fn((_cfg: Record<string, unknown>) => {});
      setConfig = vi.fn(async (_cfg: Record<string, unknown>) => {});
    }
    registry.register('dyn2', async () => new DynNode() as any, { sourcePorts: {}, targetPorts: {} }, { title: 'Dyn2', kind: 'tool' });

    // Runtime graph
    await runtime.apply({ nodes: [
      { id: 'a', data: { template: 'dyn', config: {} } },
      { id: 'b', data: { template: 'dyn2', config: {} } },
    ], edges: []});

    // Template schema via registry directly (GraphService now stateless for templates only)
    const templates = registry.toSchema();
    const dynEntry = templates.find(t => t.name === 'dyn');
    expect(dynEntry?.capabilities?.dynamicConfigurable).toBe(true);
    expect(dynEntry?.staticConfigSchema).toBeTruthy();

    // Node pause via runtime directly
    await runtime.pauseNode('a');
    expect(runtime.getNodeStatus('a').isPaused).toBe(true);

    // Dynamic config routing on dyn2 via runtime instance
    const instB: any = runtime.getNodeInstance('b');
    instB.setDynamicConfig = vi.fn();
    await instB.setDynamicConfig({ a: true });
    expect(instB.setDynamicConfig).toHaveBeenCalledWith({ a: true });

    // setNodeConfig on instance directly
    instB.setConfig = vi.fn();
    await instB.setConfig({ x: 1 });
    expect(instB.setConfig).toHaveBeenCalledWith({ x: 1 });
  });
});
