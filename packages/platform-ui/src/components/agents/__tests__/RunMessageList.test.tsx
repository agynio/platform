import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { RunMessageList, type UnifiedListItem } from '../RunMessageList';
import { waitForStableScrollDefaults } from '../waitForStableScrollHeight';

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

const STABLE_FRAMES = waitForStableScrollDefaults.stableFrames;

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
  Object.defineProperty(element, 'scrollTo', {
    configurable: true,
    value: (options: ScrollToOptions | number, y?: number) => {
      if (typeof options === 'number') {
        currentTop = typeof y === 'number' ? y : options;
        return;
      }
      if (options && typeof options.top === 'number') {
        currentTop = options.top;
      }
    },
  });
}

async function advanceFrame() {
  await act(async () => {
    vi.advanceTimersByTime(16);
  });
}

async function flushMicrotasks() {
  await act(async () => {
    await Promise.resolve();
  });
}

async function settleHeightSequence(element: HTMLElement, sequence: number[]) {
  await flushMicrotasks();
  for (const height of sequence) {
    Object.defineProperty(element, 'scrollHeight', { configurable: true, value: height });
    await advanceFrame();
  }

  for (let i = 0; i < STABLE_FRAMES; i += 1) {
    await advanceFrame();
  }
  await flushMicrotasks();
}

describe('RunMessageList', () => {
  let originalRaf: typeof globalThis.requestAnimationFrame | undefined;
  let originalCancelRaf: typeof globalThis.cancelAnimationFrame | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    const globalAny = globalThis as typeof globalThis & {
      requestAnimationFrame?: typeof globalThis.requestAnimationFrame;
      cancelAnimationFrame?: typeof globalThis.cancelAnimationFrame;
    };
    originalRaf = globalAny.requestAnimationFrame;
    originalCancelRaf = globalAny.cancelAnimationFrame;
    delete globalAny.requestAnimationFrame;
    delete globalAny.cancelAnimationFrame;
  });

  afterEach(() => {
    const globalAny = globalThis as typeof globalThis & {
      requestAnimationFrame?: typeof globalThis.requestAnimationFrame;
      cancelAnimationFrame?: typeof globalThis.cancelAnimationFrame;
    };
    if (originalRaf) {
      globalAny.requestAnimationFrame = originalRaf;
    } else {
      delete globalAny.requestAnimationFrame;
    }
    if (originalCancelRaf) {
      globalAny.cancelAnimationFrame = originalCancelRaf;
    } else {
      delete globalAny.cancelAnimationFrame;
    }
    originalRaf = undefined;
    originalCancelRaf = undefined;
    vi.clearAllTimers();
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

  it('positions jump button at bottom when scrolled away from latest', async () => {
    render(<RunMessageList items={baseItems} showJson={{}} onToggleJson={vi.fn()} />);

    const list = screen.getByTestId('message-list');
    makeScrollable(list, { scrollHeight: 200, clientHeight: 100, scrollTop: 0 });

    await settleHeightSequence(list, [200]);

    await act(async () => {
      list.scrollTop = 0;
      fireEvent.scroll(list);
    });

    expect(list.scrollTop).toBe(0);
    expect(screen.getByTestId('jump-to-latest').className).toMatch(/bottom-3/);
  });

  it('waits for scrollHeight stabilization before auto-scrolling on initial load', async () => {
    render(<RunMessageList items={baseItems} showJson={{}} onToggleJson={vi.fn()} />);

    const list = screen.getByTestId('message-list');
    makeScrollable(list, { scrollHeight: 80, clientHeight: 60, scrollTop: 0 });

    await settleHeightSequence(list, [120, 180]);

    expect(list.scrollTop).toBe(180);
    expect(list.scrollTop).toBe(list.scrollHeight);
  });

  it('auto-scrolls after append only once new content stabilizes when at bottom', async () => {
    const { rerender } = render(<RunMessageList items={baseItems} showJson={{}} onToggleJson={vi.fn()} />);

    const list = screen.getByTestId('message-list');
    makeScrollable(list, { scrollHeight: 100, clientHeight: 60, scrollTop: 0 });

    await settleHeightSequence(list, [140, 180]);
    expect(list.scrollTop).toBe(180);

    const nextItems: UnifiedListItem[] = [
      ...baseItems,
      {
        type: 'message',
        message: {
          id: 'msg-2',
          createdAt: new Date().toISOString(),
          role: 'assistant',
          side: 'left',
          text: 'More content',
          source: null,
          runId: 'run-1',
        },
      },
    ];

    rerender(<RunMessageList items={nextItems} showJson={{}} onToggleJson={vi.fn()} />);

    await settleHeightSequence(list, [210, 260]);
    expect(list.scrollTop).toBe(260);
    expect(list.scrollTop).toBe(list.scrollHeight);
  });

  it('jump to latest waits for stabilized scroll height after user scrolls up', async () => {
    const { rerender } = render(<RunMessageList items={baseItems} showJson={{}} onToggleJson={vi.fn()} />);

    const list = screen.getByTestId('message-list');
    makeScrollable(list, { scrollHeight: 150, clientHeight: 80, scrollTop: 0 });

    await settleHeightSequence(list, [180, 220]);
    expect(list.scrollTop).toBe(220);

    await act(async () => {
      list.scrollTop = 0;
      fireEvent.scroll(list);
    });

    expect(screen.getByTestId('jump-to-latest')).toBeInTheDocument();

    const nextItems: UnifiedListItem[] = [
      ...baseItems,
      {
        type: 'message',
        message: {
          id: 'msg-3',
          createdAt: new Date().toISOString(),
          role: 'assistant',
          side: 'left',
          text: 'Follow up',
          source: null,
          runId: 'run-1',
        },
      },
    ];

    rerender(<RunMessageList items={nextItems} showJson={{}} onToggleJson={vi.fn()} />);

    Object.defineProperty(list, 'scrollHeight', { configurable: true, value: 240 });

    const button = screen.getByTestId('jump-to-latest');
    await act(async () => {
      fireEvent.click(button);
    });

    await settleHeightSequence(list, [240, 280]);

    expect(list.scrollTop).toBe(280);
    expect(list.scrollTop).toBe(list.scrollHeight);
    expect(screen.queryByTestId('jump-to-latest')).not.toBeInTheDocument();
  });
});
