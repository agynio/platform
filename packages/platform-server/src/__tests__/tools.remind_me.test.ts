import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RemindMeTool } from '../nodes/tools/remind_me.tool';
import { LoggerService } from '../core/services/logger.service';

// Minimal typed stub for the caller agent used by the tool
interface CallerAgentStub {
  invoke(thread: string, messages: Array<{ kind: 'system' | 'human'; content: string; info: Record<string, unknown> }>): Promise<unknown>;
}

// Helper to extract callable tool
function getToolInstance() {
  const logger = new LoggerService();
  const tool = new RemindMeTool(logger).init();
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

    const invokeSpy = vi.fn(async (_t: string, _m: Array<{ kind: 'system' | 'human'; content: string; info: Record<string, unknown> }>) => undefined);
    const caller_agent: CallerAgentStub = { invoke: invokeSpy };
    const thread_id = 't-123';

    const res = await tool.invoke(
      { delayMs: 1000, note: 'Ping' },
      { configurable: { thread_id, caller_agent } },
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
    expect(calls0[0][1]).toEqual([
      { kind: 'system', content: 'Ping', info: { reason: 'reminded' } },
    ]);
  });

  it('registry tracks active reminders until fired', async () => {
    const logger = new LoggerService();
    const tool = new RemindMeTool(logger);
    const dyn = tool.init();
    const invokeSpy = vi.fn(async (_t: string, _m: Array<{ kind: 'system' | 'human'; content: string; info: Record<string, unknown> }>) => undefined);
    const caller_agent: CallerAgentStub = { invoke: invokeSpy };
    const cfg = { configurable: { thread_id: 't-reg', caller_agent } };

    // schedule two timers
    await dyn.invoke({ delayMs: 1000, note: 'A' }, cfg);
    await dyn.invoke({ delayMs: 2000, note: 'B' }, cfg);

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
    const logger = new LoggerService();
    const tool = new RemindMeTool(logger);
    const dyn = tool.init();
    const caller_agent: CallerAgentStub = { invoke: vi.fn(async () => undefined) };
    await dyn.invoke({ delayMs: 10_000, note: 'X' }, { configurable: { thread_id: 't', caller_agent } });
    expect((tool as any).getActiveReminders().length).toBe(1);
    await (tool as any).destroy();
    expect((tool as any).getActiveReminders().length).toBe(0);
    // advancing timers should not call invoke
    await vi.advanceTimersByTimeAsync(10_000);
    expect(caller_agent.invoke).not.toHaveBeenCalled();
  });

  it('enforces cap on active reminders', async () => {
    const logger = new LoggerService();
    const tool = new RemindMeTool(logger);
    const dyn = tool.init();
    const caller_agent: CallerAgentStub = { invoke: vi.fn(async () => undefined) };

    // monkey-patch maxActive for test visibility
    (tool as any).maxActive = 1;
    await dyn.invoke({ delayMs: 10_000, note: 'ok' }, { configurable: { thread_id: 't', caller_agent } });
    await expect(
      dyn.invoke({ delayMs: 10_000, note: 'nope' }, { configurable: { thread_id: 't', caller_agent } })
    ).rejects.toThrow();
  });

  it('schedules immediate reminder when delayMs=0', async () => {
    const tool = getToolInstance();
    const invokeSpy = vi.fn(async () => undefined);
    const caller_agent: CallerAgentStub = { invoke: invokeSpy };
    const config = { configurable: { thread_id: 't-0', caller_agent } };

    const res = await tool.invoke({ delayMs: 0, note: 'Now' }, config);
    const parsed = typeof res === 'string' ? JSON.parse(res) : res;
    expect(parsed.status).toBe('scheduled');
    expect(parsed.etaMs).toBe(0);

    // Run pending timers immediately
    await vi.runOnlyPendingTimersAsync();
    expect(invokeSpy).toHaveBeenCalledTimes(1);
    {
      const calls = invokeSpy.mock.calls as unknown as any[][];
      expect(calls[0][1]).toEqual([
      { kind: 'system', content: 'Now', info: { reason: 'reminded' } },
      ]);
    }
  });

  it('supports multiple concurrent reminders for the same thread (delayMs=0)', async () => {
    const tool = getToolInstance();
    const invokeSpy = vi.fn(async (_t: string, _m: Array<{ kind: 'system' | 'human'; content: string; info: Record<string, unknown> }>) => undefined);
    const caller_agent: CallerAgentStub = { invoke: invokeSpy };
    const cfg = { configurable: { thread_id: 't-x', caller_agent } };

    // Schedule two reminders immediately
    await tool.invoke({ delayMs: 0, note: 'A' }, cfg);
    await tool.invoke({ delayMs: 0, note: 'B' }, cfg);

    await vi.runOnlyPendingTimersAsync();

    expect(invokeSpy).toHaveBeenCalledTimes(2);
    const calls = invokeSpy.mock.calls as unknown as any[][];
    const payloads = calls.map((c) => c[1][0].content).sort();
    expect(payloads).toEqual(['A', 'B']);
    expect(calls[0][0]).toBe('t-x');
    expect(calls[1][0]).toBe('t-x');
  });

  it('handles overlapping delays for the same thread', async () => {
    const tool = getToolInstance();
    const invokeSpy = vi.fn(async (_t: string, _m: Array<{ kind: 'system' | 'human'; content: string; info: Record<string, unknown> }>) => undefined);
    const caller_agent: CallerAgentStub = { invoke: invokeSpy };
    const cfg = { configurable: { thread_id: 't-ovl', caller_agent } };

    await tool.invoke({ delayMs: 500, note: 'half' }, cfg); // A at 500ms
    await tool.invoke({ delayMs: 1000, note: 'full' }, cfg); // B at 1000ms

    await vi.advanceTimersByTimeAsync(500);
    expect(invokeSpy).toHaveBeenCalledTimes(1);
    {
      const calls = invokeSpy.mock.calls as unknown as any[][];
      expect(calls[0][1][0]).toMatchObject({ content: 'half' });
    }

    await vi.advanceTimersByTimeAsync(500);
    expect(invokeSpy).toHaveBeenCalledTimes(2);
    {
      const calls = invokeSpy.mock.calls as unknown as any[][];
      expect(calls[1][1][0]).toMatchObject({ content: 'full' });
    }
  });

  it('routes reminders to mixed threads correctly', async () => {
    const tool = getToolInstance();
    const invokeSpy = vi.fn(async () => undefined);
    const caller_agent: CallerAgentStub = { invoke: invokeSpy };

    await tool.invoke({ delayMs: 10, note: 'one' }, { configurable: { thread_id: 't-1', caller_agent } });
    await tool.invoke({ delayMs: 20, note: 'two' }, { configurable: { thread_id: 't-2', caller_agent } });

    await vi.advanceTimersByTimeAsync(10);
    expect(invokeSpy).toHaveBeenCalledTimes(1);
    {
      const calls = invokeSpy.mock.calls as unknown as any[][];
      expect(calls[0][0]).toBe('t-1');
      expect(calls[0][1][0]).toMatchObject({ content: 'one' });
    }

    await vi.advanceTimersByTimeAsync(10);
    expect(invokeSpy).toHaveBeenCalledTimes(2);
    {
      const calls = invokeSpy.mock.calls as unknown as any[][];
      expect(calls[1][0]).toBe('t-2');
      expect(calls[1][1][0]).toMatchObject({ content: 'two' });
    }
  });

  it('returns error when thread_id missing', async () => {
    const tool = getToolInstance();
    const caller_agent: CallerAgentStub = { invoke: vi.fn(async () => undefined) };
    const res = await tool.invoke({ delayMs: 1, note: 'x' }, { configurable: { caller_agent } });
    expect(typeof res).toBe('string');
    expect(String(res)).toContain('missing thread_id');
  });

  it('returns error when caller_agent missing', async () => {
    const tool = getToolInstance();
    const res = await tool.invoke({ delayMs: 1, note: 'x' }, { configurable: { thread_id: 't' } });
    expect(typeof res).toBe('string');
    expect(String(res)).toContain('missing caller_agent');
  });
});
