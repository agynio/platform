import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AgentsRunScreen } from '../AgentsRunScreen';
import type { ContextItem, RunTimelineEvent, RunTimelineSummary, RunEventType, RunEventStatus } from '@/api/types/agents';

const runScreenMocks = vi.hoisted(() => ({
  props: vi.fn(),
}));

vi.mock('@/components/screens/RunScreen', () => ({
  __esModule: true,
  default: (props: unknown) => {
    runScreenMocks.props(props);
    return <div data-testid="run-screen" />;
  },
}));

const runsHookMocks = vi.hoisted(() => ({
  summary: vi.fn<RunTimelineSummary, [string | undefined]>(),
  events: vi.fn<{ items: RunTimelineEvent[]; nextCursor: null }, [string | undefined]>(),
}));

vi.mock('@/api/hooks/runs', () => ({
  useRunTimelineSummary: (runId: string | undefined) => ({
    data: runsHookMocks.summary(runId),
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  }),
  useRunTimelineEvents: (runId: string | undefined) => ({
    data: runsHookMocks.events(runId),
    isLoading: false,
    isFetching: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

const runsModuleMocks = vi.hoisted(() => ({
  terminate: vi.fn(),
  timelineEvents: vi.fn(),
}));

vi.mock('@/api/modules/runs', () => ({
  runs: runsModuleMocks,
}));

const contextItemsMocks = vi.hoisted(() => ({
  getMany: vi.fn(async () => [] as never[]),
}));

vi.mock('@/api/modules/contextItems', () => ({
  contextItems: contextItemsMocks,
}));

const notifyMocks = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock('@/lib/notify', () => ({
  notifySuccess: (...args: unknown[]) => notifyMocks.success(...args),
  notifyError: (...args: unknown[]) => notifyMocks.error(...args),
}));

const graphSocketMocks = vi.hoisted(() => ({
  subscribe: vi.fn(),
  unsubscribe: vi.fn(),
  onRunEvent: vi.fn((cb: (payload: { runId: string; event: RunTimelineEvent }) => void) => {
    void cb;
    return vi.fn();
  }),
  onRunStatusChanged: vi.fn((cb: (payload: { run: { id: string } }) => void) => {
    void cb;
    return vi.fn();
  }),
  onReconnected: vi.fn((cb: () => void) => {
    void cb;
    return vi.fn();
  }),
  setRunCursor: vi.fn(),
  getRunCursor: vi.fn(() => null),
}));

vi.mock('@/lib/graph/socket', () => ({
  graphSocket: graphSocketMocks,
}));

beforeAll(() => {
  if (typeof window.matchMedia !== 'function') {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query) => ({
        matches: false,
        media: query,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  }
});

beforeEach(() => {
  runScreenMocks.props.mockClear();
  runsHookMocks.summary.mockReset();
  runsHookMocks.events.mockReset();
  contextItemsMocks.getMany.mockReset();
  contextItemsMocks.getMany.mockResolvedValue([]);
});

afterEach(() => {
  vi.clearAllMocks();
});

function buildEvent(overrides: Partial<RunTimelineEvent> = {}): RunTimelineEvent {
  return {
    id: 'event-1',
    runId: 'run-1',
    threadId: 'thread-1',
    type: 'tool_execution',
    status: 'success',
    ts: '2024-01-01T00:00:00.000Z',
    startedAt: '2024-01-01T00:00:00.000Z',
    endedAt: '2024-01-01T00:00:01.000Z',
    durationMs: 1000,
    nodeId: 'node-1',
    sourceKind: 'internal',
    sourceSpanId: 'span-1',
    metadata: {},
    errorCode: null,
    errorMessage: null,
    toolExecution: {
      toolName: 'manage_agent',
      toolCallId: 'call-1',
      execStatus: 'success',
      input: '{}',
      output: '{}',
      errorMessage: null,
      raw: null,
    },
    summarization: undefined,
    injection: undefined,
    message: undefined,
    attachments: [],
    llmCall: undefined,
    ...overrides,
  } satisfies RunTimelineEvent;
}

function buildSummary(): RunTimelineSummary {
  const countsByType: Record<RunEventType, number> = {
    invocation_message: 0,
    injection: 0,
    llm_call: 0,
    tool_execution: 1,
    summarization: 0,
  };
  const countsByStatus: Record<RunEventStatus, number> = {
    pending: 0,
    running: 0,
    success: 1,
    error: 0,
    cancelled: 0,
  };
  return {
    runId: 'run-1',
    threadId: 'thread-1',
    status: 'running',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:01.000Z',
    firstEventAt: '2024-01-01T00:00:00.000Z',
    lastEventAt: '2024-01-01T00:00:00.000Z',
    countsByType,
    countsByStatus,
    totalEvents: 1,
  };
}

type AgentsRunScreenWithTesting = typeof AgentsRunScreen & {
  __testing__?: {
    extractLlmResponse: (event: RunTimelineEvent) => string;
  };
};

describe('AgentsRunScreen', () => {
  it('normalizes stringified tool payloads to expose link targets', async () => {
    const toolInput = JSON.stringify({
      thread: { id: 'child-thread' },
      run: { id: 'child-run' },
      command: 'delegate_task',
    });
    const toolOutput = JSON.stringify({
      subthread_id: 'child-subthread',
      run_id: 'child-run',
      result: 'ok',
    });

    const event = buildEvent({
      toolExecution: {
        toolName: 'manage_agent',
        toolCallId: 'call-1',
        execStatus: 'success',
        input: toolInput,
        output: toolOutput,
        errorMessage: null,
        raw: null,
      },
    });

    runsHookMocks.summary.mockReturnValue(buildSummary());
    runsHookMocks.events.mockReturnValue({ items: [event], nextCursor: null });

    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[`/threads/thread-1/runs/${event.runId}`]}>
          <Routes>
            <Route path="/threads/:threadId/runs/:runId" element={<AgentsRunScreen />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    let capturedProps: { events: Array<{ data: Record<string, unknown> }> } | undefined;
    await waitFor(() => {
      const call = [...runScreenMocks.props.mock.calls]
        .reverse()
        .find(([callProps]) => Array.isArray((callProps as { events?: unknown[] }).events) && ((callProps as { events: unknown[] }).events.length > 0));
      expect(call).toBeDefined();
      capturedProps = call?.[0] as { events: Array<{ data: Record<string, unknown> }> };
    });

    if (!capturedProps) {
      throw new Error('RunScreen props were not captured.');
    }

    const [capturedEvent] = capturedProps.events;
    const data = capturedEvent.data as Record<string, unknown>;

    expect(data.runId).toBe('child-run');
    expect(data.threadId).toBe('child-thread');
    expect(data.subthreadId).toBe('child-subthread');
    expect(typeof data.input).toBe('object');
    expect(typeof data.output).toBe('object');
    expect((data.output as Record<string, unknown>).runId).toBe('child-run');
    expect((data.output as Record<string, unknown>).subthreadId).toBe('child-subthread');
  });

  it('hydrates assistant context from stringified content text including tool calls and reasoning', async () => {
    const assistantContext: ContextItem = {
      id: 'ctx-1',
      role: 'assistant',
      contentText: JSON.stringify({
        content: 'Final response',
        tool_calls: [{ name: 'write_file', arguments: { path: '/tmp/file.ts' } }],
        reasoning: { tokens: 88 },
      }),
      contentJson: null,
      metadata: null,
      sizeBytes: 256,
      createdAt: '2024-01-01T00:00:02.000Z',
    };

    const event = buildEvent({
      type: 'llm_call',
      toolExecution: undefined,
      llmCall: {
        provider: 'openai',
        model: 'gpt-4.1',
        temperature: null,
        topP: null,
        stopReason: null,
        contextItemIds: [assistantContext.id],
        newContextItemCount: 1,
        responseText: 'Final response',
        rawResponse: null,
        toolCalls: [
          {
            callId: 'call-embedded',
            name: 'write_file',
            arguments: { path: '/tmp/file.ts' },
          },
        ],
        usage: undefined,
      },
      metadata: {},
    });

    runsHookMocks.summary.mockReturnValue({
      ...buildSummary(),
      countsByType: {
        invocation_message: 0,
        injection: 0,
        llm_call: 1,
        tool_execution: 0,
        summarization: 0,
      },
      countsByStatus: {
        pending: 0,
        running: 0,
        success: 1,
        error: 0,
        cancelled: 0,
      },
      totalEvents: 1,
    });
    runsHookMocks.events.mockReturnValue({ items: [event], nextCursor: null });
    contextItemsMocks.getMany.mockImplementation(async () => [assistantContext]);

    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[`/threads/${event.threadId}/runs/${event.runId}`]}>
          <Routes>
            <Route path="/threads/:threadId/runs/:runId" element={<AgentsRunScreen />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => expect(contextItemsMocks.getMany).toHaveBeenCalledWith([assistantContext.id]));

    let capturedProps: { events: Array<{ data: Record<string, unknown> }> } | undefined;
    await waitFor(() => {
      const call = [...runScreenMocks.props.mock.calls]
        .reverse()
        .find(([callProps]) => {
          const events = (callProps as { events?: unknown[] }).events;
          if (!Array.isArray(events) || events.length === 0) return false;
          const candidate = events[0] as { data?: { context?: unknown[] } };
          return Array.isArray(candidate.data?.context) && candidate.data.context.length > 0;
        });
      expect(call).toBeDefined();
      capturedProps = call?.[0] as { events: Array<{ data: Record<string, unknown> }> };
    });

    if (!capturedProps) {
      throw new Error('RunScreen props were not captured.');
    }

    const [capturedEvent] = capturedProps.events;
    const context = (capturedEvent.data.context as Record<string, unknown>[] | undefined) ?? [];
    expect(context).toHaveLength(1);
    const assistant = context[0];
    expect(assistant.role).toBe('assistant');
    expect(assistant.content).toBe('Final response');

    const toolCalls = assistant['tool_calls'] as Record<string, unknown>[] | undefined;
    expect(Array.isArray(toolCalls)).toBe(true);
    expect(toolCalls?.[0]?.name).toBe('write_file');
    expect(toolCalls?.[0]?.arguments).toEqual({ path: '/tmp/file.ts' });
    expect(assistant['toolCalls']).toEqual(toolCalls);
    expect(assistant['reasoning']).toEqual({ tokens: 88 });
  });

  it('falls back to llmCall tool calls and metadata reasoning when assistant context lacks tool_calls', async () => {
    const assistantContext: ContextItem = {
      id: 'ctx-2',
      role: 'assistant',
      contentText: JSON.stringify({ content: 'Working on it.' }),
      contentJson: null,
      metadata: JSON.stringify({
        additional_kwargs: {
          reasoning: { tokens: 55, score: 0.42 },
        },
      }),
      sizeBytes: 192,
      createdAt: '2024-01-01T00:00:03.000Z',
    };

    const fallbackToolCalls = [
      {
        callId: 'call-fallback',
        name: 'delegate_agent',
        arguments: { target: 'agent-security' },
      },
    ];

    const event = buildEvent({
      type: 'llm_call',
      toolExecution: undefined,
      llmCall: {
        provider: 'openai',
        model: 'gpt-4.1-mini',
        temperature: null,
        topP: null,
        stopReason: null,
        contextItemIds: [assistantContext.id],
        newContextItemCount: 1,
        responseText: 'Working on it.',
        rawResponse: null,
        toolCalls: fallbackToolCalls.map((call) => ({ ...call })),
        usage: undefined,
      },
      metadata: {},
    });

    runsHookMocks.summary.mockReturnValue({
      ...buildSummary(),
      countsByType: {
        invocation_message: 0,
        injection: 0,
        llm_call: 1,
        tool_execution: 0,
        summarization: 0,
      },
      countsByStatus: {
        pending: 0,
        running: 0,
        success: 1,
        error: 0,
        cancelled: 0,
      },
      totalEvents: 1,
    });
    runsHookMocks.events.mockReturnValue({ items: [event], nextCursor: null });
    contextItemsMocks.getMany.mockImplementation(async () => [assistantContext]);

    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[`/threads/${event.threadId}/runs/${event.runId}`]}>
          <Routes>
            <Route path="/threads/:threadId/runs/:runId" element={<AgentsRunScreen />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => expect(contextItemsMocks.getMany).toHaveBeenCalledWith([assistantContext.id]));

    let capturedProps: { events: Array<{ data: Record<string, unknown> }> } | undefined;
    await waitFor(() => {
      const call = [...runScreenMocks.props.mock.calls]
        .reverse()
        .find(([callProps]) => {
          const events = (callProps as { events?: unknown[] }).events;
          if (!Array.isArray(events) || events.length === 0) return false;
          const candidate = events[0] as { data?: { context?: unknown[] } };
          return Array.isArray(candidate.data?.context) && candidate.data.context.length > 0;
        });
      expect(call).toBeDefined();
      capturedProps = call?.[0] as { events: Array<{ data: Record<string, unknown> }> };
    });

    if (!capturedProps) {
      throw new Error('RunScreen props were not captured.');
    }

    const [capturedEvent] = capturedProps.events;
    const context = (capturedEvent.data.context as Record<string, unknown>[] | undefined) ?? [];
    expect(context).toHaveLength(1);
    const assistant = context[0];
    const toolCalls = assistant['tool_calls'] as Record<string, unknown>[] | undefined;
    expect(Array.isArray(toolCalls)).toBe(true);
    expect(toolCalls?.[0]?.name).toBe('delegate_agent');
    expect(toolCalls?.[0]?.arguments).toEqual({ target: 'agent-security' });
    expect(assistant['reasoning']).toEqual({ tokens: 55, score: 0.42 });
  });

  it('omits assistant content when context lacks textual fields but exposes tool calls and reasoning', async () => {
    const assistantContext: ContextItem = {
      id: 'ctx-structured',
      role: 'assistant',
      contentText: null,
      contentJson: {
        tool_calls: [
          {
            name: 'lookup_status',
            arguments: { ticket: 'INC-42' },
          },
        ],
        metadata: { extra: true },
      },
      metadata: {
        reasoning: { tokens: 12 },
      },
      sizeBytes: 128,
      createdAt: '2024-01-01T00:00:04.000Z',
    };

    const event = buildEvent({
      type: 'llm_call',
      toolExecution: undefined,
      llmCall: {
        provider: 'openai',
        model: 'gpt-4-mini',
        temperature: null,
        topP: null,
        stopReason: null,
        contextItemIds: [assistantContext.id],
        newContextItemCount: 1,
        responseText: null,
        rawResponse: null,
        toolCalls: [],
        usage: undefined,
      },
      metadata: {},
      attachments: [],
    });

    runsHookMocks.summary.mockReturnValue({
      ...buildSummary(),
      countsByType: {
        invocation_message: 0,
        injection: 0,
        llm_call: 1,
        tool_execution: 0,
        summarization: 0,
      },
      countsByStatus: {
        pending: 0,
        running: 0,
        success: 1,
        error: 0,
        cancelled: 0,
      },
      totalEvents: 1,
    });
    runsHookMocks.events.mockReturnValue({ items: [event], nextCursor: null });
    contextItemsMocks.getMany.mockImplementation(async () => [assistantContext]);

    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[`/threads/${event.threadId}/runs/${event.runId}`]}>
          <Routes>
            <Route path="/threads/:threadId/runs/:runId" element={<AgentsRunScreen />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => expect(contextItemsMocks.getMany).toHaveBeenCalledWith([assistantContext.id]));

    let capturedProps: { events: Array<{ data: Record<string, unknown> }> } | undefined;
    await waitFor(() => {
      const call = [...runScreenMocks.props.mock.calls]
        .reverse()
        .find(([callProps]) => {
          const events = (callProps as { events?: unknown[] }).events;
          if (!Array.isArray(events) || events.length === 0) return false;
          const candidate = events[0] as { data?: { context?: unknown[] } };
          return Array.isArray(candidate.data?.context) && candidate.data.context.length > 0;
        });
      expect(call).toBeDefined();
      capturedProps = call?.[0] as { events: Array<{ data: Record<string, unknown> }> };
    });

    if (!capturedProps) {
      throw new Error('RunScreen props were not captured.');
    }

    const [capturedEvent] = capturedProps.events;
    const context = (capturedEvent.data.context as Record<string, unknown>[] | undefined) ?? [];
    expect(context).toHaveLength(1);
    const assistant = context[0];

    expect(assistant.role).toBe('assistant');
    expect(assistant['content']).toBeUndefined();
    expect(assistant['response']).toBeUndefined();
    expect(assistant['tool_calls']).toEqual([
      expect.objectContaining({ name: 'lookup_status', arguments: { ticket: 'INC-42' } }),
    ]);
    expect(assistant['reasoning']).toEqual({ tokens: 12 });
  });
});

describe('extractLlmResponse', () => {
  const getExtract = () => {
    const helper = (AgentsRunScreen as AgentsRunScreenWithTesting).__testing__?.extractLlmResponse;
    if (!helper) {
      throw new Error('extractLlmResponse helper not available');
    }
    return helper;
  };

  const baseEvent = (overrides: Partial<RunTimelineEvent>): RunTimelineEvent =>
    ({
      id: 'event-resp',
      runId: 'run-1',
      threadId: 'thread-1',
      type: 'llm_call',
      status: 'success',
      ts: '2024-01-01T00:00:00.000Z',
      startedAt: null,
      endedAt: null,
      durationMs: null,
      nodeId: null,
      sourceKind: 'internal',
      sourceSpanId: null,
      metadata: {},
      errorCode: null,
      errorMessage: null,
      toolExecution: undefined,
      summarization: undefined,
      injection: undefined,
      message: undefined,
      attachments: [],
      llmCall: {
        provider: 'openai',
        model: 'gpt-test',
        temperature: null,
        topP: null,
        stopReason: null,
        contextItemIds: [],
        newContextItemCount: 0,
        responseText: null,
        rawResponse: null,
        toolCalls: [],
        usage: undefined,
      },
      ...overrides,
    } satisfies RunTimelineEvent);

  it('prefers responseText when present', () => {
    const event = baseEvent({});
    if (!event.llmCall) throw new Error('llmCall missing');
    event.llmCall.responseText = 'Direct response';
    const extract = getExtract();
    expect(extract(event)).toBe('Direct response');
  });

  it('extracts text from rawResponse choices payloads', () => {
    const event = baseEvent({});
    if (!event.llmCall) throw new Error('llmCall missing');
    event.llmCall.rawResponse = {
      choices: [
        {
          message: {
            content: 'From choices',
          },
        },
      ],
    };

    const extract = getExtract();
    expect(extract(event)).toBe('From choices');
  });

  it('falls back to response attachments when other sources are empty', () => {
    const event = baseEvent({});
    event.attachments = [
      {
        id: 'att-1',
        kind: 'response',
        isGzip: false,
        sizeBytes: 10,
        contentJson: { content: 'Attachment response' },
        contentText: null,
      },
    ];
    const extract = getExtract();
    expect(extract(event)).toBe('Attachment response');
  });
});
