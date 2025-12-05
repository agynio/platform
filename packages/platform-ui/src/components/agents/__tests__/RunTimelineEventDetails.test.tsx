import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { RunTimelineEventDetails } from '../RunTimelineEventDetails';
import * as contextItemsModule from '@/api/hooks/contextItems';
import type { UseContextItemsResult } from '@/api/hooks/contextItems';
import * as contextItemsApi from '@/api/modules/contextItems';
import * as runsModule from '@/api/modules/runs';
import type { ContextItem, RunTimelineEvent } from '@/api/types/agents';
const useToolOutputStreamingMock = vi.fn();

vi.mock('@/hooks/useToolOutputStreaming', () => ({
  useToolOutputStreaming: (options: unknown) => useToolOutputStreamingMock(options),
}));

const waitForStableScrollResolvers: Array<() => void> = [];
const waitForStableScrollHeightMock = vi.fn(() => new Promise<void>((resolve) => {
  waitForStableScrollResolvers.push(resolve);
}));

vi.mock('../waitForStableScrollHeight', () => ({
  waitForStableScrollHeight: (...args: unknown[]) => waitForStableScrollHeightMock(...args),
  waitForStableScrollDefaults: { stableFrames: 3, timeoutMs: 1500 },
}));

function renderDetails(event: RunTimelineEvent) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Number.POSITIVE_INFINITY, staleTime: Number.POSITIVE_INFINITY },
    },
  });

  const Providers: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <MemoryRouter>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </MemoryRouter>
  );

  const result = render(<RunTimelineEventDetails event={event} />, { wrapper: Providers });

  return {
    ...result,
    rerender(nextEvent: RunTimelineEvent) {
      result.rerender(<RunTimelineEventDetails event={nextEvent} />);
    },
  };
}

function makeScrollable(element: HTMLElement, {
  scrollHeight,
  clientHeight,
  scrollTop,
}: {
  scrollHeight: number;
  clientHeight: number;
  scrollTop: number;
}) {
  Object.defineProperty(element, 'scrollHeight', {
    configurable: true,
    get: () => scrollHeight,
  });
  Object.defineProperty(element, 'clientHeight', {
    configurable: true,
    get: () => clientHeight,
  });
  let currentTop = scrollTop;
  Object.defineProperty(element, 'scrollTop', {
    configurable: true,
    get: () => currentTop,
    set: (value) => {
      currentTop = value;
    },
  });
}

function buildEvent(overrides: Partial<RunTimelineEvent> = {}): RunTimelineEvent {
  const base: RunTimelineEvent = {
    id: 'evt-1',
    runId: 'run-1',
    threadId: 'thread-1',
    type: 'tool_execution',
    status: 'success',
    ts: '2024-01-01T00:00:00.000Z',
    startedAt: null,
    endedAt: null,
    durationMs: 1200,
    nodeId: 'node-1',
    sourceKind: 'internal',
    sourceSpanId: null,
    metadata: {},
    errorCode: null,
    errorMessage: null,
    llmCall: undefined,
    toolExecution: {
      toolName: 'Example tool',
      toolCallId: 'call-1',
      execStatus: 'success',
      input: { query: 'status' },
      output: { result: 'ok' },
      errorMessage: null,
      raw: { raw: true },
    },
    summarization: undefined,
    injection: undefined,
    message: undefined,
    attachments: [],
  };

  const { toolExecution, llmCall, message, attachments, ...rest } = overrides;
  const hasToolOverride = Object.prototype.hasOwnProperty.call(overrides, 'toolExecution');
  const finalToolExecution = hasToolOverride ? toolExecution : base.toolExecution;
  const finalLlmCall = llmCall
    ? {
        provider: null,
        model: null,
        temperature: null,
        topP: null,
        stopReason: null,
        contextItemIds: [] as string[],
        newContextItemCount: 0,
        responseText: null,
        rawResponse: null,
        toolCalls: [] as Array<{ callId: string; name: string; arguments: unknown }>,
        ...llmCall,
      }
    : base.llmCall;

  return {
    ...base,
    ...rest,
    llmCall: finalLlmCall,
    toolExecution: finalToolExecution ? { ...base.toolExecution!, ...finalToolExecution } : finalToolExecution,
    message: message ?? base.message,
    attachments: attachments ?? base.attachments,
  };
}

beforeEach(() => {
  useToolOutputStreamingMock.mockReset();
  useToolOutputStreamingMock.mockReturnValue({
    text: '',
    stdoutText: '',
    stderrText: '',
    chunks: [],
    terminal: null,
    hydrated: false,
    lastSeq: 0,
    loading: false,
    error: null,
  });
  try {
    window.sessionStorage.clear();
  } catch (_err) {
    // Ignored – storage may be unavailable in some environments
  }
  waitForStableScrollHeightMock.mockClear();
  waitForStableScrollResolvers.length = 0;
});

describe('RunTimelineEventDetails', () => {
  it('defaults output viewer to json for objects and allows switching', async () => {
    const user = userEvent.setup();
    renderDetails(buildEvent());

    const select = screen.getByLabelText('Select output view');
    expect(select).toHaveValue('json');

    await user.selectOptions(select, 'text');
    expect(select).toHaveValue('text');
    expect(screen.getByText(/"result": "ok"/)).toBeInTheDocument();
  });

  it('detects terminal output via ansi escape sequences', () => {
    const ansiOutput = '\u001b[31mFailure\u001b[0m';
    renderDetails(buildEvent({ toolExecution: { output: ansiOutput, raw: null } }));

    expect(screen.getByLabelText('Select output view')).toHaveValue('terminal');
  });

  it('persists selected visualization per event id', async () => {
    const user = userEvent.setup();
    const { rerender } = renderDetails(buildEvent({ id: 'evt-a' }));
    const select = screen.getByLabelText('Select output view');

    await user.selectOptions(select, 'markdown');
    expect(select).toHaveValue('markdown');

    rerender(buildEvent({ id: 'evt-a' }));
    expect(screen.getByLabelText('Select output view')).toHaveValue('markdown');

    rerender(buildEvent({ id: 'evt-b' }));
    expect(screen.getByLabelText('Select output view')).toHaveValue('json');
  });

  it('shows response and tool calls blocks only when data present', () => {
    const llmOnlyRaw = buildEvent({
      type: 'llm_call',
      llmCall: {
        provider: 'openai',
        model: 'gpt-test',
        temperature: null,
        topP: null,
        stopReason: null,
        contextItemIds: [],
        responseText: null,
        rawResponse: { foo: 'bar' },
        toolCalls: [],
      },
      toolExecution: undefined,
    });

    renderDetails(llmOnlyRaw);
    expect(screen.queryByText('Response')).toBeNull();
    expect(screen.queryByText(/Tool Calls/i)).toBeNull();
    expect(screen.queryByText('Raw response')).toBeNull();
    expect(screen.queryByText('Output')).toBeNull();
  });

  it('renders response and tool calls when provided', () => {
    const event = buildEvent({
      type: 'llm_call',
      llmCall: {
        provider: 'openai',
        model: 'gpt-test',
        temperature: null,
        topP: null,
        stopReason: null,
        contextItemIds: [],
        responseText: 'All good',
        rawResponse: { content: 'All good' },
        toolCalls: [{ callId: 'tool-1', name: 'search', arguments: { q: 'hi' } }],
      },
      toolExecution: undefined,
    });

    renderDetails(event);
    const responseLabel = screen.getByText('Response');
    const responseContainer = responseLabel.parentElement;
    expect(responseContainer).toBeTruthy();
    if (responseContainer) {
      expect(within(responseContainer).getByText('All good')).toBeInTheDocument();
    }

    const toolCallsLabel = screen.getByText(/Tool Calls/i);
    expect(toolCallsLabel).toBeInTheDocument();
    expect(screen.getByText(/search/)).toBeInTheDocument();
    expect(screen.queryByText('Raw response')).toBeNull();
  });

  it('displays LLM usage metrics when available', () => {
    const event = buildEvent({
      type: 'llm_call',
      llmCall: {
        provider: 'openai',
        model: 'gpt-usage',
        temperature: null,
        topP: null,
        stopReason: null,
        contextItemIds: [],
        responseText: 'usage test',
        rawResponse: null,
        toolCalls: [],
        usage: {
          inputTokens: 123,
          cachedInputTokens: 45,
          outputTokens: 67,
          reasoningTokens: 8,
          totalTokens: 190,
        },
      },
      toolExecution: undefined,
    });

    renderDetails(event);

    expect(screen.getByText('Input:', { selector: 'span' }).parentElement).toHaveTextContent(/Input:\s*123/);
    expect(screen.getByText('Cached:', { selector: 'span' }).parentElement).toHaveTextContent(/Cached:\s*45/);
    expect(screen.getByText('Output:', { selector: 'span' }).parentElement).toHaveTextContent(/Output:\s*67/);
    expect(
      screen.getByText('Reasoning:', { selector: 'span' }).parentElement,
    ).toHaveTextContent(/Reasoning:\s*8/);
    expect(screen.getByText('Total:', { selector: 'span' }).parentElement).toHaveTextContent(/Total:\s*190/);
  });

  it('wraps long response text using content-wrap', () => {
    const longText = 'A'.repeat(120);
    const event = buildEvent({
      type: 'llm_call',
      llmCall: {
        provider: 'openai',
        model: 'gpt-test',
        temperature: null,
        topP: null,
        stopReason: null,
        contextItemIds: [],
        responseText: longText,
        rawResponse: { content: longText },
        toolCalls: [],
      },
      toolExecution: undefined,
    });

    renderDetails(event);
    const responseText = screen.getByText(longText);
    expect(responseText).toHaveClass('content-wrap');
  });

  it('omits raw message source in invocation message details', () => {
    const event = buildEvent({
      type: 'invocation_message',
      message: {
        messageId: 'msg-1',
        role: 'user',
        kind: 'text',
        text: 'Hello',
        source: { foo: 'secret' },
        createdAt: '2024-01-01T00:00:00.000Z',
      },
      toolExecution: undefined,
    });

    renderDetails(event);
    expect(screen.queryByText(/"foo": "secret"/)).toBeNull();
  });

  it('applies content-pre class when switching output to terminal mode', async () => {
    const user = userEvent.setup();
    renderDetails(buildEvent({ toolExecution: { output: 'command output', raw: null } }));

    const select = screen.getByLabelText('Select output view');
    await user.selectOptions(select, 'terminal');

    const terminalPre = screen.getByText('command output', { selector: 'pre' });
    expect(terminalPre).toHaveClass('content-pre');
  });

  it('does not crash when sessionStorage access is blocked', () => {
    const originalDescriptor = Object.getOwnPropertyDescriptor(window, 'sessionStorage');
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      get() {
        throw new Error('blocked');
      },
    });

    expect(() => renderDetails(buildEvent())).not.toThrow();

    if (originalDescriptor) {
      Object.defineProperty(window, 'sessionStorage', originalDescriptor);
    } else {
      delete (window as { sessionStorage?: Storage }).sessionStorage;
    }
  });

  it('renders output selector in header and omits inline raw payload text', () => {
    renderDetails(buildEvent());

    const outputHeader = screen.getByText('Output').closest('header');
    expect(outputHeader).toBeTruthy();
    if (outputHeader) {
      expect(within(outputHeader).getByRole('combobox', { name: 'Select output view' })).toBeInTheDocument();
    }

    expect(screen.queryByText(/Raw payload/)).toBeNull();
  });

  it('renders streaming badge and live output when shell tool is active', () => {
    useToolOutputStreamingMock.mockReturnValue({
      text: 'stream output',
      stdoutText: 'stream output',
      stderrText: '',
      chunks: [
        {
          runId: 'run-1',
          threadId: 'thread-1',
          eventId: 'evt-1',
          seqGlobal: 1,
          seqStream: 1,
          source: 'stdout',
          ts: '2024-01-01T00:00:00.000Z',
          data: 'stream output',
        },
      ],
      terminal: null,
      hydrated: true,
      lastSeq: 1,
      loading: false,
      error: null,
    });

    renderDetails(
      buildEvent({
        status: 'running',
        toolExecution: { toolName: 'shell_command', output: 'original', raw: null },
      }),
    );

    expect(screen.getByText(/Streaming…/)).toBeInTheDocument();
    expect(screen.getByText('stream output')).toBeInTheDocument();
  });

  it('allows filtering between stdout and stderr with visual differentiation', async () => {
    const user = userEvent.setup();
    useToolOutputStreamingMock.mockReturnValue({
      text: 'line1\nwarn\ndone\n',
      stdoutText: 'line1\ndone\n',
      stderrText: 'warn\n',
      chunks: [
        {
          runId: 'run-1',
          threadId: 'thread-1',
          eventId: 'evt-1',
          seqGlobal: 1,
          seqStream: 1,
          source: 'stdout',
          ts: '2024-01-01T00:00:00.000Z',
          data: 'line1\n',
        },
        {
          runId: 'run-1',
          threadId: 'thread-1',
          eventId: 'evt-1',
          seqGlobal: 2,
          seqStream: 1,
          source: 'stderr',
          ts: '2024-01-01T00:00:01.000Z',
          data: 'warn\n',
        },
        {
          runId: 'run-1',
          threadId: 'thread-1',
          eventId: 'evt-1',
          seqGlobal: 3,
          seqStream: 2,
          source: 'stdout',
          ts: '2024-01-01T00:00:02.000Z',
          data: 'done\n',
        },
      ],
      terminal: null,
      hydrated: true,
      lastSeq: 3,
      loading: false,
      error: null,
    });

    renderDetails(
      buildEvent({
        status: 'running',
        toolExecution: { toolName: 'shell_command', output: '', raw: null },
      }),
    );

    const streamSelect = screen.getByLabelText('Select stream view');
    expect(streamSelect).toHaveValue('interleaved');

    const stderrSegment = document.querySelector('[data-source="stderr"]');
    expect(stderrSegment).not.toBeNull();
    expect(stderrSegment?.textContent).toContain('warn');
    expect(stderrSegment?.className).toMatch(/text-(?:red|rose)/);

    await user.selectOptions(streamSelect, 'Stdout only');
    expect(document.querySelector('[data-source="stderr"]')).toBeNull();
    expect(screen.getByText(/line1/)).toBeInTheDocument();
    expect(screen.getByText(/done/)).toBeInTheDocument();
    expect(screen.queryByText(/warn/)).toBeNull();

    await user.selectOptions(streamSelect, 'Stderr only');
    const stderrOnlySegment = document.querySelector('[data-source="stderr"]');
    expect(stderrOnlySegment).not.toBeNull();
    expect(stderrOnlySegment?.textContent).toContain('warn');
    expect(screen.queryByText(/line1/)).toBeNull();
    expect(screen.queryByText(/done/)).toBeNull();
  });

  it('defaults stream filter to stdout on successful terminal output and shows stderr note', async () => {
    const user = userEvent.setup();
    useToolOutputStreamingMock.mockReturnValue({
      text: 'out\nwarn\n',
      stdoutText: 'out\n',
      stderrText: 'warn\n',
      chunks: [
        {
          runId: 'run-1',
          threadId: 'thread-1',
          eventId: 'evt-1',
          seqGlobal: 1,
          seqStream: 1,
          source: 'stdout',
          ts: '2024-01-01T00:00:00.000Z',
          data: 'out\n',
        },
        {
          runId: 'run-1',
          threadId: 'thread-1',
          eventId: 'evt-1',
          seqGlobal: 2,
          seqStream: 1,
          source: 'stderr',
          ts: '2024-01-01T00:00:01.000Z',
          data: 'warn\n',
        },
      ],
      terminal: {
        runId: 'run-1',
        threadId: 'thread-1',
        eventId: 'evt-1',
        status: 'success',
        exitCode: 0,
        bytesStdout: 3,
        bytesStderr: 1,
        totalChunks: 2,
        droppedChunks: 0,
        savedPath: null,
        message: null,
        ts: '2024-01-01T00:00:05.000Z',
      },
      hydrated: true,
      lastSeq: 2,
      loading: false,
      error: null,
    });

    renderDetails(
      buildEvent({
        status: 'success',
        toolExecution: { toolName: 'shell_command', output: '', raw: null },
      }),
    );

    const streamSelect = screen.getByLabelText('Select stream view');
    expect(streamSelect).toHaveValue('stdout');

    await user.selectOptions(streamSelect, 'stderr');
    expect(streamSelect).toHaveValue('stderr');
    expect(screen.getByText('Command succeeded; some tools print messages to stderr.')).toBeInTheDocument();
  });

  it('applies neutral styling to stderr badges when exit code is zero', async () => {
    const user = userEvent.setup();
    useToolOutputStreamingMock.mockReturnValue({
      text: 'out\nwarn\n',
      stdoutText: 'out\n',
      stderrText: 'warn\n',
      chunks: [
        {
          runId: 'run-1',
          threadId: 'thread-1',
          eventId: 'evt-1',
          seqGlobal: 1,
          seqStream: 1,
          source: 'stdout',
          ts: '2024-01-01T00:00:00.000Z',
          data: 'out\n',
        },
        {
          runId: 'run-1',
          threadId: 'thread-1',
          eventId: 'evt-1',
          seqGlobal: 2,
          seqStream: 1,
          source: 'stderr',
          ts: '2024-01-01T00:00:01.000Z',
          data: 'warn\n',
        },
      ],
      terminal: {
        runId: 'run-1',
        threadId: 'thread-1',
        eventId: 'evt-1',
        status: 'success',
        exitCode: 0,
        bytesStdout: 3,
        bytesStderr: 1,
        totalChunks: 2,
        droppedChunks: 0,
        savedPath: null,
        message: null,
        ts: '2024-01-01T00:00:05.000Z',
      },
      hydrated: true,
      lastSeq: 2,
      loading: false,
      error: null,
    });

    renderDetails(
      buildEvent({
        status: 'success',
        toolExecution: { toolName: 'shell_command', output: '', raw: null },
      }),
    );

    const streamSelect = screen.getByLabelText('Select stream view');
    await user.selectOptions(streamSelect, 'interleaved');

    const stderrSegment = document.querySelector('[data-source="stderr"]');
    expect(stderrSegment).not.toBeNull();
    expect(stderrSegment?.className).toMatch(/text-gray-(?:200|700)/);
    expect(stderrSegment?.className).not.toMatch(/text-(?:rose|red)/);
  });

  it('defaults stream filter to stderr and keeps alert styling when terminal indicates failure', async () => {
    const user = userEvent.setup();
    useToolOutputStreamingMock.mockReturnValue({
      text: 'out\nwarn\n',
      stdoutText: 'out\n',
      stderrText: 'warn\n',
      chunks: [
        {
          runId: 'run-1',
          threadId: 'thread-1',
          eventId: 'evt-1',
          seqGlobal: 1,
          seqStream: 1,
          source: 'stdout',
          ts: '2024-01-01T00:00:00.000Z',
          data: 'out\n',
        },
        {
          runId: 'run-1',
          threadId: 'thread-1',
          eventId: 'evt-1',
          seqGlobal: 2,
          seqStream: 1,
          source: 'stderr',
          ts: '2024-01-01T00:00:01.000Z',
          data: 'warn\n',
        },
      ],
      terminal: {
        runId: 'run-1',
        threadId: 'thread-1',
        eventId: 'evt-1',
        status: 'error',
        exitCode: 2,
        bytesStdout: 3,
        bytesStderr: 1,
        totalChunks: 2,
        droppedChunks: 0,
        savedPath: null,
        message: 'Command failed',
        ts: '2024-01-01T00:00:05.000Z',
      },
      hydrated: true,
      lastSeq: 2,
      loading: false,
      error: null,
    });

    renderDetails(
      buildEvent({
        status: 'error',
        toolExecution: { toolName: 'shell_command', output: '', raw: null },
      }),
    );

    const streamSelect = screen.getByLabelText('Select stream view');
    expect(streamSelect).toHaveValue('stderr');
    expect(screen.queryByText('Command succeeded; some tools print messages to stderr.')).toBeNull();

    await user.selectOptions(streamSelect, 'interleaved');
    const stderrSegment = document.querySelector('[data-source="stderr"]');
    expect(stderrSegment).not.toBeNull();
    expect(stderrSegment?.className).toMatch(/text-(?:rose|red)/);
  });

  it('shows terminal summary metadata when streaming finishes', () => {
    useToolOutputStreamingMock.mockReturnValue({
      text: 'final result',
      stdoutText: 'final result',
      stderrText: '',
      chunks: [
        {
          runId: 'run-1',
          threadId: 'thread-1',
          eventId: 'evt-1',
          seqGlobal: 1,
          seqStream: 1,
          source: 'stdout',
          ts: '2024-01-01T00:00:03.000Z',
          data: 'final result',
        },
      ],
      terminal: {
        runId: 'run-1',
        threadId: 'thread-1',
        eventId: 'evt-1',
        status: 'truncated',
        exitCode: 0,
        bytesStdout: 10,
        bytesStderr: 0,
        totalChunks: 3,
        droppedChunks: 1,
        savedPath: '/tmp/output.txt',
        message: 'Output truncated after limit',
        ts: '2024-01-01T00:00:05.000Z',
      },
      hydrated: true,
      lastSeq: 3,
      loading: false,
      error: null,
    });

    renderDetails(
      buildEvent({
        toolExecution: { toolName: 'shell_command', output: '', raw: null },
      }),
    );

    expect(screen.getByText(/Truncated/)).toBeInTheDocument();
    expect(screen.getByText(/Output truncated after limit/)).toBeInTheDocument();
    expect(screen.getByText('/tmp/output.txt')).toBeInTheDocument();
  });

  it('omits metadata and source detail rows from overview', () => {
    renderDetails(buildEvent());

    expect(screen.queryByText('Metadata')).toBeNull();
    expect(screen.queryByText(/Source:/)).toBeNull();
    expect(screen.queryByText(/Started/)).toBeNull();
    expect(screen.queryByText(/Ended/)).toBeNull();
  });

  it('lists prompt and response attachments in the attachments section only', () => {
    const attachments = [
      {
        id: 'att-prompt',
        kind: 'prompt' as const,
        isGzip: false,
        sizeBytes: 128,
        contentJson: null,
        contentText: 'Prompt body',
      },
      {
        id: 'att-response',
        kind: 'response' as const,
        isGzip: false,
        sizeBytes: 256,
        contentJson: { value: 'resp' },
        contentText: null,
      },
    ];

    const event = buildEvent({
      type: 'llm_call',
      attachments,
      toolExecution: undefined,
      llmCall: {
        provider: 'openai',
        model: 'gpt-test',
        temperature: null,
        topP: null,
        stopReason: null,
        contextItemIds: [],
        responseText: 'Answer',
        rawResponse: { content: 'Answer' },
        toolCalls: [],
      },
    });

    renderDetails(event);

    expect(screen.getByText('Attachments')).toBeInTheDocument();
    expect(screen.getByText('Prompt attachments (1)')).toBeInTheDocument();
    expect(screen.getByText('Response attachments (1)')).toBeInTheDocument();
    expect(screen.queryByText(/Response attachment \(/)).toBeNull();
  });

  it('hides tool call metadata when no identifier is present', () => {
    renderDetails(buildEvent({ toolExecution: { toolCallId: null } }));

    expect(screen.queryByText(/Tool call:/)).toBeNull();
  });

  it('omits summarization raw payload block', () => {
    const event = buildEvent({
      type: 'summarization',
      toolExecution: undefined,
      summarization: {
        summaryText: 'Short summary',
        newContextCount: 2,
        oldContextTokens: null,
        raw: { verbose: true },
      },
    });

    renderDetails(event);

    expect(screen.getByRole('heading', { name: 'Summarization' })).toBeInTheDocument();
    expect(screen.queryByText(/Raw payload/)).toBeNull();
  });

  it('omits injection reason when missing', () => {
    const event = buildEvent({
      type: 'injection',
      toolExecution: undefined,
      injection: {
        messageIds: ['m-1'],
        reason: null,
      },
    });

    renderDetails(event);

    expect(screen.getByText(/Messages:/)).toBeInTheDocument();
    expect(screen.queryByText(/Reason:/)).toBeNull();
  });

  it('renders context chunks with role badges and no metadata block', () => {
    const contextItems: ContextItem[] = [
      {
        id: 'ctx-1',
        role: 'user',
        contentText: 'First chunk',
        contentJson: null,
        metadata: { foo: 'bar' },
        sizeBytes: 128,
        createdAt: '2024-01-01T00:00:00.000Z',
      },
    ];

    const useContextItemsSpy = vi.spyOn(contextItemsModule, 'useContextItems').mockReturnValue({
      items: contextItems,
      total: contextItems.length,
      loadedCount: contextItems.length,
      targetCount: contextItems.length,
      hasMore: false,
      isInitialLoading: false,
      isFetching: false,
      error: null,
      loadMore: vi.fn(),
    });

    try {
      const event = buildEvent({
        type: 'llm_call',
        llmCall: {
          provider: 'openai',
          model: 'gpt-test',
          temperature: null,
          topP: null,
          stopReason: null,
          contextItemIds: contextItems.map((item) => item.id),
          responseText: null,
          rawResponse: null,
          toolCalls: [],
        },
        toolExecution: undefined,
      });

      renderDetails(event);

      const contextRegion = screen.getByTestId('llm-context-scroll');
      expect(within(contextRegion).getByText('First chunk')).toBeInTheDocument();
      const badge = within(contextRegion).getByText('user');
      expect(badge).toHaveClass('capitalize');
      expect(within(contextRegion).queryByText('Metadata')).toBeNull();
    } finally {
      useContextItemsSpy.mockRestore();
    }
  });

  it('renders paginated context window metadata and loads older items on demand', async () => {
    const user = userEvent.setup();
    const useContextItemsSpy = vi.spyOn(contextItemsModule, 'useContextItems').mockReturnValue({
      items: [],
      total: 0,
      loadedCount: 0,
      targetCount: 0,
      hasMore: false,
      isInitialLoading: false,
      isFetching: false,
      error: null,
      loadMore: vi.fn(),
    });

    const newContextItems: ContextItem[] = [
      {
        id: 'ctx-3',
        role: 'user',
        contentText: 'Recent user prompt',
        contentJson: null,
        metadata: null,
        sizeBytes: 120,
        createdAt: '2024-01-01T00:03:00.000Z',
      },
      {
        id: 'ctx-4',
        role: 'assistant',
        contentText: 'Assistant follow-up',
        contentJson: null,
        metadata: null,
        sizeBytes: 160,
        createdAt: '2024-01-01T00:04:00.000Z',
      },
    ];

    const olderItems: ContextItem[] = [
      {
        id: 'ctx-1',
        role: 'system',
        contentText: 'Global system prompt',
        contentJson: null,
        metadata: null,
        sizeBytes: 80,
        createdAt: '2024-01-01T00:00:00.000Z',
      },
      {
        id: 'ctx-2',
        role: 'user',
        contentText: 'Earlier user question',
        contentJson: null,
        metadata: null,
        sizeBytes: 110,
        createdAt: '2024-01-01T00:01:00.000Z',
      },
    ];

    const getManySpy = vi.spyOn(contextItemsApi.contextItems, 'getMany').mockResolvedValue(newContextItems);
    const eventContextSpy = vi
      .spyOn(runsModule.runs, 'eventContext')
      .mockResolvedValue({ items: olderItems, nextBeforeId: null, totalCount: 4 });

    try {
      const event = buildEvent({
        type: 'llm_call',
        metadata: {
          contextWindow: {
            newIds: ['ctx-3', 'ctx-4'],
            totalCount: 4,
            prevCursorId: 'ctx-2',
            pageSize: 2,
          },
        },
        llmCall: {
          provider: 'openai',
          model: 'gpt-window',
          temperature: null,
          topP: null,
          stopReason: null,
          contextItemIds: ['ctx-1', 'ctx-2', 'ctx-3'],
          newContextItemCount: 1,
          responseText: null,
          rawResponse: null,
          toolCalls: [],
        },
        toolExecution: undefined,
      });

      renderDetails(event);

      await waitFor(() => {
        expect(getManySpy).toHaveBeenCalledWith(['ctx-3', 'ctx-4']);
      });

      const contextRegion = await screen.findByTestId('llm-context-scroll');
      expect(within(contextRegion).getByText('Recent user prompt')).toBeInTheDocument();
      expect(within(contextRegion).getByText('Assistant follow-up')).toBeInTheDocument();

      const newBadges = within(contextRegion).getAllByText('New');
      expect(newBadges).toHaveLength(2);

      const loadButton = within(contextRegion).getByRole('button', { name: /Load older context/ });
      expect(loadButton).toHaveTextContent('Load older context (2 of 4)');

      await user.click(loadButton);

      await waitFor(() => {
        expect(eventContextSpy).toHaveBeenCalledWith('run-1', 'evt-1', { beforeId: 'ctx-2', limit: 2 });
      });

      expect(within(contextRegion).getByText('Global system prompt')).toBeInTheDocument();
      expect(within(contextRegion).getByText('Earlier user question')).toBeInTheDocument();
      expect(within(contextRegion).getAllByText('New')).toHaveLength(2);
      expect(within(contextRegion).queryByRole('button', { name: /Load older context/ })).toBeNull();
    } finally {
      useContextItemsSpy.mockRestore();
      getManySpy.mockRestore();
      eventContextSpy.mockRestore();
    }
  });

  it('shows only new context items initially and paginates older history on demand', async () => {
    const user = userEvent.setup();
    const itemsById: Record<string, ContextItem> = {
      'ctx-1': {
        id: 'ctx-1',
        role: 'system',
        contentText: 'System primer',
        contentJson: null,
        metadata: null,
        sizeBytes: 120,
        createdAt: '2024-01-01T00:00:00.000Z',
      },
      'ctx-2': {
        id: 'ctx-2',
        role: 'summary',
        contentText: 'Earlier thread summary',
        contentJson: null,
        metadata: null,
        sizeBytes: 88,
        createdAt: '2024-01-01T00:02:00.000Z',
      },
      'ctx-3': {
        id: 'ctx-3',
        role: 'user',
        contentText: 'New user prompt',
        contentJson: null,
        metadata: null,
        sizeBytes: 96,
        createdAt: '2024-01-01T00:03:00.000Z',
      },
      'ctx-4': {
        id: 'ctx-4',
        role: 'assistant',
        contentText: 'Assistant follow-up',
        contentJson: null,
        metadata: null,
        sizeBytes: 104,
        createdAt: '2024-01-01T00:04:00.000Z',
      },
    };

    const getManySpy = vi.spyOn(contextItemsApi.contextItems, 'getMany').mockImplementation(async (requestedIds: readonly string[]) => {
      const results: ContextItem[] = [];
      for (const id of requestedIds) {
        const item = itemsById[id];
        if (item) results.push(item);
      }
      return results;
    });

    const raf = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    });

    try {
      const event = buildEvent({
        type: 'llm_call',
        toolExecution: undefined,
        llmCall: {
          provider: 'openai',
          model: 'gpt-window',
          temperature: null,
          topP: null,
          stopReason: null,
          contextItemIds: ['ctx-1', 'ctx-2', 'ctx-3', 'ctx-4'],
          newContextItemCount: 2,
          responseText: null,
          rawResponse: null,
          toolCalls: [],
        },
      });

      renderDetails(event);

      await waitFor(() => {
        expect(getManySpy).toHaveBeenCalled();
        const firstCall = getManySpy.mock.calls[0];
        expect(firstCall?.[0]).toEqual(['ctx-3', 'ctx-4']);
      });

      const contextRegion = await screen.findByTestId('llm-context-scroll');
      expect(await within(contextRegion).findByText('New user prompt')).toBeInTheDocument();
      expect(await within(contextRegion).findByText('Assistant follow-up')).toBeInTheDocument();
      expect(within(contextRegion).queryByText('System primer')).toBeNull();
      expect(within(contextRegion).queryByText('Earlier thread summary')).toBeNull();

      expect(within(contextRegion).getAllByText('New')).toHaveLength(2);

      const loadButton = within(contextRegion).getByRole('button', { name: /Load older context/ });
      expect(loadButton).toHaveTextContent('Load older context (2 of 4)');

      await user.click(loadButton);

      await act(async () => {
        waitForStableScrollResolvers.splice(0).forEach((resolve) => resolve());
      });

      await waitFor(() => {
        const call = getManySpy.mock.calls.find(([ids]) => Array.isArray(ids) && ids.includes('ctx-1'));
        expect(call).toBeTruthy();
        const ids = (call![0] as string[]).slice().sort();
        expect(ids).toEqual(['ctx-1', 'ctx-2']);
      });

      await waitFor(() => {
        expect(within(contextRegion).getByText('System primer')).toBeInTheDocument();
        expect(within(contextRegion).getByText('Earlier thread summary')).toBeInTheDocument();
      });

      expect(within(contextRegion).getAllByText('New')).toHaveLength(2);
      await waitFor(() => {
        expect(within(contextRegion).queryByRole('button', { name: /Load older context/ })).toBeNull();
      });
    } finally {
      getManySpy.mockRestore();
      raf.mockRestore();
    }
  });

  it('highlights only the last N conversational context items', () => {
    const contextItems: ContextItem[] = [
      {
        id: 'ctx-1',
        role: 'system',
        contentText: 'System prompt',
        contentJson: null,
        metadata: null,
        sizeBytes: 42,
        createdAt: '2024-01-01T00:00:00.000Z',
      },
      {
        id: 'ctx-2',
        role: 'summary',
        contentText: 'Summary of earlier conversation',
        contentJson: null,
        metadata: null,
        sizeBytes: 30,
        createdAt: '2024-01-01T00:01:00.000Z',
      },
      {
        id: 'ctx-3',
        role: 'memory',
        contentText: 'Memory snippet',
        contentJson: null,
        metadata: null,
        sizeBytes: 28,
        createdAt: '2024-01-01T00:01:30.000Z',
      },
      {
        id: 'ctx-4',
        role: 'user',
        contentText: 'Latest user question',
        contentJson: null,
        metadata: null,
        sizeBytes: 64,
        createdAt: '2024-01-01T00:02:00.000Z',
      },
      {
        id: 'ctx-5',
        role: 'assistant',
        contentText: 'Assistant reply',
        contentJson: null,
        metadata: null,
        sizeBytes: 96,
        createdAt: '2024-01-01T00:03:00.000Z',
      },
      {
        id: 'ctx-6',
        role: 'tool',
        contentText: 'Tool output artifact',
        contentJson: null,
        metadata: null,
        sizeBytes: 80,
        createdAt: '2024-01-01T00:04:00.000Z',
      },
    ];

    const useContextItemsSpy = vi.spyOn(contextItemsModule, 'useContextItems').mockReturnValue({
      items: contextItems,
      total: contextItems.length,
      loadedCount: contextItems.length,
      targetCount: contextItems.length,
      hasMore: false,
      isInitialLoading: false,
      isFetching: false,
      error: null,
      loadMore: vi.fn(),
    });

    try {
      const event = buildEvent({
        type: 'llm_call',
        llmCall: {
          provider: 'openai',
          model: 'gpt-highlight',
          temperature: null,
          topP: null,
          stopReason: null,
          contextItemIds: contextItems.map((item) => item.id),
          newContextItemCount: 3,
          responseText: null,
          rawResponse: null,
          toolCalls: [],
        },
        toolExecution: undefined,
      });

      renderDetails(event);

      const contextRegion = screen.getByTestId('llm-context-scroll');
      const highlightedIds = ['ctx-4', 'ctx-5', 'ctx-6'];
      const nonHighlightedIds = ['ctx-1', 'ctx-2', 'ctx-3'];

      const newBadges = within(contextRegion).getAllByText('New');
      expect(newBadges).toHaveLength(highlightedIds.length);

      highlightedIds.forEach((id) => {
        const wrapper = contextRegion.querySelector(`[data-context-item-id="${id}"]`);
        expect(wrapper?.className).toContain('border-sky-200');
      });

      nonHighlightedIds.forEach((id) => {
        const wrapper = contextRegion.querySelector(`[data-context-item-id="${id}"]`);
        expect(wrapper?.className ?? '').not.toContain('border-sky-200');
        const headerText = wrapper?.querySelector('header')?.textContent ?? '';
        expect(headerText).not.toContain('New');
      });
    } finally {
      useContextItemsSpy.mockRestore();
    }
  });

  it('auto-scrolls context to bottom when items resolve asynchronously', async () => {
    const contextItems: ContextItem[] = [
      {
        id: 'ctx-1',
        role: 'system',
        contentText: 'System prompt',
        contentJson: null,
        metadata: null,
        sizeBytes: 256,
        createdAt: '2024-01-01T00:00:00.000Z',
      },
      {
        id: 'ctx-2',
        role: 'assistant',
        contentText: 'Assistant reply',
        contentJson: null,
        metadata: null,
        sizeBytes: 384,
        createdAt: '2024-01-01T00:01:00.000Z',
      },
    ];

    let state = {
      items: [] as ContextItem[],
      total: contextItems.length,
      loadedCount: 0,
      targetCount: contextItems.length,
      hasMore: false,
      isInitialLoading: true,
      isFetching: true,
      error: null as unknown,
      loadMore: vi.fn(),
    };

    const useContextItemsSpy = vi.spyOn(contextItemsModule, 'useContextItems').mockImplementation(() => state);

    try {
      const event = buildEvent({
        type: 'llm_call',
        llmCall: {
          provider: 'openai',
          model: 'gpt-test',
          temperature: null,
          topP: null,
          stopReason: null,
          contextItemIds: contextItems.map((item) => item.id),
          responseText: null,
          rawResponse: null,
          toolCalls: [],
        },
        toolExecution: undefined,
      });

      const { rerender } = renderDetails(event);
      const scrollContainer = screen.getByTestId('llm-context-scroll');
      makeScrollable(scrollContainer, { scrollHeight: 400, clientHeight: 200, scrollTop: 0 });

      const raf = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
        cb(0);
        return 1;
      });

      expect(scrollContainer.scrollTop).toBe(0);

      state = {
        ...state,
        items: contextItems,
        loadedCount: contextItems.length,
        isInitialLoading: false,
        isFetching: false,
      };

      await act(async () => {
        rerender(buildEvent({
          ...event,
          llmCall: {
            ...event.llmCall!,
            contextItemIds: contextItems.map((item) => item.id),
          },
        }));
      });

      expect(scrollContainer.scrollTop).toBe(scrollContainer.scrollHeight);

      raf.mockRestore();
    } finally {
      useContextItemsSpy.mockRestore();
    }
  });

  it('preserves context scroll position when loading older items', async () => {
    const user = userEvent.setup();
    const raf = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    });
    const older: ContextItem = {
      id: 'ctx-older',
      role: 'system',
      contentText: 'System',
      contentJson: null,
      createdAt: '2024-01-01T00:00:00.000Z',
      sizeBytes: 12,
      metadata: {},
    };
    const mid: ContextItem = {
      id: 'ctx-mid',
      role: 'user',
      contentText: 'User',
      contentJson: null,
      createdAt: '2024-01-01T00:01:00.000Z',
      sizeBytes: 18,
      metadata: {},
    };
    const latest: ContextItem = {
      id: 'ctx-new',
      role: 'assistant',
      contentText: 'Assistant',
      contentJson: null,
      createdAt: '2024-01-01T00:02:00.000Z',
      sizeBytes: 24,
      metadata: {},
    };

    const useContextItemsSpy = vi.spyOn(contextItemsModule, 'useContextItems').mockImplementation((): UseContextItemsResult => {
      const [stage, setStage] = React.useState<'initial' | 'loaded'>('initial');
      const items = stage === 'initial' ? [mid, latest] : [older, mid, latest];
      const hasMore = stage === 'initial';
      const loadMore = () => setStage('loaded');

      return {
        items,
        total: 3,
        loadedCount: items.length,
        targetCount: stage === 'initial' ? 2 : 3,
        hasMore,
        isInitialLoading: false,
        isFetching: false,
        error: null,
        loadMore,
      };
    });

    const event = buildEvent({
      type: 'llm_call',
      toolExecution: undefined,
      llmCall: {
        provider: 'openai',
        model: 'gpt-test',
        temperature: null,
        topP: null,
        stopReason: null,
        contextItemIds: [older.id, mid.id, latest.id],
        responseText: null,
        rawResponse: null,
        toolCalls: [],
      },
    });

    renderDetails(event);

    const scroll = await screen.findByTestId('llm-context-scroll');

    let scrollHeightValue = 1000;
    let scrollTopValue = 1000;
    const clientHeightValue = 200;

    Object.defineProperty(scroll, 'scrollHeight', {
      configurable: true,
      get: () => scrollHeightValue,
    });
    Object.defineProperty(scroll, 'clientHeight', {
      configurable: true,
      get: () => clientHeightValue,
    });
    Object.defineProperty(scroll, 'scrollTop', {
      configurable: true,
      get: () => scrollTopValue,
      set: (value) => {
        scrollTopValue = value;
      },
    });

    const scrollToMock = vi.fn((options: ScrollToOptions | number, maybeY?: number) => {
      if (typeof options === 'number') {
        scrollTopValue = options;
        return;
      }
      if (typeof maybeY === 'number') {
        scrollTopValue = maybeY;
        return;
      }
      if (typeof options === 'object' && options && typeof options.top === 'number') {
        scrollTopValue = options.top;
      }
    });
    Object.defineProperty(scroll, 'scrollTo', {
      configurable: true,
      value: scrollToMock,
      writable: true,
    });

    await act(async () => {
      await Promise.resolve();
    });

    scrollToMock.mockClear();
    scrollTopValue = 800;

    const loadButton = screen.getByRole('button', { name: /Load older context/i });
    await act(async () => {
      await user.click(loadButton);
    });

    scrollHeightValue = 1200;

    expect(waitForStableScrollResolvers.length).toBeGreaterThan(0);

    await act(async () => {
      waitForStableScrollResolvers.splice(0).forEach((resolve) => resolve());
    });

    await waitFor(() => {
      expect(scrollTopValue).toBe(1000);
    });
    expect(waitForStableScrollHeightMock).toHaveBeenCalled();

    useContextItemsSpy.mockRestore();
    raf.mockRestore();
  });

  it('renders call_agent metadata in link group before run start', () => {
    const event = buildEvent({
      metadata: {
        childThreadId: 'child-123',
        childRun: {
          id: null,
          status: 'queued',
          linkEnabled: false,
          latestMessageId: null,
        },
        childRunStatus: 'queued',
        childRunLinkEnabled: false,
        childRunId: null,
      },
      toolExecution: {
        toolName: 'call_agent',
        execStatus: 'running',
      },
    });

    renderDetails(event);

    const group = screen.getByTestId('call-agent-link-group');
    const subthreadLink = within(group).getByRole('link', { name: 'Subthread' });
    expect(subthreadLink).toHaveAttribute('href', '/agents/threads/child-123');
    expect(within(group).queryByRole('link', { name: /Run timeline/i })).toBeNull();
    expect(within(group).getByText('Run (not started)')).toBeInTheDocument();
    const statusBadge = within(group).getByText('Queued');
    expect(statusBadge).toHaveClass('bg-amber-500');
  });

  it('enables call_agent run link and updates status on metadata change', () => {
    const baseEvent = buildEvent({
      metadata: {
        childThreadId: 'child-123',
        childRun: {
          id: null,
          status: 'queued',
          linkEnabled: false,
          latestMessageId: null,
        },
        childRunStatus: 'queued',
        childRunLinkEnabled: false,
        childRunId: null,
      },
      toolExecution: {
        toolName: 'call_agent',
        execStatus: 'running',
      },
    });

    const { rerender } = renderDetails(baseEvent);

    const updatedEvent = buildEvent({
      metadata: {
        childThreadId: 'child-123',
        childRun: {
          id: 'run-xyz',
          status: 'running',
          linkEnabled: true,
          latestMessageId: 'msg-1',
        },
        childRunStatus: 'running',
        childRunLinkEnabled: true,
        childRunId: 'run-xyz',
        childMessageId: 'msg-1',
      },
      toolExecution: {
        toolName: 'call_agent',
        execStatus: 'running',
      },
    });

    rerender(updatedEvent);

    const group = screen.getByTestId('call-agent-link-group');
    const runLink = within(group).getByRole('link', { name: 'Run timeline' });
    expect(runLink).toHaveAttribute('href', '/agents/threads/child-123/runs/run-xyz/timeline');
    const statusBadge = within(group).getByText('Running');
    expect(statusBadge).toHaveClass('bg-sky-500');
  });
});
