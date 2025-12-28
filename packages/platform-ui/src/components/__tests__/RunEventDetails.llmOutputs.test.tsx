import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { RunEventDetails, type RunEvent } from '../RunEventDetails';

describe('RunEventDetails – LLM outputs', () => {
  it('renders assistant context entries separately from prompt inputs', async () => {
    const event: RunEvent = {
      id: 'evt-llm-outputs',
      type: 'llm',
      timestamp: '2024-01-01T00:00:00.000Z',
      data: {
        context: [
          {
            id: 'ctx-input',
            role: 'user',
            content: 'Only show me in the prompt context',
          },
        ],
        assistantContext: [
          {
            id: 'ctx-output',
            role: 'assistant',
            content: 'Persisted assistant output',
            reasoning: {
              score: 0.42,
              metrics: {
                tokens: 88,
              },
            },
          },
        ],
        response: 'Latest assistant response',
        model: 'gpt-4o',
      },
    };

    render(
      <MemoryRouter>
        <RunEventDetails event={event} />
      </MemoryRouter>,
    );

    expect(screen.getByText('Assistant responses for this call')).toBeInTheDocument();
    const assistantPanel = screen.getByTestId('assistant-context-panel');
    expect(within(assistantPanel).getByText('Persisted assistant output')).toBeInTheDocument();
    expect(within(assistantPanel).getByText('Reasoning tokens: 88')).toBeInTheDocument();
    expect(screen.getByText('No new context for this call.')).toBeInTheDocument();

    const loadMoreButton = screen.getByRole('button', { name: 'Load more' });
    fireEvent.click(loadMoreButton);

    await waitFor(() => {
      expect(screen.getByText('Only show me in the prompt context')).toBeInTheDocument();
    });
  });

  it('surfaces reasoning tokens embedded in assistant context usage snapshots', () => {
    const event: RunEvent = {
      id: 'evt-llm-context-usage',
      type: 'llm',
      timestamp: '2024-01-01T00:00:30.000Z',
      data: {
        context: [],
        assistantContext: [
          {
            id: 'ctx-assistant-usage',
            role: 'assistant',
            content: 'Assistant reasoning-rich context',
            contentJson: {
              output: [
                {
                  type: 'reasoning',
                  summary: [{ type: 'text', text: 'thinking...' }],
                  reasoning: [],
                },
                {
                  type: 'message',
                  role: 'assistant',
                  content: [
                    {
                      type: 'output_text',
                      text: 'Assistant reasoning-rich context',
                      annotations: [],
                    },
                  ],
                },
              ],
              usage: {
                input_tokens: 144,
                output_tokens: 120,
                total_tokens: 264,
                output_tokens_details: {
                  reasoning_tokens: 42,
                },
              },
            },
          },
        ],
        response: 'Latest assistant response',
        model: 'gpt-4o',
      },
    };

    render(
      <MemoryRouter>
        <RunEventDetails event={event} />
      </MemoryRouter>,
    );

    const panel = screen.getByTestId('assistant-context-panel');
    expect(within(panel).getByText('Assistant reasoning-rich context')).toBeInTheDocument();
    expect(within(panel).getByText('Reasoning tokens: 42')).toBeInTheDocument();

    const reasoningRow = within(panel).getByTestId('assistant-context-reasoning');
    expect(reasoningRow).toBeInTheDocument();
  });

  it('renders reasoning tokens row before assistant context tool calls', () => {
    const event: RunEvent = {
      id: 'evt-llm-context-ordering',
      type: 'llm',
      timestamp: '2024-01-01T00:00:40.000Z',
      data: {
        context: [],
        assistantContext: [
          {
            id: 'ctx-assistant-order',
            role: 'assistant',
            content: 'Assistant output with tools',
            reasoning: { tokens: 64 },
            tool_calls: [
              {
                name: 'summarize',
                arguments: { topic: 'ordering' },
              },
            ],
          },
        ],
        response: 'Latest assistant response',
        model: 'gpt-4o',
      },
    };

    render(
      <MemoryRouter>
        <RunEventDetails event={event} />
      </MemoryRouter>,
    );

    const panel = screen.getByTestId('assistant-context-panel');
    const reasoningRow = within(panel).getByTestId('assistant-context-reasoning');
    expect(reasoningRow).toHaveTextContent('Reasoning tokens: 64');

    expect(reasoningRow).toHaveClass('pl-5');

    const toolCallButton = within(panel).getByRole('button', { name: /summarize/i });
    const relation = reasoningRow.compareDocumentPosition(toolCallButton);
    expect(relation & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('omits reasoning tokens row when only generic usage totals exist', () => {
    const event: RunEvent = {
      id: 'evt-llm-context-no-reasoning',
      type: 'llm',
      timestamp: '2024-01-01T00:01:10.000Z',
      data: {
        context: [],
        assistantContext: [
          {
            id: 'ctx-assistant-no-reasoning',
            role: 'assistant',
            content: 'Assistant output without reasoning',
            usage: {
              output_tokens: 120,
              total_tokens: 200,
            },
          },
        ],
        response: 'Latest assistant response',
        model: 'gpt-4o',
      },
    };

    render(
      <MemoryRouter>
        <RunEventDetails event={event} />
      </MemoryRouter>,
    );

    const panel = screen.getByTestId('assistant-context-panel');
    expect(within(panel).queryByTestId('assistant-context-reasoning')).not.toBeInTheDocument();
    expect(within(panel).queryByText(/Reasoning tokens:/)).not.toBeInTheDocument();
  });

  it('omits reasoning tokens row when reasoning tokens are zero', () => {
    const event: RunEvent = {
      id: 'evt-llm-context-zero-reasoning',
      type: 'llm',
      timestamp: '2024-01-01T00:01:20.000Z',
      data: {
        context: [],
        assistantContext: [
          {
            id: 'ctx-assistant-zero-reasoning',
            role: 'assistant',
            content: 'Assistant output zero reasoning',
            reasoning: { tokens: 0 },
          },
        ],
        response: 'Latest assistant response',
        model: 'gpt-4o',
      },
    };

    render(
      <MemoryRouter>
        <RunEventDetails event={event} />
      </MemoryRouter>,
    );

    const panel = screen.getByTestId('assistant-context-panel');
    expect(within(panel).queryByTestId('assistant-context-reasoning')).not.toBeInTheDocument();
    expect(within(panel).queryByText(/Reasoning tokens:/)).not.toBeInTheDocument();
  });

  it('shows invoked tool calls for llm events using the shared function-call UI', () => {
    const event: RunEvent = {
      id: 'evt-llm-tools',
      type: 'llm',
      timestamp: '2024-01-01T00:01:00.000Z',
      data: {
        response: 'Done.',
        model: 'gpt-4o-mini',
        toolCalls: [
          {
            callId: 'tool-1',
            name: 'shell_command',
            arguments: { command: 'echo 1' },
          },
        ],
      },
    };

    render(
      <MemoryRouter>
        <RunEventDetails event={event} />
      </MemoryRouter>,
    );

    expect(screen.getByText('Invoked tools')).toBeInTheDocument();
    const toggleButton = screen.getByRole('button', { name: /shell_command/i });
    expect(toggleButton).toBeInTheDocument();
    fireEvent.click(toggleButton);
    expect(screen.getByText(/command:/i)).toBeInTheDocument();
    expect(screen.getByText(/"echo 1"/)).toBeInTheDocument();
  });

  it('renders a reasoning block above the output when reasoning tokens are nested under metrics', () => {
    const event: RunEvent = {
      id: 'evt-llm-reasoning',
      type: 'llm',
      timestamp: '2024-01-01T00:02:00.000Z',
      data: {
        response: 'Here is my answer.',
        tokens: {
          total: 1200,
          reasoning: {
            score: 0.41,
            metrics: {
              tokens: 250,
            },
          },
        },
      },
    };

    render(
      <MemoryRouter>
        <RunEventDetails event={event} />
      </MemoryRouter>,
    );

    const reasoningLabel = screen.getByText('Reasoning');
    const outputLabel = screen.getByText('Output');
    expect(reasoningLabel).toBeInTheDocument();
    expect(reasoningLabel.tagName).toBe('SPAN');
    expect(reasoningLabel.compareDocumentPosition(outputLabel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText('250 tokens')).toBeInTheDocument();
  });

  it('aggregates reasoning metrics across array payloads', () => {
    const event: RunEvent = {
      id: 'evt-llm-reasoning-array',
      type: 'llm',
      timestamp: '2024-01-01T00:03:00.000Z',
      data: {
        response: 'Array-backed reasoning payload.',
        tokens: {
          total: 1600,
          reasoning: [
            { score: 0.2 },
            { tokens: 310 },
          ],
        },
      },
    };

    render(
      <MemoryRouter>
        <RunEventDetails event={event} />
      </MemoryRouter>,
    );

    expect(screen.getByText('310 tokens')).toBeInTheDocument();
  });
});
