import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import { render, waitFor, fireEvent } from '@testing-library/react';
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

const contextItemsModuleMocks = vi.hoisted(() => ({
  getMany: vi.fn<Promise<ContextItem[]>, [string[]]>(),
}));

vi.mock('@/api/modules/contextItems', () => ({
  contextItems: {
    getMany: (ids: string[]) => contextItemsModuleMocks.getMany(ids),
  },
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
  contextItemsModuleMocks.getMany.mockReset();
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

function latestRunScreenProps<T = Record<string, unknown>>(): T | undefined {
  const calls = runScreenMocks.props.mock.calls;
  if (calls.length === 0) return undefined;
  const last = calls[calls.length - 1];
  return (last?.[0] as T) ?? undefined;
}

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
      metadata: {
        childThreadId: 'child-thread-meta',
        childRunId: 'child-run-meta',
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

    expect(data.runId).toBe('child-run-meta');
    expect(data.threadId).toBe('child-thread-meta');
    expect(data.subthreadId).toBe('child-subthread');
    expect(data.childRunId).toBe('child-run-meta');
    expect(data.childThreadId).toBe('child-thread-meta');
    expect(typeof data.input).toBe('object');
    expect(typeof data.output).toBe('object');
    const normalizedOutput = data.output as Record<string, unknown>;
    expect(normalizedOutput.runId).toBe('child-run-meta');
    expect(normalizedOutput.childRunId).toBe('child-run-meta');
    expect(normalizedOutput.childThreadId).toBe('child-thread-meta');
    expect(normalizedOutput.subthreadId).toBe('child-subthread');
  });

  it('prioritizes metadata link targets over payload data', async () => {
    const toolInput = JSON.stringify({
      threadId: 'input-thread',
      subthreadId: 'input-subthread',
      runId: 'input-run',
    });
    const toolOutput = JSON.stringify({
      threadId: 'output-thread',
      subthreadId: 'output-subthread',
      runId: 'output-run',
    });

    const event = buildEvent({
      toolExecution: {
        toolName: 'manage_agent',
        toolCallId: 'call-2',
        execStatus: 'success',
        input: toolInput,
        output: toolOutput,
        errorMessage: null,
        raw: null,
      },
      metadata: {
        childThreadId: 'metadata-thread',
        childRunId: 'metadata-run',
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

    expect(data.threadId).toBe('metadata-thread');
    expect(data.subthreadId).toBe('output-subthread');
    expect(data.runId).toBe('metadata-run');
    expect(data.childThreadId).toBe('metadata-thread');
    expect(data.childRunId).toBe('metadata-run');
  });

  it('provides assistant response and tool calls from tail context items', async () => {
    const contextStore = new Map<string, ContextItem>([
      [
        'ctx-user',
        {
          id: 'ctx-user',
          role: 'user',
          contentText: 'Hello there',
          contentJson: null,
          metadata: null,
          sizeBytes: 64,
          createdAt: '2024-01-01T00:00:00.000Z',
        },
      ],
      [
        'ctx-assistant',
        {
          id: 'ctx-assistant',
          role: 'assistant',
          contentText: 'Completed request successfully.',
          contentJson: {
            content: [
              {
                type: 'text',
                text: 'Completed request successfully.',
              },
            ],
          },
          metadata: {
            additional_kwargs: {
              tool_calls: [
                {
                  id: 'call-1',
                  type: 'function',
                  name: 'lookup_weather',
                  function: {
                    name: 'lookup_weather',
                    arguments: '{"city":"Paris"}',
                  },
                },
              ],
            },
          },
          sizeBytes: 96,
          createdAt: '2024-01-01T00:00:05.000Z',
        },
      ],
    ]);

    contextItemsModuleMocks.getMany.mockImplementation(async (ids: string[]) =>
      ids
        .map((id) => contextStore.get(id))
        .filter((item): item is ContextItem => Boolean(item)),
    );

    const event = buildEvent({
      id: 'event-llm-1',
      type: 'llm_call',
      toolExecution: undefined,
      attachments: [],
      metadata: {},
      llmCall: {
        provider: 'openai',
        model: 'test-model',
        temperature: null,
        topP: null,
        stopReason: null,
        contextItemIds: ['ctx-user', 'ctx-assistant'],
        newContextItemCount: 1,
        responseText: null,
        rawResponse: null,
        toolCalls: [],
        usage: {
          inputTokens: 10,
          cachedInputTokens: 2,
          outputTokens: 5,
          reasoningTokens: 1,
          totalTokens: 18,
        },
      },
    });

    const summary = buildSummary();
    runsHookMocks.summary.mockReturnValue({
      ...summary,
      countsByType: { ...summary.countsByType, llm_call: 1, tool_execution: 0 },
    });
    runsHookMocks.events.mockReturnValue({ items: [event], nextCursor: null });

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

    let latestData: Record<string, unknown> | undefined;
    await waitFor(() => {
      const props = latestRunScreenProps<{ events: Array<{ id: string; data: Record<string, unknown> }> }>();
      expect(props).toBeDefined();
      const llmEvent = props?.events.find((evt) => evt.id === 'event-llm-1');
      expect(llmEvent).toBeDefined();
      const data = llmEvent?.data as Record<string, unknown> | undefined;
      expect(data).toBeDefined();
      expect(Array.isArray(data?.context)).toBe(true);
      expect(data?.response).toBe('Completed request successfully.');
      expect(data?.toolCalls).toEqual([
        expect.objectContaining({
          id: 'call-1',
          name: 'lookup_weather',
          arguments: { city: 'Paris' },
          type: 'function_call',
        }),
      ]);
      latestData = data;
    });

    const contextRecords = (latestData?.context ?? []) as unknown[];
    expect(contextRecords).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'ctx-user', role: 'user' }),
        expect.objectContaining({ id: 'ctx-assistant', role: 'assistant', contentText: 'Completed request successfully.' }),
      ]),
    );
    expect(latestData?.tokens).toEqual({ input: 10, cached: 2, output: 5, reasoning: 1, total: 18 });
  });

  it('isolates llm responses and tool calls per event', async () => {
    const contextStore = new Map<string, ContextItem>([
      [
        'ctx-a-user',
        {
          id: 'ctx-a-user',
          role: 'user',
          contentText: 'Input A',
          contentJson: null,
          metadata: null,
          sizeBytes: 32,
          createdAt: '2024-01-01T00:00:00.000Z',
        },
      ],
      [
        'ctx-a-assistant',
        {
          id: 'ctx-a-assistant',
          role: 'assistant',
          contentText: 'Response A',
          contentJson: null,
          metadata: {
            additional_kwargs: {
              tool_calls: [
                {
                  id: 'call-a',
                  type: 'function',
                  name: 'lookup_alpha',
                  function: {
                    name: 'lookup_alpha',
                    arguments: '{"topic":"alpha"}',
                  },
                },
              ],
            },
          },
          sizeBytes: 64,
          createdAt: '2024-01-01T00:00:05.000Z',
        },
      ],
      [
        'ctx-b-user',
        {
          id: 'ctx-b-user',
          role: 'user',
          contentText: 'Input B',
          contentJson: null,
          metadata: null,
          sizeBytes: 34,
          createdAt: '2024-01-01T00:01:00.000Z',
        },
      ],
      [
        'ctx-b-assistant',
        {
          id: 'ctx-b-assistant',
          role: 'assistant',
          contentText: 'Response B',
          contentJson: null,
          metadata: {
            additional_kwargs: {
              tool_calls: [
                {
                  id: 'call-b',
                  type: 'function',
                  name: 'search_beta',
                  function: {
                    name: 'search_beta',
                    arguments: '{"topic":"beta"}',
                  },
                },
              ],
            },
          },
          sizeBytes: 70,
          createdAt: '2024-01-01T00:01:05.000Z',
        },
      ],
    ]);

    contextItemsModuleMocks.getMany.mockImplementation(async (ids: string[]) =>
      ids
        .map((id) => contextStore.get(id))
        .filter((item): item is ContextItem => Boolean(item)),
    );

    const llmEventA = buildEvent({
      id: 'evt-llm-a',
      type: 'llm_call',
      toolExecution: undefined,
      attachments: [],
      llmCall: {
        provider: 'openai',
        model: 'gpt-a',
        temperature: null,
        topP: null,
        stopReason: null,
        contextItemIds: ['ctx-a-user', 'ctx-a-assistant'],
        newContextItemCount: 1,
        responseText: null,
        rawResponse: null,
        toolCalls: [],
        usage: undefined,
      },
    });

    const llmEventB = buildEvent({
      id: 'evt-llm-b',
      type: 'llm_call',
      toolExecution: undefined,
      attachments: [],
      llmCall: {
        provider: 'openai',
        model: 'gpt-b',
        temperature: null,
        topP: null,
        stopReason: null,
        contextItemIds: ['ctx-b-user', 'ctx-b-assistant'],
        newContextItemCount: 1,
        responseText: null,
        rawResponse: null,
        toolCalls: [],
        usage: undefined,
      },
    });

    runsHookMocks.summary.mockReturnValue(buildSummary());
    runsHookMocks.events.mockReturnValue({ items: [llmEventA, llmEventB], nextCursor: null });

    const queryClient = new QueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[`/threads/${llmEventA.threadId}/runs/${llmEventA.runId}`]}>
          <Routes>
            <Route path="/threads/:threadId/runs/:runId" element={<AgentsRunScreen />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      const props = latestRunScreenProps<{ events: Array<{ id: string; type: string; data: Record<string, unknown> }> }>();
      expect(props).toBeDefined();
      const llmUiEvents = props?.events.filter((evt) => evt.type === 'llm') ?? [];
      expect(llmUiEvents).toHaveLength(2);

      const uiEventA = llmUiEvents.find((evt) => evt.id === 'evt-llm-a');
      const uiEventB = llmUiEvents.find((evt) => evt.id === 'evt-llm-b');
      expect(uiEventA?.data.response).toBe('Response A');
      expect(uiEventB?.data.response).toBe('Response B');
      expect(uiEventA?.data.toolCalls).toEqual([
        expect.objectContaining({
          id: 'call-a',
          name: 'lookup_alpha',
          arguments: { topic: 'alpha' },
        }),
      ]);
      expect(uiEventB?.data.toolCalls).toEqual([
        expect.objectContaining({
          id: 'call-b',
          name: 'search_beta',
          arguments: { topic: 'beta' },
        }),
      ]);
    });
  });
});

describe('keyboard navigation', () => {
  const buildSequenceEvents = () => [
    buildEvent({ id: 'event-a', ts: '2024-01-01T00:00:00.000Z' }),
    buildEvent({ id: 'event-b', ts: '2024-01-01T00:00:01.000Z' }),
    buildEvent({ id: 'event-c', ts: '2024-01-01T00:00:02.000Z' }),
  ];

  it('navigates events with arrow keys and disables follow on manual selection', async () => {
    const events = buildSequenceEvents();
    runsHookMocks.summary.mockReturnValue({
      ...buildSummary(),
      countsByType: {
        invocation_message: 0,
        injection: 0,
        llm_call: 0,
        tool_execution: events.length,
        summarization: 0,
      },
      totalEvents: events.length,
    });
    runsHookMocks.events.mockReturnValue({ items: events, nextCursor: null });

    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[`/threads/thread-1/runs/run-1?follow=true`]}>
          <Routes>
            <Route path="/threads/:threadId/runs/:runId" element={<AgentsRunScreen />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      const latest = latestRunScreenProps<{ selectedEventId?: string | null; isFollowing?: boolean }>();
      expect(latest?.selectedEventId).toBe('event-c');
      expect(latest?.isFollowing).toBe(true);
    });

    fireEvent.keyDown(window, { key: 'ArrowUp' });

    await waitFor(() => {
      const latest = latestRunScreenProps<{ selectedEventId?: string | null; isFollowing?: boolean }>();
      expect(latest?.selectedEventId).toBe('event-b');
      expect(latest?.isFollowing).toBe(false);
    });

    fireEvent.keyDown(window, { key: 'ArrowUp' });

    await waitFor(() => {
      const latest = latestRunScreenProps<{ selectedEventId?: string | null }>();
      expect(latest?.selectedEventId).toBe('event-a');
    });

    fireEvent.keyDown(window, { key: 'ArrowUp' });

    await waitFor(() => {
      const latest = latestRunScreenProps<{ selectedEventId?: string | null }>();
      expect(latest?.selectedEventId).toBe('event-a');
    });

    fireEvent.keyDown(window, { key: 'ArrowDown' });

    await waitFor(() => {
      const latest = latestRunScreenProps<{ selectedEventId?: string | null }>();
      expect(latest?.selectedEventId).toBe('event-b');
    });
  });

  it('ignores navigation when focus is on an editable element', async () => {
    const events = buildSequenceEvents();
    runsHookMocks.summary.mockReturnValue(buildSummary());
    runsHookMocks.events.mockReturnValue({ items: events, nextCursor: null });

    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[`/threads/thread-1/runs/run-1`]}>
          <Routes>
            <Route path="/threads/:threadId/runs/:runId" element={<AgentsRunScreen />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      const latest = latestRunScreenProps<{ events?: unknown[] }>();
      expect(Array.isArray(latest?.events)).toBe(true);
    });

    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();

    const before = latestRunScreenProps<{ selectedEventId?: string | null }>();

    fireEvent.keyDown(input, { key: 'ArrowDown' });

    await waitFor(() => {
      const latest = latestRunScreenProps<{ selectedEventId?: string | null }>();
      expect(latest?.selectedEventId).toBe(before?.selectedEventId ?? null);
    });

    input.remove();
  });
});
