import { describe, expect, it } from 'vitest';
import { EventSourceKind, RunEventStatus, RunEventType } from '@prisma/client';
import { RunEventsService } from '../src/events/run-events.service';

const loggerStub = {
  info: () => undefined,
  debug: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

const prismaStub = {
  getClient: () => ({}),
} as unknown as Parameters<typeof RunEventsService>[0];

describe('RunEventsService serializeEvent usage metrics', () => {
  it('includes usage metrics when present', () => {
    const service = new RunEventsService(prismaStub, loggerStub as any);
    const baseDate = new Date('2024-01-01T00:00:00.000Z');

    const event = {
      id: 'evt-usage-1',
      runId: 'run-1',
      threadId: 'thread-1',
      type: RunEventType.llm_call,
      status: RunEventStatus.success,
      ts: baseDate,
      startedAt: baseDate,
      endedAt: baseDate,
      durationMs: 123,
      nodeId: null,
      sourceKind: EventSourceKind.internal,
      sourceSpanId: null,
      metadata: null,
      errorCode: null,
      errorMessage: null,
      attachments: [],
      llmCall: {
        provider: 'openai',
        model: 'gpt-test',
        temperature: null,
        topP: null,
        stopReason: 'stop',
        contextItemIds: ['ctx-1'],
        responseText: 'hello',
        rawResponse: null,
        toolCalls: [],
        inputTokens: 100,
        cachedInputTokens: 25,
        outputTokens: 80,
        reasoningTokens: 5,
        totalTokens: 180,
      },
      toolExecution: null,
      summarization: null,
      injection: null,
      eventMessage: null,
    } as any;

    const result = (service as any).serializeEvent(event);
    expect(result.llmCall?.usage).toEqual({
      inputTokens: 100,
      cachedInputTokens: 25,
      outputTokens: 80,
      reasoningTokens: 5,
      totalTokens: 180,
    });
  });

  it('omits usage metrics when not available', () => {
    const service = new RunEventsService(prismaStub, loggerStub as any);
    const baseDate = new Date('2024-01-01T00:00:00.000Z');

    const event = {
      id: 'evt-usage-2',
      runId: 'run-2',
      threadId: 'thread-2',
      type: RunEventType.llm_call,
      status: RunEventStatus.success,
      ts: baseDate,
      startedAt: baseDate,
      endedAt: baseDate,
      durationMs: 456,
      nodeId: null,
      sourceKind: EventSourceKind.internal,
      sourceSpanId: null,
      metadata: null,
      errorCode: null,
      errorMessage: null,
      attachments: [],
      llmCall: {
        provider: 'openai',
        model: 'gpt-test',
        temperature: null,
        topP: null,
        stopReason: null,
        contextItemIds: [],
        responseText: 'world',
        rawResponse: null,
        toolCalls: [],
        inputTokens: null,
        cachedInputTokens: null,
        outputTokens: null,
        reasoningTokens: null,
        totalTokens: null,
      },
      toolExecution: null,
      summarization: null,
      injection: null,
      eventMessage: null,
    } as any;

    const result = (service as any).serializeEvent(event);
    expect(result.llmCall?.usage).toBeUndefined();
  });
});
