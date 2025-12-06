import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RunEventDetails, type RunEvent } from '../RunEventDetails';

const buildLlmEvent = (overrides: Partial<RunEvent> = {}): RunEvent => {
  const context = [
    {
      id: 'ctx-1',
      role: 'system',
      content: 'System primer',
      timestamp: '2024-01-01T00:00:00.000Z',
    },
    {
      id: 'ctx-2',
      role: 'user',
      content: 'Earlier summary',
      timestamp: '2024-01-01T00:01:00.000Z',
    },
    {
      id: 'ctx-3',
      role: 'user',
      content: 'New user prompt',
      timestamp: '2024-01-01T00:02:00.000Z',
    },
    {
      id: 'ctx-4',
      role: 'assistant',
      content: 'Assistant follow-up',
      timestamp: '2024-01-01T00:03:00.000Z',
    },
  ];

  return {
    id: 'event-llm',
    type: 'llm',
    timestamp: '2024-01-01T00:05:00.000Z',
    duration: '1s',
    status: 'finished',
    data: {
      context,
      contextWindow: { totalCount: context.length, newCount: 2 },
      model: 'gpt-window',
      response: 'Assistant follow-up',
      tokens: { total: 42 },
    },
    ...overrides,
  } satisfies RunEvent;
};

describe('RunEventDetails context window behaviour', () => {
  it('initially shows only new context items and reveals older ones on demand', () => {
    const event = buildLlmEvent();

    render(<RunEventDetails event={event} />);

    const loadButton = screen.getByRole('button', { name: 'Load older context' });
    const contextContainer = loadButton.parentElement as HTMLElement;

    expect(within(contextContainer).getByText('New user prompt')).toBeInTheDocument();
    expect(within(contextContainer).getByText('Assistant follow-up')).toBeInTheDocument();
    expect(within(contextContainer).queryByText('System primer')).not.toBeInTheDocument();
    expect(within(contextContainer).queryByText('Earlier summary')).not.toBeInTheDocument();

    fireEvent.click(loadButton);

    expect(within(contextContainer).getByText('System primer')).toBeInTheDocument();
    expect(within(contextContainer).getByText('Earlier summary')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Load older context' })).not.toBeInTheDocument();
  });
});
