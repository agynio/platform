import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { RunMessageList, type UnifiedListItem } from '../RunMessageList';

const baseItems: UnifiedListItem[] = [
  {
    type: 'run_header',
    run: { id: 'run-1', status: 'finished', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  },
  {
    type: 'message',
    message: {
      id: 'msg-1',
      createdAt: new Date().toISOString(),
      role: 'assistant',
      side: 'left',
      text: 'Hello',
      source: null,
      runId: 'run-1',
    },
  },
];

function makeScrollable(element: HTMLElement, { scrollHeight, clientHeight, scrollTop }: { scrollHeight: number; clientHeight: number; scrollTop: number }) {
  Object.defineProperty(element, 'scrollHeight', { configurable: true, value: scrollHeight });
  Object.defineProperty(element, 'clientHeight', { configurable: true, value: clientHeight });
  let currentTop = scrollTop;
  Object.defineProperty(element, 'scrollTop', {
    configurable: true,
    get: () => currentTop,
    set: (val) => {
      currentTop = val;
    },
  });
}

describe('RunMessageList', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders reminder countdown inline as list item', () => {
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));
    const reminderItems: UnifiedListItem[] = [
      ...baseItems,
      {
        type: 'reminder',
        reminder: {
          id: 'rem-1',
          threadId: 'thread-1',
          note: 'Follow up soon',
          at: new Date('2024-01-01T00:00:10Z').toISOString(),
        },
      },
    ];

    render(<RunMessageList items={reminderItems} showJson={{}} onToggleJson={vi.fn()} />);

    const row = screen.getByTestId('reminder-countdown-row');
    expect(row).toBeInTheDocument();
    expect(row.closest('[role="list"]')).toBe(screen.getByTestId('message-list'));
    expect(screen.getByText('Due in 00:00:10')).toBeInTheDocument();
  });

  it('positions jump button at bottom when scrolled away from latest', () => {
    render(<RunMessageList items={baseItems} showJson={{}} onToggleJson={vi.fn()} />);

    const list = screen.getByTestId('message-list');
    makeScrollable(list, { scrollHeight: 200, clientHeight: 100, scrollTop: 0 });

    act(() => {
      fireEvent.scroll(list);
    });

    expect(screen.getByTestId('jump-to-latest').className).toMatch(/bottom-3/);
  });
});
