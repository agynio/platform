import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import ThreadsScreen from '../src/components/screens/ThreadsScreen';
import type { Thread } from '../src/components/ThreadItem';

type ThreadsScreenProps = React.ComponentProps<typeof ThreadsScreen>;

const baseThread: Thread = {
  id: 'thread-1',
  summary: 'Coordinate release tasks',
  agentName: 'Release Agent',
  createdAt: '2024-06-01T12:00:00.000Z',
  status: 'pending',
  isOpen: true,
};

const queuedMessages = [
  { id: 'qm-1', content: 'Queued alpha' },
  { id: 'qm-2', content: 'Queued beta' },
];

const conversationReminders = [
  { id: 'rem-1', content: 'Reminder gamma', scheduledTime: '09:00', date: '2024-06-02' },
];

function renderScreen(overrides: Partial<ThreadsScreenProps> = {}) {
  const props: ThreadsScreenProps = {
    threads: [baseThread],
    runs: [],
    containers: [],
    reminders: [],
    queuedMessages: [],
    conversationReminders: [],
    filterMode: 'all',
    selectedThreadId: baseThread.id,
    inputValue: '',
    isRunsInfoCollapsed: false,
    threadsHasMore: false,
    threadsIsLoading: false,
    isLoading: false,
    isEmpty: false,
    ...overrides,
  };

  return render(<ThreadsScreen {...props} />);
}

describe('ThreadsScreen pending items rendering', () => {
  it('renders queued messages ahead of reminders within the pending section', () => {
    renderScreen({ queuedMessages, conversationReminders });

    const pendingLabel = screen.getByText('PENDING');
    const pendingRoot = pendingLabel.parentElement?.parentElement as HTMLElement | null;
    expect(pendingRoot).not.toBeNull();
    if (!pendingRoot) throw new Error('Missing pending section');

    expect(within(pendingRoot).getByText('Queued alpha')).toBeInTheDocument();
    expect(within(pendingRoot).getByText('Queued beta')).toBeInTheDocument();
    expect(within(pendingRoot).getByText('Reminder gamma')).toBeInTheDocument();

    const textContent = pendingRoot.textContent ?? '';
    expect(textContent.indexOf('Queued alpha')).toBeLessThan(textContent.indexOf('Reminder gamma'));
    expect(textContent.indexOf('Queued beta')).toBeLessThan(textContent.indexOf('Reminder gamma'));
  });

  it('renders the pending divider when only reminders are provided', () => {
    renderScreen({ conversationReminders });
    expect(screen.getByText('PENDING')).toBeInTheDocument();
  });

  it('hides the pending divider when no queued messages or reminders exist', () => {
    renderScreen();
    expect(screen.queryByText('PENDING')).toBeNull();
  });
});
