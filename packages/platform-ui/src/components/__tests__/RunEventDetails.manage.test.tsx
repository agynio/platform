import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect } from 'vitest';
import { RunEventDetails, type RunEvent } from '../RunEventDetails';

describe('RunEventDetails – manage tool view', () => {
  it('renders thread and run links from child identifiers', () => {
    const event: RunEvent = {
      id: 'evt-manage-1',
      type: 'tool',
      timestamp: '2024-01-01T00:00:00.000Z',
      duration: '1s',
      status: 'finished',
      data: {
        toolSubtype: 'manage',
        toolName: 'manage_agent',
        input: JSON.stringify({ command: 'delegate_task', worker: 'Worker Alpha' }),
        output: JSON.stringify({ result: 'ok' }),
        childThreadId: 'thread-123',
        childRunId: 'run-456',
      },
    };

    render(
      <MemoryRouter>
        <RunEventDetails event={event} />
      </MemoryRouter>,
    );

    const threadLink = screen.getByRole('link', { name: /View thread/i });
    expect(threadLink).toHaveAttribute('href', '/agents/threads/thread-123');

    const runLink = screen.getByRole('link', { name: /View run/i });
    expect(runLink).toHaveAttribute('href', '/agents/threads/thread-123/runs/run-456/timeline');
  });
});
