import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
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
});
