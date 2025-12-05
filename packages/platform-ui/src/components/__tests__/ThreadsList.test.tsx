import React from 'react';
import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThreadsList } from '../ThreadsList';
import type { Thread } from '../ThreadItem';

class MockIntersectionObserver {
  static instances: MockIntersectionObserver[] = [];

  static reset() {
    MockIntersectionObserver.instances = [];
  }

  callback: IntersectionObserverCallback;

  options?: IntersectionObserverInit;

  observedElements = new Set<Element>();

  constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
    this.callback = callback;
    this.options = options;
    MockIntersectionObserver.instances.push(this);
  }

  observe = (element: Element) => {
    this.observedElements.add(element);
  };

  disconnect = vi.fn(() => {
    this.observedElements.clear();
  });

  unobserve = vi.fn();

  takeRecords = vi.fn(() => [] as IntersectionObserverEntry[]);

  trigger(isIntersecting: boolean) {
    const [target] = Array.from(this.observedElements);
    if (!target) {
      this.callback([], this as unknown as IntersectionObserver);
      return;
    }

    const entry = {
      isIntersecting,
      target,
    } as IntersectionObserverEntry;

    this.callback([entry], this as unknown as IntersectionObserver);
  }
}

const originalIntersectionObserver = globalThis.IntersectionObserver;

const baseThreads: Thread[] = [
  {
    id: 'thread-1',
    summary: 'First thread summary',
    agentName: 'Agent One',
    createdAt: new Date('2024-01-01T00:00:00Z').toISOString(),
    status: 'running',
    isOpen: true,
  },
  {
    id: 'thread-2',
    summary: 'Second thread summary',
    agentName: 'Agent Two',
    createdAt: new Date('2024-01-02T00:00:00Z').toISOString(),
    status: 'finished',
    isOpen: true,
  },
];

beforeEach(() => {
  MockIntersectionObserver.reset();
  globalThis.IntersectionObserver = MockIntersectionObserver as unknown as typeof IntersectionObserver;
});

afterEach(() => {
  if (originalIntersectionObserver) {
    globalThis.IntersectionObserver = originalIntersectionObserver;
  } else {
    (globalThis as typeof globalThis & {
      IntersectionObserver?: typeof IntersectionObserver;
    }).IntersectionObserver = undefined;
  }
  MockIntersectionObserver.reset();
  vi.clearAllMocks();
});

describe('ThreadsList infinite scroll', () => {
  it('does not trigger load more on initial render', () => {
    const onLoadMore = vi.fn();
    const { container } = render(
      <ThreadsList threads={baseThreads} hasMore isLoading={false} onLoadMore={onLoadMore} />,
    );

    expect(onLoadMore).not.toHaveBeenCalled();
    expect(MockIntersectionObserver.instances).toHaveLength(1);

    const observer = MockIntersectionObserver.instances[0];
    const listRoot = container.querySelector('[data-testid="threads-list"]');
    const scrollContainer = listRoot?.querySelector('div.flex-1.overflow-y-auto') ?? null;

    expect(observer.options?.root).toBe(scrollContainer);
    expect(observer.options?.rootMargin).toBe('100px');
    expect(observer.options?.threshold).toBe(0);
  });

  it('triggers load more once per completed load cycle', () => {
    const onLoadMore = vi.fn();
    const extraThread: Thread = {
      id: 'thread-3',
      summary: 'Extra thread',
      agentName: 'Agent Three',
      createdAt: new Date('2024-01-03T00:00:00Z').toISOString(),
      status: 'pending',
      isOpen: true,
    };

    const { rerender } = render(
      <ThreadsList threads={baseThreads} hasMore isLoading={false} onLoadMore={onLoadMore} />,
    );

    const firstObserver = MockIntersectionObserver.instances.at(-1);
    expect(firstObserver).toBeDefined();
    firstObserver?.trigger(true);
    firstObserver?.trigger(true);
    expect(onLoadMore).toHaveBeenCalledTimes(1);

    rerender(<ThreadsList threads={baseThreads} hasMore isLoading onLoadMore={onLoadMore} />);
    rerender(
      <ThreadsList
        threads={[...baseThreads, extraThread]}
        hasMore
        isLoading={false}
        onLoadMore={onLoadMore}
      />,
    );

    const secondObserver = MockIntersectionObserver.instances.at(-1);
    expect(secondObserver).toBeDefined();
    expect(secondObserver).not.toBe(firstObserver);

    secondObserver?.trigger(true);
    expect(onLoadMore).toHaveBeenCalledTimes(2);
  });

  it('does not observe when hasMore is false', () => {
    const onLoadMore = vi.fn();

    render(<ThreadsList threads={baseThreads} hasMore={false} isLoading={false} onLoadMore={onLoadMore} />);

    expect(onLoadMore).not.toHaveBeenCalled();
    expect(MockIntersectionObserver.instances).toHaveLength(0);
  });
});
