import React from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RunTimelineEventDetails } from '../RunTimelineEventDetails';
import type { RunTimelineEvent } from '@/api/types/agents';

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
    render(<RunTimelineEventDetails event={buildEvent()} />);

    const select = screen.getByLabelText('View as');
    expect(select).toHaveValue('json');

    await user.selectOptions(select, 'text');
    expect(select).toHaveValue('text');
    expect(screen.getByText(/"result": "ok"/)).toBeInTheDocument();
  });

  it('detects terminal output via ansi escape sequences', () => {
    const ansiOutput = '\u001b[31mFailure\u001b[0m';
    render(
      <RunTimelineEventDetails
        event={buildEvent({ toolExecution: { output: ansiOutput, raw: null } })}
      />,
    );

    expect(screen.getByLabelText('View as')).toHaveValue('terminal');
  });

  it('persists selected visualization per event id', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<RunTimelineEventDetails event={buildEvent({ id: 'evt-a' })} />);
    const select = screen.getByLabelText('View as');

    await user.selectOptions(select, 'markdown');
    expect(select).toHaveValue('markdown');

    rerender(<RunTimelineEventDetails event={buildEvent({ id: 'evt-a' })} />);
    expect(screen.getByLabelText('View as')).toHaveValue('markdown');

    rerender(<RunTimelineEventDetails event={buildEvent({ id: 'evt-b' })} />);
    expect(screen.getByLabelText('View as')).toHaveValue('json');
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
        contextItemIds: ['ctx-1'],
        responseText: null,
        rawResponse: { foo: 'bar' },
        toolCalls: [],
      },
      toolExecution: undefined,
    });

    render(<RunTimelineEventDetails event={llmOnlyRaw} />);
    expect(screen.queryByText('Response')).toBeNull();
    expect(screen.queryByText(/Tool calls/)).toBeNull();
    expect(screen.getByText('Raw response')).toBeInTheDocument();
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

    render(<RunTimelineEventDetails event={event} />);
    const responseLabel = screen.getByText('Response');
    const responseContainer = responseLabel.parentElement;
    expect(responseContainer).toBeTruthy();
    if (responseContainer) {
      expect(within(responseContainer).getByText('All good')).toBeInTheDocument();
    }

    const toolCallsLabel = screen.getByText(/Tool calls/);
    expect(toolCallsLabel).toBeInTheDocument();
    expect(screen.getByText(/search/)).toBeInTheDocument();
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

    render(<RunTimelineEventDetails event={event} />);
    expect(screen.queryByText(/"foo": "secret"/)).toBeNull();
  });

  it('does not crash when sessionStorage access is blocked', () => {
    const originalDescriptor = Object.getOwnPropertyDescriptor(window, 'sessionStorage');
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      get() {
        throw new Error('blocked');
      },
    });

    expect(() => render(<RunTimelineEventDetails event={buildEvent()} />)).not.toThrow();

    if (originalDescriptor) {
      Object.defineProperty(window, 'sessionStorage', originalDescriptor);
    } else {
      delete (window as { sessionStorage?: Storage }).sessionStorage;
    }
  });
});
