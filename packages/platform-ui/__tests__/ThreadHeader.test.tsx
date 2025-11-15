import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThreadHeader } from '../src/components/agents/ThreadHeader';
import type { ThreadNode, ThreadReminder, ThreadMetrics } from '../src/api/types/agents';

const mockMetrics: ThreadMetrics = { remindersCount: 3, activity: 'waiting', runsCount: 2 };
const mockReminders: ThreadReminder[] = [
  { id: 'r1', threadId: 't1', note: 'Follow up soon', at: '2025-11-14T12:00:00.000Z', createdAt: '2025-11-13T12:00:00.000Z', completedAt: null },
];

const useThreadMetrics = vi.fn(() => ({ data: mockMetrics, isLoading: false, error: null }));
const useThreadReminders = vi.fn(() => ({ data: { items: mockReminders }, isLoading: false, error: null }));

vi.mock('@/api/hooks/threads', () => ({
  useThreadMetrics: (...args: unknown[]) => useThreadMetrics(...args),
  useThreadReminders: (...args: unknown[]) => useThreadReminders(...args),
}));

describe('ThreadHeader', () => {
  beforeEach(() => {
    useThreadMetrics.mockClear();
    useThreadReminders.mockClear();
  });

  it('renders selected thread details with metrics and run counts', () => {
    const thread: ThreadNode = {
      id: 't1',
      alias: 'root',
      summary: 'Investigate alerts',
      status: 'open',
      parentId: null,
      createdAt: '2025-11-14T10:00:00.000Z',
      metrics: { remindersCount: 1, activity: 'idle', runsCount: 1 },
      agentTitle: 'Incident Agent',
    };

    render(<ThreadHeader thread={thread} runsCount={5} />);

    expect(screen.getByTestId('thread-header-summary')).toHaveTextContent('Investigate alerts');
    expect(screen.getByText('Incident Agent')).toBeInTheDocument();
    expect(screen.getByText(/Status: Open/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Active reminders: 3/ })).toBeInTheDocument();
    // Run count prefers live runs length (5) over metrics (2)
    expect(screen.getByLabelText('Runs total: 5')).toHaveTextContent('Runs 5');
    // Activity reflects socket-driven metrics mock
    expect(screen.getByLabelText('Activity: waiting')).toBeInTheDocument();
  });

  it('shows reminders in popover when opened', async () => {
    const user = userEvent.setup();
    const thread: ThreadNode = {
      id: 't1',
      alias: 'root',
      summary: 'Investigate alerts',
      status: 'open',
      parentId: null,
      createdAt: '2025-11-14T10:00:00.000Z',
      metrics: mockMetrics,
      agentTitle: 'Incident Agent',
    };

    render(<ThreadHeader thread={thread} runsCount={0} />);

    const trigger = screen.getByTestId('thread-reminders-trigger');
    await user.click(trigger);

    expect(await screen.findByTestId('thread-reminders-popover')).toBeInTheDocument();
    expect(screen.getByText('Active Reminders')).toBeInTheDocument();
    expect(screen.getByText('Follow up soon')).toBeInTheDocument();
    expect(screen.getByTestId('thread-reminders-list').children).toHaveLength(1);
  });

  it('renders placeholder when no thread is selected', () => {
    render(<ThreadHeader thread={undefined} runsCount={0} />);
    expect(screen.getByTestId('thread-header')).toHaveTextContent('Select a thread to view details');
  });
});
