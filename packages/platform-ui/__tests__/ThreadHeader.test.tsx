import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThreadHeader } from '../src/components/agents/ThreadHeader';
import type { ThreadNode, ThreadReminder, ThreadMetrics } from '../src/api/types/agents';
import type { ContainerItem } from '../src/api/modules/containers';

const mockMetrics: ThreadMetrics = { remindersCount: 3, containersCount: 2, activity: 'waiting', runsCount: 2 };
const mockReminders: ThreadReminder[] = [
  { id: 'r1', threadId: 't1', note: 'Follow up soon', at: '2025-11-14T12:00:00.000Z', createdAt: '2025-11-13T12:00:00.000Z', completedAt: null },
];
const mockContainers: ContainerItem[] = [
  {
    containerId: 'abc1234567890',
    threadId: 't1',
    image: 'hautech/thread:latest',
    name: 'hautech-thread',
    status: 'running',
    startedAt: '2025-11-14T09:00:00.000Z',
    lastUsedAt: '2025-11-14T10:00:00.000Z',
    killAfterAt: null,
    role: 'workspace',
  },
];

const useThreadMetrics = vi.fn(() => ({ data: mockMetrics, isLoading: false, error: null }));
const makeRemindersResult = () => ({
  data: { items: mockReminders },
  isLoading: false,
  isFetching: false,
  error: null,
  refetch: vi.fn().mockResolvedValue(undefined),
});
const makeContainersResult = () => ({
  data: { items: mockContainers },
  isLoading: false,
  isFetching: false,
  error: null,
  refetch: vi.fn().mockResolvedValue(undefined),
});
const makeContainersCountResult = (count = mockContainers.length) => ({
  data: count,
  isLoading: false,
  isFetching: false,
  error: null,
  refetch: vi.fn().mockResolvedValue(undefined),
});
const makeDisabledResult = () => ({
  data: undefined,
  isLoading: false,
  isFetching: false,
  error: null,
  refetch: vi.fn().mockResolvedValue(undefined),
});

const useThreadReminders = vi.fn(makeRemindersResult);
const useThreadContainers = vi.fn(makeContainersResult);
const useThreadContainersCount = vi.fn(() => makeContainersCountResult());

vi.mock('@/api/hooks/threads', () => ({
  useThreadMetrics: (...args: unknown[]) => useThreadMetrics(...args),
  useThreadReminders: (...args: unknown[]) => useThreadReminders(...args),
  useThreadContainers: (...args: unknown[]) => useThreadContainers(...args),
  useThreadContainersCount: (...args: unknown[]) => useThreadContainersCount(...args),
}));

describe('ThreadHeader', () => {
  beforeEach(() => {
    useThreadMetrics.mockClear();
    useThreadReminders.mockReset();
    useThreadReminders.mockImplementation((_id: unknown, enabled?: boolean) => (enabled ? makeRemindersResult() : makeDisabledResult()));
    useThreadContainers.mockReset();
    useThreadContainers.mockImplementation((_id: unknown, enabled?: boolean) => (enabled ? makeContainersResult() : makeDisabledResult()));
    useThreadContainersCount.mockReset();
    useThreadContainersCount.mockImplementation(() => makeContainersCountResult());
  });

  it('renders selected thread details with metrics and run counts', () => {
    const thread: ThreadNode = {
      id: 't1',
      alias: 'root',
      summary: 'Investigate alerts',
      status: 'open',
      parentId: null,
      createdAt: '2025-11-14T10:00:00.000Z',
      metrics: { remindersCount: 1, containersCount: 1, activity: 'idle', runsCount: 1 },
      agentTitle: 'Incident Agent',
      agentRole: 'Incident Commander',
      agentName: 'Ops L1',
    };

    render(<ThreadHeader thread={thread} runsCount={5} />);

    expect(screen.getByTestId('thread-header-summary')).toHaveTextContent('Investigate alerts');
    expect(screen.getByText('Incident Agent')).toBeInTheDocument();
    expect(screen.queryByText('Incident Commander')).toBeNull();
    expect(screen.getByText(/Status: Open/i)).toBeInTheDocument();
    const stats = screen.getByTestId('thread-header-stats');
    expect(stats).toHaveTextContent('Runs 5');
    expect(stats).toHaveTextContent('Containers 1');
    expect(screen.getByRole('button', { name: /Running containers: 1/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Active reminders: 3/ })).toBeInTheDocument();
    // Run count prefers live runs length (5) over metrics (2)
    expect(screen.getByLabelText('Runs total: 5')).toHaveTextContent('Runs 5');
    // Activity indicator should not render in header
    expect(screen.queryByLabelText(/Activity:/)).toBeNull();
  });

  it('falls back to name and role when title is blank', () => {
    const thread: ThreadNode = {
      id: 't-fallback',
      alias: 'root',
      summary: 'Summarize weekly report',
      status: 'open',
      parentId: null,
      createdAt: '2025-11-14T10:00:00.000Z',
      metrics: mockMetrics,
      agentName: 'Casey',
      agentRole: 'Planner',
      agentTitle: '   ',
    };

    render(<ThreadHeader thread={thread} runsCount={0} />);

    expect(screen.getByText('Casey (Planner)')).toBeInTheDocument();
  });

  it('uses global fallback when name and role missing', () => {
    const thread: ThreadNode = {
      id: 't-fallback-2',
      alias: 'root',
      summary: 'Handle incident',
      status: 'open',
      parentId: null,
      createdAt: '2025-11-14T10:00:00.000Z',
      metrics: mockMetrics,
    };

    render(<ThreadHeader thread={thread} runsCount={0} />);

    expect(screen.getByText('(unknown agent)')).toBeInTheDocument();
  });

  it('omits agent role text when provided', () => {
    const thread: ThreadNode = {
      id: 't2',
      alias: 'root',
      summary: 'Review incidents',
      status: 'open',
      parentId: null,
      createdAt: '2025-11-14T10:00:00.000Z',
      metrics: mockMetrics,
      agentTitle: 'Incident Agent',
      agentName: 'Ops L2',
      agentRole: 'Coordinator',
    };

    render(<ThreadHeader thread={thread} runsCount={0} />);

    expect(screen.queryByText('Coordinator')).toBeNull();
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
      agentName: 'Ops L1',
    };

    render(<ThreadHeader thread={thread} runsCount={0} />);

    const trigger = screen.getByTestId('thread-reminders-trigger');
    await user.click(trigger);

    expect(await screen.findByTestId('thread-reminders-popover')).toBeInTheDocument();
    expect(screen.getByText('Active Reminders')).toBeInTheDocument();
    expect(screen.getByText('Follow up soon')).toBeInTheDocument();
    expect(screen.getByTestId('thread-reminders-list').children).toHaveLength(1);
  });

  it('renders containers popover with list when opened', async () => {
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
      agentName: 'Ops L1',
    };

    render(<ThreadHeader thread={thread} runsCount={0} />);

    await user.click(screen.getByTestId('thread-containers-trigger'));

    const popover = await screen.findByTestId('thread-containers-popover');
    expect(popover).toBeInTheDocument();
    expect(screen.getByText('Running Containers')).toBeInTheDocument();
    expect(screen.getByTestId('thread-containers-list').children).toHaveLength(1);
    expect(screen.getByTestId('thread-containers-item')).toHaveTextContent('workspace');
  });

  it('shows friendly error with retry when reminders fail to load', async () => {
    const user = userEvent.setup();
    const refetch = vi.fn().mockResolvedValue(undefined);
    useThreadReminders.mockImplementation((_id: unknown, enabled?: boolean) =>
      enabled ? { data: undefined, isLoading: false, isFetching: false, error: new Error('nope'), refetch } : makeDisabledResult(),
    );
    const thread: ThreadNode = {
      id: 't1',
      alias: 'root',
      summary: 'Investigate alerts',
      status: 'open',
      parentId: null,
      createdAt: '2025-11-14T10:00:00.000Z',
      metrics: mockMetrics,
      agentTitle: 'Incident Agent',
      agentName: 'Ops L1',
    };

    render(<ThreadHeader thread={thread} runsCount={0} />);

    await user.click(screen.getByTestId('thread-reminders-trigger'));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Unable to load reminders.');
    await user.click(screen.getByRole('button', { name: /retry/i }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('shows error state and retry when containers fail to load', async () => {
    const user = userEvent.setup();
    const refetch = vi.fn().mockResolvedValue(undefined);
    useThreadContainers.mockImplementation((_id: unknown, enabled?: boolean) =>
      enabled ? { data: undefined, isLoading: false, isFetching: false, error: new Error('boom'), refetch } : makeDisabledResult(),
    );
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

    await user.click(screen.getByTestId('thread-containers-trigger'));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Unable to load containers.');
    await user.click(screen.getByRole('button', { name: /retry/i }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('renders placeholder when no thread is selected', () => {
    useThreadContainersCount.mockImplementation(() => makeContainersCountResult(0));
    render(<ThreadHeader thread={undefined} runsCount={0} />);
    expect(screen.getByTestId('thread-header')).toHaveTextContent('Select a thread to view details');
  });
});
