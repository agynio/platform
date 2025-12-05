import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, afterEach } from 'vitest';
import type { Mock } from 'vitest';
import type { RunEvent } from '../RunEventDetails';
import { RunEventDetails } from '../RunEventDetails';
import { runs } from '@/api/modules/runs';

vi.mock('@/api/modules/runs', () => ({
  runs: {
    eventContext: vi.fn(),
  },
}));

vi.mock('@/hooks/useToolOutputStreaming', () => ({
  useToolOutputStreaming: () => ({
    text: null,
    stdoutText: null,
    stderrText: null,
    chunks: [],
    terminal: null,
    hydrated: true,
    loading: false,
    error: null,
  }),
}));

const mockEventContext = runs.eventContext as unknown as Mock;

const buildLlmEvent = (): RunEvent => ({
  id: 'evt-1',
  type: 'llm',
  timestamp: '2024-01-01T00:05:00.000Z',
  duration: '2s',
  status: 'finished',
  data: {
    model: 'gpt-window',
    response: 'Assistant reply text',
    tokens: { total: 256 },
    cost: '$0.01',
  },
});

const createContextItem = (id: string, role: 'system' | 'user' | 'assistant', content: string, createdAt: string) => ({
  id,
  role,
  contentText: content,
  contentJson: null,
  metadata: null,
  sizeBytes: 128,
  createdAt,
});

describe('RunEventDetails - context pagination', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('loads initial context via runs.eventContext and retrieves older items on demand', async () => {
    const initialItems = [
      createContextItem('ctx-2', 'user', 'Current user prompt', '2024-01-01T00:03:00.000Z'),
      createContextItem('ctx-3', 'assistant', 'Assistant follow-up', '2024-01-01T00:04:00.000Z'),
    ];
    const olderItems = [
      createContextItem('ctx-0', 'system', 'System directive', '2024-01-01T00:00:00.000Z'),
      createContextItem('ctx-1', 'user', 'Earlier user message', '2024-01-01T00:01:00.000Z'),
    ];

    mockEventContext.mockResolvedValueOnce({ items: initialItems, nextBeforeId: 'ctx-1', totalCount: 4 });
    mockEventContext.mockResolvedValueOnce({ items: olderItems, nextBeforeId: null, totalCount: 4 });

    const user = userEvent.setup();

    render(<RunEventDetails event={buildLlmEvent()} runId="run-123" />);

    await waitFor(() => {
      expect(mockEventContext).toHaveBeenCalledTimes(1);
    });

    expect(mockEventContext).toHaveBeenCalledWith('run-123', 'evt-1');

    expect(await screen.findByText('Current user prompt')).toBeInTheDocument();
    expect(screen.getByText('Assistant follow-up')).toBeInTheDocument();

    const badges = screen.getAllByText('New');
    expect(badges).toHaveLength(2);

    const loadButton = screen.getByRole('button', { name: /Load older context/ });
    expect(loadButton).toHaveTextContent('Load older context (2 of 4)');

    await user.click(loadButton);

    await waitFor(() => {
      expect(mockEventContext).toHaveBeenCalledTimes(2);
    });

    expect(mockEventContext).toHaveBeenLastCalledWith('run-123', 'evt-1', { beforeId: 'ctx-2' });

    expect(await screen.findByText('System directive')).toBeInTheDocument();
    expect(screen.getByText('Earlier user message')).toBeInTheDocument();

    expect(screen.getAllByText('New')).toHaveLength(2);

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /Load older context/ })).not.toBeInTheDocument();
    });
  });

  it('allows loading older history when no new context items are returned', async () => {
    const olderItems = [
      createContextItem('ctx-0', 'system', 'Historical system prompt', '2024-01-01T00:00:00.000Z'),
      createContextItem('ctx-1', 'user', 'Early user input', '2024-01-01T00:01:00.000Z'),
    ];

    mockEventContext.mockResolvedValueOnce({ items: [], nextBeforeId: 'ctx-1', totalCount: 2 });
    mockEventContext.mockResolvedValueOnce({ items: olderItems, nextBeforeId: null, totalCount: 2 });

    const user = userEvent.setup();

    render(<RunEventDetails event={buildLlmEvent()} runId="run-456" />);

    await waitFor(() => {
      expect(mockEventContext).toHaveBeenCalledTimes(1);
    });

    expect(screen.getByText('No context messages')).toBeInTheDocument();

    const loadButton = await screen.findByRole('button', { name: /Load older context/ });
    expect(loadButton).toHaveTextContent('Load older context (0 of 2)');

    await user.click(loadButton);

    await waitFor(() => {
      expect(mockEventContext).toHaveBeenCalledTimes(2);
      expect(mockEventContext).toHaveBeenLastCalledWith('run-456', 'evt-1', { beforeId: 'ctx-1' });
    });

    expect(await screen.findByText('Historical system prompt')).toBeInTheDocument();
    expect(screen.getByText('Early user input')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /Load older context/ })).not.toBeInTheDocument();
    });
  });
});
