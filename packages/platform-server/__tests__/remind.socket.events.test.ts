import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RemindMeNode } from '../src/graph/nodes/tools/remind_me/remind_me.node';
import { LoggerService } from '../src/core/services/logger.service';

describe('RemindMe socket reminder_count events', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); vi.clearAllTimers(); vi.restoreAllMocks(); });

  it('emits count on schedule and on fire (decrement)', async () => {
    const logger = new LoggerService();
    const emitted: Array<{ nodeId: string; count: number }> = [];
    const gatewayStub: any = { emitReminderCount: (nodeId: string, count: number) => { emitted.push({ nodeId, count }); } };

    const node = new RemindMeNode(logger as any, gatewayStub);
    node.init({ nodeId: 'node-a' });
    await node.provision();
    const tool = node.getTool();

    const caller_agent: any = { invoke: vi.fn(async () => undefined) };
    await tool.execute({ delayMs: 10, note: 'Ping' } as any, { threadId: 't-1', callerAgent: caller_agent, finishSignal: { activate() {}, deactivate() {}, isActive: false } });

    // Expect an emit with count=1 after scheduling
    expect(emitted.length).toBeGreaterThanOrEqual(1);
    const last = emitted[emitted.length - 1];
    expect(last.nodeId).toBe('node-a');
    expect(last.count).toBe(1);

    await vi.advanceTimersByTimeAsync(10);
    // Expect a subsequent emit with count=0 after firing
    const final = emitted[emitted.length - 1];
    expect(final.count).toBe(0);
  });

  it('emits count=0 on deprovision/destroy', async () => {
    const logger = new LoggerService();
    const emitted: Array<{ nodeId: string; count: number }> = [];
    const gatewayStub: any = { emitReminderCount: (nodeId: string, count: number) => { emitted.push({ nodeId, count }); } };

    const node = new RemindMeNode(logger as any, gatewayStub);
    node.init({ nodeId: 'node-b' });
    await node.provision();
    const tool = node.getTool();
    const caller_agent: any = { invoke: vi.fn(async () => undefined) };
    await tool.execute({ delayMs: 10_000, note: 'Later' } as any, { threadId: 't', callerAgent: caller_agent, finishSignal: { activate() {}, deactivate() {}, isActive: false } });
    expect(emitted[emitted.length - 1]?.count).toBe(1);

    await node.deprovision();
    // After deprovision, destroy() clears timers and should emit count=0
    expect(emitted[emitted.length - 1]?.count).toBe(0);
  });
});
