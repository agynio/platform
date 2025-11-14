import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RunTimelineEventCard } from '../RunTimelineEventCard';
import type { RunTimelineEvent } from '@/api/types/agents';

const baseEvent: RunTimelineEvent = {
  id: 'event-1',
  runId: 'run-1',
  threadId: 'thread-1',
  type: 'tool_execution',
  status: 'success',
  ts: '2024-01-01T00:00:00.000Z',
  startedAt: '2024-01-01T00:00:00.000Z',
  endedAt: '2024-01-01T00:00:01.500Z',
  durationMs: 1500,
  nodeId: 'node-1',
  sourceKind: 'internal',
  sourceSpanId: 'span-1',
  metadata: { foo: 'bar' },
  errorCode: null,
  errorMessage: null,
  llmCall: undefined,
  toolExecution: {
    toolName: 'Search Tool',
    toolCallId: 'call-123',
    execStatus: 'success',
    input: { query: 'hello' },
    output: { result: 'world' },
    errorMessage: null,
    raw: null,
  },
  summarization: undefined,
  injection: undefined,
  message: undefined,
  attachments: [],
};

describe('RunTimelineEventCard', () => {
  it('renders duration in header and tool name in type label', () => {
    render(<RunTimelineEventCard event={baseEvent} />);
    const header = screen.getByText((text) => text.includes('1.50 s'));
    expect(header).toBeInTheDocument();
    expect(screen.getByText('Tool Execution — Search Tool')).toBeInTheDocument();
  });

  it('omits node/source and error badges from summary row', () => {
    const eventWithErrors: RunTimelineEvent = {
      ...baseEvent,
      errorCode: 'E_FAIL',
      errorMessage: 'Boom',
    };
    render(<RunTimelineEventCard event={eventWithErrors} />);
    expect(screen.queryByText(/Node:/)).toBeNull();
    expect(screen.queryByText(/Source:/)).toBeNull();
    expect(screen.queryByText(/Error code:/)).toBeNull();
    expect(screen.queryByText(/Error:/)).toBeNull();
  });
});
