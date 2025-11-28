import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReadinessWatcher } from '../src/utils/readinessWatcher.js';

// Minimal stub runtime
class RuntimeStub {
  private statuses: Record<string, any[]> = {};
  private idx: Record<string, number> = {};
  private instances = new Set<string>();

  setSequence(nodeId: string, seq: any[]) {
    this.statuses[nodeId] = seq;
    this.idx[nodeId] = 0;
    this.instances.add(nodeId);
  }
  remove(nodeId: string) {
    this.instances.delete(nodeId);
  }
  getNodeInstance(id: string) {
    return this.instances.has(id) ? {} : undefined;
  }
  getNodeStatus(id: string) {
    const i = this.idx[id] ?? 0;
    const arr = this.statuses[id] ?? [];
    const v = arr[Math.min(i, arr.length - 1)] || {};
    // advance index if not at end to simulate changes over time
    if (i < arr.length - 1) this.idx[id] = i + 1;
    return v;
  }
}

describe('ReadinessWatcher', () => {
  let runtime: any;
  let emit: any;

  beforeEach(() => {
    vi.useRealTimers();
    runtime = new RuntimeStub();
    emit = vi.fn();
  });

  it('emits once when node becomes ready', async () => {
    const watcher = new ReadinessWatcher(runtime as any, emit, { error: () => {} } as any, {
      pollIntervalMs: 5,
      timeoutMs: 200,
    });
    const nodeId = 'n1';
    runtime.setSequence(nodeId, [
      { provisionStatus: { state: 'starting' } },
      { provisionStatus: { state: 'ready' } },
    ]);

    // Start twice immediately to verify debounce of concurrent watchers
    watcher.start(nodeId);
    watcher.start(nodeId);

    // wait enough time for polling
    await new Promise((r) => setTimeout(r, 50));

    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith(nodeId);

    watcher.stopAll();
  });

  it('does not emit if never ready within timeout', async () => {
    const watcher = new ReadinessWatcher(runtime as any, emit, { error: () => {} } as any, {
      pollIntervalMs: 5,
      timeoutMs: 30,
    });
    const nodeId = 'n2';
    runtime.setSequence(nodeId, [
      { provisionStatus: { state: 'starting' } },
      { provisionStatus: { state: 'starting' } },
      { provisionStatus: { state: 'starting' } },
    ]);

    watcher.start(nodeId);
    await new Promise((r) => setTimeout(r, 60));

    expect(emit).not.toHaveBeenCalled();

    watcher.stopAll();
  });

  it('cancels when node disappears', async () => {
    const watcher = new ReadinessWatcher(runtime as any, emit, { error: () => {} } as any, {
      pollIntervalMs: 5,
      timeoutMs: 100,
    });
    const nodeId = 'n3';
    runtime.setSequence(nodeId, [
      { provisionStatus: { state: 'starting' } },
      { provisionStatus: { state: 'starting' } },
    ]);

    watcher.start(nodeId);
    await new Promise((r) => setTimeout(r, 10));
    runtime.remove(nodeId);
    await new Promise((r) => setTimeout(r, 30));

    expect(emit).not.toHaveBeenCalled();

    watcher.stopAll();
  });
});
