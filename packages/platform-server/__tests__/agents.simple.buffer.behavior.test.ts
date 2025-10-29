import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentNode as Agent } from '../src/graph/nodes/agent/agent.node';
import { LoggerService } from '../src/core/services/logger.service.js';
import type { ModuleRef } from '@nestjs/core';

class FakeRuns {
  starts: Array<{ nodeId: string; threadId: string; runId: string }> = [];
  async startRun(nodeId: string, threadId: string, runId: string) { this.starts.push({ nodeId, threadId, runId }); }
  async list() { return this.starts.map((s) => ({ nodeId: s.nodeId, threadId: s.threadId, runId: s.runId, status: 'running', startedAt: new Date(), updatedAt: new Date() })); }
  async markTerminated() {}
  async markTerminating() { return 'ok' as const; }
}

function makeAgent() {
  const config = { } as any;
  const logger = new LoggerService();
  const provisioner = { getLLM: async () => ({ call: async () => ({ text: 'ok', output: [] }) }) } as any;
  const runs = new FakeRuns() as any;
  const moduleRef: ModuleRef = { create: (Cls: any) => new Cls() } as any;
  const agent = new Agent(config, logger, provisioner, runs, moduleRef);
  agent.init({ nodeId: 'agent-buf' });
  return { agent, runs };
}

describe('Agent buffer behavior', () => {
  it('debounce delays run start and batches within window', async () => {
    vi.useFakeTimers();
    const { agent, runs } = makeAgent();
    agent.setConfig({ debounceMs: 50, processBuffer: 'allTogether', whenBusy: 'wait' });

    const p1 = agent.invoke('td', { content: 'a', info: {} });
    // Enqueue another within debounce window; should batch into the same run
    const p2 = agent.invoke('td', { content: 'b', info: {} });

    // Before debounce elapses, no run should have started
    await vi.advanceTimersByTimeAsync(40);
    expect(runs.starts.length).toBe(0);

    // After window, exactly one run should start
    await vi.advanceTimersByTimeAsync(20);
    expect(runs.starts.length).toBe(1);
    await Promise.all([p1, p2]);
  });

  it('oneByOne starts a run per quick message', async () => {
    const { agent, runs } = makeAgent();
    agent.setConfig({ processBuffer: 'oneByOne', debounceMs: 0, whenBusy: 'wait' });
    await agent.invoke('t1', { content: 'a', info: {} });
    await agent.invoke('t1', { content: 'b', info: {} });
    await agent.invoke('t1', { content: 'c', info: {} });
    expect(runs.starts.length).toBeGreaterThanOrEqual(3);
  });

  it("allTogether batches quick messages into a single run when debounced", async () => {
    vi.useFakeTimers();
    const { agent, runs } = makeAgent();
    agent.setConfig({ processBuffer: 'allTogether', debounceMs: 30, whenBusy: 'wait' });
    const p1 = agent.invoke('tA', { content: 'a', info: {} });
    const p2 = agent.invoke('tA', { content: 'b', info: {} });
    await vi.advanceTimersByTimeAsync(35);
    await Promise.all([p1, p2]);
    expect(runs.starts.length).toBe(1);
  });

  it("whenBusy='injectAfterTools' injects without starting extra runs", async () => {
    const { agent, runs } = makeAgent();
    agent.setConfig({ whenBusy: 'injectAfterTools', debounceMs: 0 });
    const p = agent.invoke('t2', { content: 'start', info: {} });
    const p2 = agent.invoke('t2', { content: 'follow', info: {} });
    await Promise.all([p, p2]);
    expect(runs.starts.length).toBe(1);
  });
});
