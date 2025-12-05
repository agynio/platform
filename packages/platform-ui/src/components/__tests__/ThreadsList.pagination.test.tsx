import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ThreadsList } from '../ThreadsList';
import type { Thread } from '../ThreadItem';

type ObserverFactory = typeof window.IntersectionObserver;

const createThread = (id: string, overrides: Partial<Thread> = {}): Thread => ({
  id,
  summary: overrides.summary ?? `Thread ${id}`,
  agentName: overrides.agentName ?? `Agent ${id}`,
  createdAt: overrides.createdAt ?? '2024-06-01T00:00:00Z',
  status: overrides.status ?? 'running',
  isOpen: overrides.isOpen ?? true,
  ...overrides,
});

describe('ThreadsList pagination', () => {
  let originalObserver: ObserverFactory | undefined;
  let observerCallback: IntersectionObserverCallback | null;
  let observerInstance: IntersectionObserver | null;
  let observedElement: Element | null;

  const installObserverMock = () => {
    window.IntersectionObserver = vi
      .fn((callback: IntersectionObserverCallback, options?: IntersectionObserverInit) => {
        observerCallback = callback;
        const threshold = options?.threshold;
        const thresholds = threshold === undefined ? [] : Array.isArray(threshold) ? threshold : [threshold];

        const instance: IntersectionObserver = {
          root: null,
          rootMargin: options?.rootMargin ?? '',
          thresholds,
          observe: vi.fn((element: Element) => {
            observedElement = element;
          }),
          unobserve: vi.fn(),
          disconnect: vi.fn(),
          takeRecords: () => [],
        };

        observerInstance = instance;
        return instance;
      }) as unknown as ObserverFactory;
  };

  const triggerIntersection = async (isIntersecting = true) => {
    if (!observerCallback || !observerInstance || !observedElement) {
      throw new Error('IntersectionObserver not initialized');
    }

    const entry = {
      isIntersecting,
      target: observedElement,
      intersectionRatio: isIntersecting ? 1 : 0,
      time: performance.now(),
      boundingClientRect: observedElement.getBoundingClientRect?.() ?? ({} as DOMRectReadOnly),
      intersectionRect: {} as DOMRectReadOnly,
      rootBounds: null,
    } as IntersectionObserverEntry;

    await act(async () => {
      observerCallback?.([entry], observerInstance as IntersectionObserver);
    });
  };

  beforeEach(() => {
    originalObserver = window.IntersectionObserver as ObserverFactory | undefined;
    observerCallback = null;
    observerInstance = null;
    observedElement = null;
    installObserverMock();
  });

  afterEach(() => {
    if (originalObserver) {
      window.IntersectionObserver = originalObserver;
    } else {
      delete (window as { IntersectionObserver?: typeof window.IntersectionObserver }).IntersectionObserver;
    }
    vi.restoreAllMocks();
  });

  it('gates load more calls while loading is in progress', async () => {
    const onLoadMore = vi.fn();
    const threads = [createThread('t-1'), createThread('t-2')];

    const { rerender } = render(
      <ThreadsList threads={threads} hasMore onLoadMore={onLoadMore} isLoading={false} />
    );

    await waitFor(() => expect(observedElement).not.toBeNull());

    await triggerIntersection(true);
    expect(onLoadMore).toHaveBeenCalledTimes(1);

    await triggerIntersection(true);
    expect(onLoadMore).toHaveBeenCalledTimes(1);

    rerender(<ThreadsList threads={threads} hasMore onLoadMore={onLoadMore} isLoading />);

    await triggerIntersection(true);
    expect(onLoadMore).toHaveBeenCalledTimes(1);

    const extendedThreads = [...threads, createThread('t-3')];
    rerender(
      <ThreadsList threads={extendedThreads} hasMore onLoadMore={onLoadMore} isLoading={false} />
    );

    await triggerIntersection(true);
    expect(onLoadMore).toHaveBeenCalledTimes(2);
  });

  it('shows last-page message once and clears it when threads reset', async () => {
    const onLoadMore = vi.fn();
    const threads = [createThread('t-1'), createThread('t-2')];

    const { rerender } = render(
      <ThreadsList threads={threads} hasMore onLoadMore={onLoadMore} isLoading={false} />
    );

    await waitFor(() => expect(observedElement).not.toBeNull());

    await triggerIntersection(true);
    expect(onLoadMore).toHaveBeenCalledTimes(1);

    rerender(<ThreadsList threads={threads} hasMore onLoadMore={onLoadMore} isLoading />);

    const completedThreads = [...threads, createThread('t-3')];
    rerender(
      <ThreadsList
        threads={completedThreads}
        hasMore={false}
        onLoadMore={onLoadMore}
        isLoading={false}
      />
    );

    expect(await screen.findByText('No more threads to load')).toBeInTheDocument();

    const filteredThreads = [createThread('fresh-1')];
    rerender(
      <ThreadsList
        threads={filteredThreads}
        hasMore={false}
        onLoadMore={onLoadMore}
        isLoading={false}
      />
    );

    await waitFor(() => expect(screen.queryByText('No more threads to load')).not.toBeInTheDocument());
  });

  it('renders empty state when no threads are available', () => {
    render(<ThreadsList threads={[]} hasMore={false} isLoading={false} />);

    expect(screen.getByText('No threads found')).toBeInTheDocument();
  });

  it('surfaces child load errors when expanded', async () => {
    const thread = createThread('t-error', {
      hasChildren: true,
      isChildrenLoading: false,
      childrenError: 'Failed to load subthreads.',
    });

    render(<ThreadsList threads={[thread]} hasMore={false} isLoading={false} />);

    const toggle = screen.getByRole('button', { name: /show subthreads/i });
    await userEvent.click(toggle);

    expect(await screen.findByText('Failed to load subthreads.')).toBeInTheDocument();
  });
});
