import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { RunEventDetails, type RunEvent } from '../RunEventDetails';

describe('RunEventDetails – LLM outputs', () => {
  it('renders assistant context entries separately from prompt inputs', () => {
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
    expect(screen.getByText('Only show me in the prompt context')).toBeInTheDocument();
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
});
