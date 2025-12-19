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

type LlmCallContextItem = NonNullable<RunTimelineEvent['llmCall']>['inputContextItems'][number];

type ContextRowInput = {
  contextItemId: string;
  isNew?: boolean;
  order?: number;
  role?: LlmCallContextItem['role'];
  createdAt: string;
};

function buildContextItems(rows: ContextRowInput[], prefix = 'rel'): LlmCallContextItem[] {
  return rows.map((row, idx) => ({
    id: `${prefix}-${idx + 1}`,
    contextItemId: row.contextItemId,
    role: row.role ?? 'user',
    isNew: row.isNew ?? false,
    order: row.order ?? idx,
    createdAt: row.createdAt,
  }));
}

type AgentsRunScreenWithTesting = typeof AgentsRunScreen & {
  __testing__?: {
    extractLlmResponse: (event: RunTimelineEvent) => string;
  };
};

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

  it('extracts Anthropic style function_call output entries as tool calls', async () => {
    const anthropicAssistant: ContextItem = {
      id: 'ctx-anthropic-assistant',
      role: 'assistant',
      contentText: null,
      contentJson: {
        usage: {
          input_tokens: 100,
          total_tokens: 140,
          output_tokens: 40,
        },
        output: [
          {
            id: 'rs_123',
            type: 'reasoning',
            text: 'Thinking...',
          },
          {
            id: 'fc_456',
            type: 'function_call',
            name: 'send_message',
            status: 'completed',
            call_id: 'call_quFYL',
            arguments: '{"message":"Hi! I’m Rowan, Engineering Manager at Agyn..."}',
          },
        ],
      },
      metadata: null,
      sizeBytes: 512,
      createdAt: '2024-01-01T00:00:07.000Z',
    };

    const event = buildEvent({
      type: 'llm_call',
      toolExecution: undefined,
      llmCall: {
        provider: 'anthropic',
        model: 'claude-3-5',
        temperature: null,
        topP: null,
        stopReason: null,
        inputContextItems: buildContextItems(
          [
            {
              contextItemId: anthropicAssistant.id,
              role: 'assistant',
              createdAt: anthropicAssistant.createdAt,
              isNew: false,
            },
          ],
          'ctx-anthropic-tool-call',
        ),
        responseText: 'Done with delegate message.',
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
    contextItemsMocks.getMany.mockResolvedValue([anthropicAssistant]);

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

    await waitFor(() => expect(contextItemsMocks.getMany).toHaveBeenCalledWith([anthropicAssistant.id]));
    await waitFor(() => expect(runScreenMocks.props).toHaveBeenCalled());

    const capturedProps = runScreenMocks.props.mock.calls.at(-1)?.[0] as { events: Array<{ data: Record<string, unknown> }> } | undefined;
    if (!capturedProps) throw new Error('RunScreen props were not captured.');

    const [capturedEvent] = capturedProps.events;
    const context = (capturedEvent.data.context as Record<string, unknown>[] | undefined) ?? [];
    const assistantRecord = context.find((entry) => entry.role === 'assistant');
    expect(assistantRecord).toBeDefined();
    const toolCalls = Array.isArray(assistantRecord?.tool_calls)
      ? (assistantRecord?.tool_calls as Record<string, unknown>[])
      : Array.isArray(assistantRecord?.toolCalls)
        ? (assistantRecord?.toolCalls as Record<string, unknown>[])
        : [];
    expect(toolCalls).toHaveLength(1);
    const [toolCall] = toolCalls;
    expect(toolCall?.name ?? (toolCall?.function as Record<string, unknown> | undefined)?.name).toBe('send_message');
    expect(toolCall?.callId ?? toolCall?.call_id ?? (toolCall?.function as Record<string, unknown> | undefined)?.callId).toBe('call_quFYL');
    expect(toolCall?.arguments).toEqual({ message: 'Hi! I’m Rowan, Engineering Manager at Agyn...' });
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

  it('keeps assistant outputs separate from the input context', async () => {
    const userContext: ContextItem = {
      id: 'ctx-user-1',
      role: 'user',
      contentText: 'How are you?',
      contentJson: null,
      metadata: null,
      sizeBytes: 128,
      createdAt: '2024-01-01T00:00:01.000Z',
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
        inputContextItems: buildContextItems(
          [
            {
              contextItemId: userContext.id,
              role: 'user',
              isNew: false,
              createdAt: userContext.createdAt,
            },
          ],
          'ctx-llm-separated',
        ),
        responseText: 'I am fine, thanks!',
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
    contextItemsMocks.getMany.mockImplementation(async () => [userContext]);

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

    await waitFor(() => expect(contextItemsMocks.getMany).toHaveBeenCalledWith([userContext.id]));

    await waitFor(() => expect(runScreenMocks.props).toHaveBeenCalled());
    const lastCall = runScreenMocks.props.mock.calls.at(-1);
    const capturedProps = lastCall?.[0] as { events: Array<{ data: Record<string, unknown> }> } | undefined;
    if (!capturedProps) throw new Error('RunScreen props were not captured.');

    const [capturedEvent] = capturedProps.events;
    const context = (capturedEvent.data.context as Record<string, unknown>[] | undefined) ?? [];
    expect(context).toHaveLength(1);
    const [userEntry] = context;
    expect(userEntry.role).toBe('user');
    expect(userEntry.content).toContain('How are you?');
    const assistantOutputs = (capturedEvent.data.assistantContext as Record<string, unknown>[] | undefined) ?? [];
    expect(assistantOutputs).toHaveLength(0);
    expect(capturedEvent.data['response']).toContain('I am fine, thanks!');
  });

  it('highlights new user context items when IDs are provided', async () => {
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

    const userContext: ContextItem = {
      id: 'ctx-3',
      role: 'user',
      contentText: 'Please finish the draft.',
      contentJson: null,
      metadata: null,
      sizeBytes: 144,
      createdAt: '2024-01-01T00:00:04.000Z',
    };

    const event = buildEvent({
      type: 'llm_call',
      toolExecution: undefined,
      llmCall: {
        provider: 'openai',
        model: 'gpt-4.1-mini',
        temperature: null,
        topP: null,
        stopReason: null,
        inputContextItems: buildContextItems(
          [
            {
              contextItemId: userContext.id,
              role: 'user',
              isNew: true,
              createdAt: userContext.createdAt,
            },
            {
              contextItemId: assistantContext.id,
              role: 'assistant',
              isNew: false,
              createdAt: assistantContext.createdAt,
            },
          ],
          'ctx-highlight',
        ),
        responseText: 'Working on it.',
        rawResponse: null,
        toolCalls: [],
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
    contextItemsMocks.getMany.mockImplementation(async () => [assistantContext, userContext]);

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

    await waitFor(() => expect(contextItemsMocks.getMany).toHaveBeenCalled());
    expect(contextItemsMocks.getMany).toHaveBeenCalledWith(expect.arrayContaining([assistantContext.id, userContext.id]));

    await waitFor(() => expect(runScreenMocks.props).toHaveBeenCalled());
    const lastCall = runScreenMocks.props.mock.calls.at(-1);
    const capturedProps = lastCall?.[0] as { events: Array<{ data: Record<string, unknown> }> } | undefined;
    if (!capturedProps) throw new Error('RunScreen props were not captured.');

    const [capturedEvent] = capturedProps.events;
    const context = (capturedEvent.data.context as Record<string, unknown>[] | undefined) ?? [];
    expect(context).toHaveLength(2);
    const userEntry = context.find((entry) => entry.id === userContext.id) ?? context[0];
    const assistantEntry = context.find((entry) => entry.id === assistantContext.id) ?? context[1];
    expect(userEntry.role).toBe('user');
    expect(userEntry.content).toBe('Please finish the draft.');
    expect(userEntry['__agynIsNew']).toBe(true);
    expect(assistantEntry.role).toBe('assistant');
    expect(assistantEntry.content).toContain('Working on it.');
    expect(assistantEntry['__agynIsNew']).toBeUndefined();
  });

  it('retains highlight when duplicate context IDs mark later entries as new', async () => {
    const userContext: ContextItem = {
      id: 'ctx-duplicate',
      role: 'user',
      contentText: 'Please review the report.',
      contentJson: null,
      metadata: null,
      sizeBytes: 96,
      createdAt: '2024-01-01T00:00:05.000Z',
    };

    const event = buildEvent({
      type: 'llm_call',
      toolExecution: undefined,
      llmCall: {
        provider: 'openai',
        model: 'gpt-4o',
        temperature: null,
        topP: null,
        stopReason: null,
        inputContextItems: buildContextItems(
          [
            {
              contextItemId: userContext.id,
              role: 'user',
              isNew: false,
              createdAt: userContext.createdAt,
            },
            {
              contextItemId: userContext.id,
              role: 'user',
              isNew: true,
              createdAt: userContext.createdAt,
            },
          ],
          'ctx-llm-duplicate-new',
        ),
        responseText: 'Report acknowledged.',
        rawResponse: null,
        toolCalls: [],
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
    contextItemsMocks.getMany.mockResolvedValue([userContext]);

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

    await waitFor(() => expect(contextItemsMocks.getMany).toHaveBeenCalledWith([userContext.id]));

    await waitFor(() => expect(runScreenMocks.props).toHaveBeenCalled());
    const lastCall = runScreenMocks.props.mock.calls.at(-1);
    const capturedProps = lastCall?.[0] as { events: Array<{ data: Record<string, unknown> }> } | undefined;
    if (!capturedProps) throw new Error('RunScreen props were not captured.');

    const [capturedEvent] = capturedProps.events;
    const context = (capturedEvent.data.context as Record<string, unknown>[] | undefined) ?? [];
    expect(context).toHaveLength(1);
    const [entry] = context;
    expect(entry.id).toBe(userContext.id);
    expect(entry['__agynIsNew']).toBe(true);
  });

  it('renders assistant and tool inputs together when both are new', async () => {
    const assistantInput: ContextItem = {
      id: 'ctx-assistant-input',
      role: 'assistant',
      contentText: 'Assistant input message',
      contentJson: null,
      metadata: null,
      sizeBytes: 256,
      createdAt: '2025-01-01T00:00:00.000Z',
    };

    const toolInput: ContextItem = {
      id: 'ctx-tool-input',
      role: 'tool',
      contentText: 'Tool input payload',
      contentJson: null,
      metadata: null,
      sizeBytes: 384,
      createdAt: '2025-01-01T00:00:01.000Z',
    };

    const event = buildEvent({
      type: 'llm_call',
      toolExecution: undefined,
      llmCall: {
        provider: 'openai',
        model: 'gpt-4.1-mini',
        temperature: null,
        topP: null,
        stopReason: null,
        inputContextItems: buildContextItems(
          [
            {
              contextItemId: assistantInput.id,
              role: 'assistant',
              isNew: true,
              createdAt: assistantInput.createdAt,
            },
            {
              contextItemId: toolInput.id,
              role: 'tool',
              isNew: true,
              createdAt: toolInput.createdAt,
            },
          ],
          'ctx-assistant-tool',
        ),
        responseText: null,
        rawResponse: null,
        toolCalls: [],
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
    contextItemsMocks.getMany.mockImplementation(async () => [assistantInput, toolInput]);

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

    await waitFor(() => expect(contextItemsMocks.getMany).toHaveBeenCalledWith(expect.arrayContaining([assistantInput.id, toolInput.id])));

    await waitFor(() => expect(runScreenMocks.props).toHaveBeenCalled());
    const lastCall = runScreenMocks.props.mock.calls.at(-1);
    const capturedProps = lastCall?.[0] as { events: Array<{ data: Record<string, unknown> }> } | undefined;
    if (!capturedProps) throw new Error('RunScreen props were not captured.');

    const [capturedEvent] = capturedProps.events;
    const context = (capturedEvent.data.context as Record<string, unknown>[] | undefined) ?? [];
    expect(context).toHaveLength(2);
    const assistantEntry = context.find((entry) => entry.id === assistantInput.id);
    const toolEntry = context.find((entry) => entry.id === toolInput.id);
    expect(assistantEntry?.role).toBe('assistant');
    expect(assistantEntry?.content).toContain('Assistant input message');
    expect(assistantEntry?.['__agynIsNew']).toBe(true);
    expect(toolEntry?.role).toBe('tool');
    expect(toolEntry?.content).toContain('Tool input payload');
    expect(toolEntry?.['__agynIsNew']).toBe(true);
  });

  it('still excludes assistant contexts that contain only tool data', async () => {
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
        inputContextItems: buildContextItems(
          [
            {
              contextItemId: assistantContext.id,
              role: 'assistant',
              createdAt: assistantContext.createdAt,
              isNew: false,
            },
          ],
          'ctx-structured',
        ),
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

    await waitFor(() => expect(runScreenMocks.props).toHaveBeenCalled());
    const lastCall = runScreenMocks.props.mock.calls.at(-1);
    const capturedProps = lastCall?.[0] as { events: Array<{ data: Record<string, unknown> }> } | undefined;
    if (!capturedProps) throw new Error('RunScreen props were not captured.');

    const [capturedEvent] = capturedProps.events;
    const context = (capturedEvent.data.context as Record<string, unknown>[] | undefined) ?? [];
    expect(context).toHaveLength(1);
    const [assistantEntry] = context;
    expect(assistantEntry.role).toBe('assistant');
    expect(Array.isArray(assistantEntry.tool_calls) || Array.isArray(assistantEntry.toolCalls)).toBe(true);
  });

  it('only renders tool calls that belong to each assistant context item', async () => {
    const assistantWithTool: ContextItem = {
      id: 'ctx-assistant-tool',
      role: 'assistant',
      contentText: 'Searching for foo',
      contentJson: {
        content: 'Searching for foo',
        tool_calls: [
          {
            callId: 'ctx-tool-call',
            name: 'search',
            arguments: { q: 'foo' },
          },
        ],
      },
      metadata: null,
      sizeBytes: 200,
      createdAt: '2024-01-01T00:00:05.000Z',
    };

    const assistantWithoutTool: ContextItem = {
      id: 'ctx-assistant-plain',
      role: 'assistant',
      contentText: 'Plain response',
      contentJson: null,
      metadata: null,
      sizeBytes: 180,
      createdAt: '2024-01-01T00:00:06.000Z',
    };

    const event = buildEvent({
      type: 'llm_call',
      toolExecution: undefined,
      llmCall: {
        provider: 'openai',
        model: 'gpt-4.1-mini',
        temperature: null,
        topP: null,
        stopReason: null,
        inputContextItems: buildContextItems(
          [
            {
              contextItemId: assistantWithTool.id,
              role: 'assistant',
              createdAt: assistantWithTool.createdAt,
              isNew: false,
            },
            {
              contextItemId: assistantWithoutTool.id,
              role: 'assistant',
              createdAt: assistantWithoutTool.createdAt,
              isNew: false,
            },
          ],
          'ctx-per-item-tool-calls',
        ),
        responseText: 'All set.',
        rawResponse: null,
        toolCalls: [
          {
            callId: 'llm-output-call',
            name: 'shell_command',
            arguments: { command: 'echo 1' },
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
    contextItemsMocks.getMany.mockImplementation(async () => [assistantWithTool, assistantWithoutTool]);

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

    await waitFor(() =>
      expect(contextItemsMocks.getMany).toHaveBeenCalledWith(expect.arrayContaining([assistantWithTool.id, assistantWithoutTool.id])),
    );

    await waitFor(() => expect(runScreenMocks.props).toHaveBeenCalled());
    const lastCall = runScreenMocks.props.mock.calls.at(-1);
    const capturedProps = lastCall?.[0] as { events: Array<{ data: Record<string, unknown> }> } | undefined;
    if (!capturedProps) throw new Error('RunScreen props were not captured.');

    const [capturedEvent] = capturedProps.events;
    const context = (capturedEvent.data.context as Record<string, unknown>[] | undefined) ?? [];
    expect(context).toHaveLength(2);

    const extractToolCalls = (record?: Record<string, unknown>): Record<string, unknown>[] => {
      if (!record) return [];
      const toolCallsValue = ((record['tool_calls'] ?? record['toolCalls']) ?? []) as unknown;
      return Array.isArray(toolCallsValue) ? (toolCallsValue as Record<string, unknown>[]) : [];
    };

    const withToolRecord = context.find((entry) => entry.id === assistantWithTool.id);
    const withoutToolRecord = context.find((entry) => entry.id === assistantWithoutTool.id);
    const withToolCalls = extractToolCalls(withToolRecord);
    const withoutToolCalls = extractToolCalls(withoutToolRecord);

    expect(withToolCalls).toHaveLength(1);
    expect(withToolCalls[0]).toMatchObject({ name: 'search', arguments: { q: 'foo' } });
    expect(withoutToolCalls).toHaveLength(0);

    const allToolCallNames = context.flatMap((entry) => extractToolCalls(entry).map((call) => call['name']));
    expect(allToolCallNames).not.toContain('shell_command');
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
        inputContextItems: [],
        responseText: null,
        rawResponse: null,
        toolCalls: [],
        usage: undefined,
      },
      ...overrides,
    } satisfies RunTimelineEvent);

  it('returns errorMessage when provided on the event', () => {
    const event = baseEvent({ status: 'error', errorMessage: 'LLM unhappy' });
    const extract = getExtract();
    expect(extract(event)).toBe('LLM unhappy');
  });

  it('uses rawResponse.message when errorMessage is absent', () => {
    const event = baseEvent({ status: 'error' });
    if (!event.llmCall) throw new Error('llmCall missing');
    event.llmCall.rawResponse = { message: 'LLM crashed', name: 'ModelError' };
    const extract = getExtract();
    expect(extract(event)).toBe('LLM crashed');
  });

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

  it('returns empty string when no response sources are present', () => {
    const event = baseEvent({});
    const extract = getExtract();
    expect(extract(event)).toBe('');
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
