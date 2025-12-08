import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RunEventDetails, type RunEvent } from '../RunEventDetails';

const buildLlmEvent = (overrides: Partial<RunEvent> = {}): RunEvent => ({
  id: 'event-llm',
  type: 'llm',
  timestamp: '2024-01-01T00:05:00.000Z',
  duration: '1s',
  status: 'finished',
  data: {
    context: [
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
    ],
    model: 'gpt-window',
    response: 'Assistant follow-up',
    tokens: { total: 42 },
  },
  ...overrides,
});

describe('RunEventDetails context display', () => {
  it('renders all provided context messages', () => {
    const event = buildLlmEvent();

    render(<RunEventDetails event={event} />);

    const loadButton = screen.getByRole('button', { name: 'Load older context' });
    expect(loadButton).toBeInTheDocument();

    const contextContainer = loadButton.parentElement as HTMLElement;
    expect(contextContainer).toBeTruthy();

    expect(within(contextContainer).getByText('System primer')).toBeInTheDocument();
    expect(within(contextContainer).getByText('Earlier summary')).toBeInTheDocument();
    expect(within(contextContainer).getByText('New user prompt')).toBeInTheDocument();
    expect(within(contextContainer).getByText('Assistant follow-up')).toBeInTheDocument();
  });

  it('renders assistant tool call toggle when metadata is present', () => {
    const event = buildLlmEvent({
      data: {
        ...buildLlmEvent().data,
        context: [
          {
            id: 'ctx-tool',
            role: 'assistant',
            content: 'Responding with a tool call',
            timestamp: '2024-01-01T00:10:00.000Z',
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
        ],
      },
    });

    render(<RunEventDetails event={event} />);

    const loadButton = screen.getByRole('button', { name: 'Load older context' });
    const contextContainer = loadButton.parentElement as HTMLElement;

    expect(within(contextContainer).getByText('Responding with a tool call')).toBeInTheDocument();

    const toggleButton = screen.getByRole('button', { name: 'lookup_weather' });
    fireEvent.click(toggleButton);

    expect(screen.getByText((content) => content.includes('"city":"Paris"'))).toBeInTheDocument();
  });
});
