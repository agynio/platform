import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { RunEventDetails, type RunEvent } from '../RunEventDetails';

describe('RunEventDetails – context badges', () => {
  it('renders new badges for highlighted context indices', () => {
    const event: RunEvent = {
      id: 'event-llm-1',
      type: 'llm',
      timestamp: '2024-01-01T00:00:00.000Z',
      data: {
        context: [
          {
            role: 'user',
            content: 'Prompt text',
            timestamp: '2024-01-01T00:00:00.000Z',
          },
          {
            role: 'assistant',
            content: 'Answer text',
            timestamp: '2024-01-01T00:00:01.000Z',
          },
        ],
        response: 'Answer text',
        model: 'gpt-4o-mini',
        newContextIndices: [1],
      },
    };

    render(<RunEventDetails event={event} />);

    const badges = screen.getAllByLabelText('Tail context added this step');
    expect(badges).toHaveLength(1);
    expect(badges[0]).toHaveTextContent('New');

    const assistantHeader = screen.getByText('assistant', { exact: false }).closest('div');
    expect(assistantHeader).not.toBeNull();
    if (assistantHeader) {
      expect(within(assistantHeader).getByLabelText('Tail context added this step')).toBeInTheDocument();
    }

    const userHeader = screen.getByText('user', { exact: false }).closest('div');
    expect(userHeader).not.toBeNull();
    if (userHeader) {
      expect(within(userHeader).queryByLabelText('Tail context added this step')).toBeNull();
    }
  });
});
