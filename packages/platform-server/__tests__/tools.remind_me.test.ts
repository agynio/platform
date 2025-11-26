import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RemindMeFunctionTool } from '../src/nodes/tools/remind_me/remind_me.tool';
import { HumanMessage } from '@agyn/llm';

// Minimal typed stub for the caller agent used by the tool
interface CallerAgentStub { invoke(thread: string, messages: HumanMessage[]): Promise<unknown>; }

// Helper to extract callable tool
function getToolInstance() {
  const prismaStub = {
    getClient() {
      return {
        reminder: {
          create: vi.fn(async (args: any) => ({ ...args.data, createdAt: new Date() })),
          update: vi.fn(async () => ({})),
        },
      } as any;
    },
  };
  const tool = new RemindMeFunctionTool(prismaStub as any);
  return tool;
}

describe('RemindMeTool', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('schedules reminder and invokes caller_agent after delay', async () => {
    const tool = getToolInstance();

    const invokeSpy = vi.fn(async (_t: string, _m: HumanMessage[]) => undefined);
    const caller_agent: CallerAgentStub = { invoke: invokeSpy };
    const thread_id = 't-123';

    const res = await tool.execute(
      { delayMs: 1000, note: 'Ping' } as any,
      { threadId: thread_id, callerAgent: caller_agent as any, finishSignal: { activate() {}, deactivate() {}, isActive: false } as any },
    );

    // Immediate ack
    const parsed = typeof res === 'string' ? JSON.parse(res) : res;
    expect(parsed.status).toBe('scheduled');
    expect(parsed.etaMs).toBe(1000);
    expect(typeof parsed.at).toBe('string');

    // Advance timers and ensure invoke called once with system message
    await vi.advanceTimersByTimeAsync(1000);

    expect(invokeSpy).toHaveBeenCalledTimes(1);
    const calls0 = invokeSpy.mock.calls as unknown as any[][];
    expect(calls0[0][0]).toBe(thread_id);
    expect(calls0[0][1]).toHaveLength(1);
    const m = calls0[0][1][0];
    expect(m).toBeInstanceOf(HumanMessage);
    expect(m.text).toBe('You asked me to remind you: Ping');
  });

  it('registry tracks active reminders until fired', async () => {
    const tool = getToolInstance() as any;
    const invokeSpy = vi.fn(async (_t: string, _m: HumanMessage[]) => undefined);
    const caller_agent: CallerAgentStub = { invoke: invokeSpy };
    const cfg = { threadId: 't-reg', callerAgent: caller_agent } as any;

    // schedule two timers
    await tool.execute({ delayMs: 1000, note: 'A' } as any, cfg);
    await tool.execute({ delayMs: 2000, note: 'B' } as any, cfg);

    // tool exposes getActiveReminders via instance
    const active1 = (tool as any).getActiveReminders() as any[];
    expect(active1.length).toBe(2);

    await vi.advanceTimersByTimeAsync(1000);
    const active2 = (tool as any).getActiveReminders() as any[];
    expect(active2.length).toBe(1);
    expect(active2[0].note).toBe('B');

    await vi.advanceTimersByTimeAsync(1000);
    const active3 = (tool as any).getActiveReminders() as any[];
    expect(active3.length).toBe(0);
  });

  it('destroy cancels timers and clears registry', async () => {
    const tool = getToolInstance() as any;
    const caller_agent: CallerAgentStub = { invoke: vi.fn(async (_t: string, _m: HumanMessage[]) => undefined) };
    await tool.execute({ delayMs: 10_000, note: 'X' } as any, { threadId: 't', callerAgent: caller_agent as any, finishSignal: { activate() {}, deactivate() {}, isActive: false } });
    expect((tool as any).getActiveReminders().length).toBe(1);
    await tool.destroy();
    expect((tool as any).getActiveReminders().length).toBe(0);
    await vi.advanceTimersByTimeAsync(10_000);
    expect((caller_agent as any).invoke).not.toHaveBeenCalled();
  });

  it('enforces cap on active reminders', async () => {
    const tool = getToolInstance() as any;
    const caller_agent: CallerAgentStub = { invoke: vi.fn(async (_t: string, _m: HumanMessage[]) => undefined) };
    (tool as any).maxActive = 1;
    await tool.execute({ delayMs: 10_000, note: 'ok' } as any, { threadId: 't', callerAgent: caller_agent as any, finishSignal: { activate() {}, deactivate() {}, isActive: false } });
    await expect(
      tool.execute({ delayMs: 10_000, note: 'nope' } as any, { threadId: 't', callerAgent: caller_agent as any, finishSignal: { activate() {}, deactivate() {}, isActive: false } })
    ).rejects.toThrow();
  });

  it('schedules immediate reminder when delayMs=0', async () => {
    const tool = getToolInstance();
    const invokeSpy = vi.fn(async (_t: string, _m: HumanMessage[]) => undefined);
    const caller_agent: CallerAgentStub = { invoke: invokeSpy };
    const config = { threadId: 't-0', callerAgent: caller_agent as any, finishSignal: { activate() {}, deactivate() {}, isActive: false } } as any;

    const res = await tool.execute({ delayMs: 0, note: 'Now' } as any, config);
    const parsed = typeof res === 'string' ? JSON.parse(res) : res;
    expect(parsed.status).toBe('scheduled');
    expect(parsed.etaMs).toBe(0);

    // Run pending timers immediately
    await vi.runOnlyPendingTimersAsync();
    expect(invokeSpy).toHaveBeenCalledTimes(1);
    {
      const calls = invokeSpy.mock.calls as unknown as any[][];
      expect(calls[0][1]).toHaveLength(1);
      expect(calls[0][1][0].text).toBe('You asked me to remind you: Now');
    }
  });

  it('supports multiple concurrent reminders for the same thread (delayMs=0)', async () => {
    const tool = getToolInstance();
    const invokeSpy = vi.fn(async (_t: string, _m: HumanMessage[]) => undefined);
    const caller_agent: CallerAgentStub = { invoke: invokeSpy };
    const cfg = { threadId: 't-x', callerAgent: caller_agent as any, finishSignal: { activate() {}, deactivate() {}, isActive: false } } as any;

    await tool.execute({ delayMs: 0, note: 'A' } as any, cfg);
    await tool.execute({ delayMs: 0, note: 'B' } as any, cfg);

    await vi.runOnlyPendingTimersAsync();

    expect(invokeSpy).toHaveBeenCalledTimes(2);
    const calls = invokeSpy.mock.calls as unknown as any[][];
    const payloads = calls.map((c) => c[1][0].text).sort();
    expect(payloads[0]).toBe('You asked me to remind you: A');
    expect(payloads[1]).toBe('You asked me to remind you: B');
    expect(calls[0][0]).toBe('t-x');
    expect(calls[1][0]).toBe('t-x');
  });

  it('handles overlapping delays for the same thread', async () => {
    const tool = getToolInstance();
    const invokeSpy = vi.fn(async (_t: string, _m: HumanMessage[]) => undefined);
    const caller_agent: CallerAgentStub = { invoke: invokeSpy };
    const cfg = { threadId: 't-ovl', callerAgent: caller_agent as any, finishSignal: { activate() {}, deactivate() {}, isActive: false } } as any;

    await tool.execute({ delayMs: 500, note: 'half' } as any, cfg);
    await tool.execute({ delayMs: 1000, note: 'full' } as any, cfg);

    await vi.advanceTimersByTimeAsync(500);
    expect(invokeSpy).toHaveBeenCalledTimes(1);
    {
      const calls = invokeSpy.mock.calls as unknown as any[][];
      expect(calls[0][1][0].text).toBe('You asked me to remind you: half');
    }

    await vi.advanceTimersByTimeAsync(500);
    expect(invokeSpy).toHaveBeenCalledTimes(2);
    {
      const calls = invokeSpy.mock.calls as unknown as any[][];
      expect(calls[1][1][0].text).toBe('You asked me to remind you: full');
    }
  });

  it('routes reminders to mixed threads correctly', async () => {
    const tool = getToolInstance();
    const invokeSpy = vi.fn(async (_t: string, _m: HumanMessage[]) => undefined);
    const caller_agent: CallerAgentStub = { invoke: invokeSpy };

    await tool.execute({ delayMs: 10, note: 'one' } as any, { threadId: 't-1', callerAgent: caller_agent as any, finishSignal: { activate() {}, deactivate() {}, isActive: false } } as any);
    await tool.execute({ delayMs: 20, note: 'two' } as any, { threadId: 't-2', callerAgent: caller_agent as any, finishSignal: { activate() {}, deactivate() {}, isActive: false } } as any);

    await vi.advanceTimersByTimeAsync(10);
    expect(invokeSpy).toHaveBeenCalledTimes(1);
    {
      const calls = invokeSpy.mock.calls as unknown as any[][];
      expect(calls[0][0]).toBe('t-1');
      expect(calls[0][1][0].text).toBe('You asked me to remind you: one');
    }

    await vi.advanceTimersByTimeAsync(10);
    expect(invokeSpy).toHaveBeenCalledTimes(2);
    {
      const calls = invokeSpy.mock.calls as unknown as any[][];
      expect(calls[1][0]).toBe('t-2');
      expect(calls[1][1][0].text).toBe('You asked me to remind you: two');
    }
  });

  it('returns scheduled ack even when thread_id missing (no invoke)', async () => {
    const tool = getToolInstance();
    const caller_agent: CallerAgentStub = { invoke: vi.fn(async (_t: string, _m: HumanMessage[]) => undefined) };
    const res = await tool.execute({ delayMs: 1, note: 'x' } as any, { callerAgent: caller_agent as any, finishSignal: { activate() {}, deactivate() {}, isActive: false } } as any);
    const parsed = typeof res === 'string' ? JSON.parse(res) : res;
    expect(parsed.status).toBe('scheduled');
  });

  it('returns scheduled ack even when caller_agent missing', async () => {
    const tool = getToolInstance();
    const res = await tool.execute({ delayMs: 1, note: 'x' } as any, { threadId: 't', finishSignal: { activate() {}, deactivate() {}, isActive: false } } as any);
    const parsed = typeof res === 'string' ? JSON.parse(res) : res;
    expect(parsed.status).toBe('scheduled');
  });

  it('emits reminder_count payloads with thread id on schedule and completion', async () => {
    const prismaStub = { getClient() { return { reminder: { create: vi.fn(async (args) => ({ ...args.data, createdAt: new Date() })), update: vi.fn(async () => ({})) } } as any; } };
    const emitted: Array<{ nodeId: string; count: number; threadId?: string }> = [];
    const eventsBusStub: any = {
      emitReminderCount: vi.fn((payload: { nodeId: string; count: number; threadId?: string }) => {
        emitted.push(payload);
      }),
    };
    // Use node to wire tool registry events to gateway
    const { RemindMeNode } = await import('../src/nodes/tools/remind_me/remind_me.node');
    const node = new RemindMeNode(eventsBusStub, prismaStub as any);
    node.init({ nodeId: 'node-m' });
    await node.provision();
    const tool = node.getTool();

    const caller_agent: CallerAgentStub = { invoke: vi.fn(async (_t: string, _m: HumanMessage[]) => undefined) };
    const threadId = 't-metrics';
    await tool.execute({ delayMs: 10, note: 'm' } as any, { threadId, callerAgent: caller_agent as any, finishSignal: { activate() {}, deactivate() {}, isActive: false } } as any);
    // Should emit reminder_count with thread id on schedule
    expect(eventsBusStub.emitReminderCount).toHaveBeenCalled();
    const scheduleCall = emitted.find((p) => p.count === 1);
    expect(scheduleCall?.threadId).toBe(threadId);
    // And again on completion (count returns to 0 but still includes thread id)
    await vi.advanceTimersByTimeAsync(10);
    const completionCall = emitted.find((p) => p.count === 0);
    expect(completionCall?.threadId).toBe(threadId);
  });
});
