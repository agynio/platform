import { describe, expect, it, vi } from 'vitest';
import { RunEventStatus, RunEventType } from '@prisma/client';
import { RunEventsService } from '../src/events/run-events.service';

describe('RunEventsService getRunEventTotals', () => {
  it('aggregates event counts and token usage with filters applied', async () => {
    const count = vi.fn().mockResolvedValue(12);
    const aggregate = vi.fn().mockResolvedValue({
      _sum: {
        inputTokens: 100,
        cachedInputTokens: 10,
        outputTokens: 80,
        reasoningTokens: 5,
        totalTokens: 195,
      },
    });

    const prismaStub = {
      getClient: () => ({
        runEvent: { count },
        lLMCall: { aggregate },
      }),
    } as unknown as Parameters<typeof RunEventsService>[0];

    const service = new RunEventsService(prismaStub);

    const totals = await service.getRunEventTotals({
      runId: 'run-1',
      types: [RunEventType.llm_call],
      statuses: [RunEventStatus.success],
    });

    expect(count).toHaveBeenCalledWith({
      where: {
        runId: 'run-1',
        type: { in: [RunEventType.llm_call] },
        status: { in: [RunEventStatus.success] },
      },
    });
    expect(aggregate).toHaveBeenCalledWith({
      where: {
        event: {
          runId: 'run-1',
          type: { in: [RunEventType.llm_call] },
          status: { in: [RunEventStatus.success] },
        },
      },
      _sum: {
        inputTokens: true,
        cachedInputTokens: true,
        outputTokens: true,
        reasoningTokens: true,
        totalTokens: true,
      },
    });
    expect(totals).toEqual({
      eventCount: 12,
      tokenUsage: {
        input: 100,
        cached: 10,
        output: 80,
        reasoning: 5,
        total: 195,
      },
    });
  });

  it('falls back to zeroed totals when aggregates are null', async () => {
    const count = vi.fn().mockResolvedValue(0);
    const aggregate = vi.fn().mockResolvedValue({ _sum: {} });

    const prismaStub = {
      getClient: () => ({
        runEvent: { count },
        lLMCall: { aggregate },
      }),
    } as unknown as Parameters<typeof RunEventsService>[0];

    const service = new RunEventsService(prismaStub);

    const totals = await service.getRunEventTotals({ runId: 'run-2' });

    expect(count).toHaveBeenCalledWith({ where: { runId: 'run-2' } });
    expect(aggregate).toHaveBeenCalledWith({
      where: {
        event: {
          runId: 'run-2',
        },
      },
      _sum: {
        inputTokens: true,
        cachedInputTokens: true,
        outputTokens: true,
        reasoningTokens: true,
        totalTokens: true,
      },
    });
    expect(totals).toEqual({
      eventCount: 0,
      tokenUsage: {
        input: 0,
        cached: 0,
        output: 0,
        reasoning: 0,
        total: 0,
      },
    });
  });
});
