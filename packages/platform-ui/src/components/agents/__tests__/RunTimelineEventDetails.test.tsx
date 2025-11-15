import React from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RunTimelineEventDetails } from '../RunTimelineEventDetails';
import type { RunTimelineEvent } from '@/api/types/agents';

function renderDetails(event: RunTimelineEvent) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Number.POSITIVE_INFINITY, staleTime: Number.POSITIVE_INFINITY },
    },
  });

  const result = render(
    <QueryClientProvider client={client}>
      <RunTimelineEventDetails event={event} />
    </QueryClientProvider>,
  );

  return {
    ...result,
    rerender(nextEvent: RunTimelineEvent) {
      result.rerender(
        <QueryClientProvider client={client}>
          <RunTimelineEventDetails event={nextEvent} />
        </QueryClientProvider>,
      );
    },
  };
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

  return {
    ...base,
    ...rest,
    llmCall: llmCall ?? base.llmCall,
    toolExecution: finalToolExecution ? { ...base.toolExecution!, ...finalToolExecution } : finalToolExecution,
    message: message ?? base.message,
    attachments: attachments ?? base.attachments,
  };
}

beforeEach(() => {
  try {
    window.sessionStorage.clear();
  } catch (_err) {
    // Ignored – storage may be unavailable in some environments
  }
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
});
