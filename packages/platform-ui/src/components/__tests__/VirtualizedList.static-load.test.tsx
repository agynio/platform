import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, act, waitFor } from '@testing-library/react';
import { VirtualizedList } from '../VirtualizedList';

vi.mock('react-virtuoso', async () => {
  const ReactModule = await import('react');
  const { forwardRef } = ReactModule;

  const Virtuoso = forwardRef<any, any>((props, ref) => {
    const globalScope = globalThis as { __VIRTUOSO_THROW__?: boolean };
    if (globalScope.__VIRTUOSO_THROW__) {
      globalScope.__VIRTUOSO_THROW__ = false;
      throw new Error('virt-failure');
    }

    const {
      data = [],
      itemContent,
      components = {},
      firstItemIndex = 0,
      className,
      style,
    } = props ?? {};

    const handle = React.useMemo(
      () => ({
        scrollToIndex: () => {},
        scrollTo: () => {},
        getState: (callback: (snapshot: unknown) => void) => {
          callback({
            ranges: [{ startIndex: firstItemIndex, endIndex: firstItemIndex }],
            scrollTop: 0,
          });
        },
      }),
      [firstItemIndex],
    );

    React.useImperativeHandle(ref, () => handle);

    return (
      <div data-testid="mock-virtuoso" className={className} style={style}>
        {typeof components.Header === 'function' ? components.Header() : null}
        {data.map((item: unknown, index: number) => (
          <React.Fragment key={index}>{itemContent(firstItemIndex + index, item)}</React.Fragment>
        ))}
        {typeof components.Footer === 'function' ? components.Footer() : null}
      </div>
    );
  });

  return { Virtuoso };
});

const assignScrollMetrics = (element: HTMLElement, metrics: { scrollHeight: number; clientHeight: number }) => {
  Object.defineProperty(element, 'scrollHeight', {
    configurable: true,
    value: metrics.scrollHeight,
  });
  Object.defineProperty(element, 'clientHeight', {
    configurable: true,
    value: metrics.clientHeight,
  });
};

const renderListNode = (items: string[], onLoadMore: () => void) => (
  <div style={{ height: '400px' }}>
    <VirtualizedList
      className="virtualized-list-test"
      style={{ height: '100%' }}
      items={items}
      hasMore
      renderItem={(_, item) => (
        <div style={{ height: '40px' }} data-testid={`item-${item}`}>
          {item}
        </div>
      )}
      getItemKey={(item) => item}
      onLoadMore={onLoadMore}
    />
  </div>
);

const renderStaticList = (items: string[], onLoadMore: () => void) => {
  return render(renderListNode(items, onLoadMore));
};

const getScroller = (container: HTMLElement): HTMLDivElement => {
  const scroller = container.querySelector<HTMLDivElement>('.virtualized-list-test > div');
  if (!scroller) {
    throw new Error('Failed to locate static scroller element');
  }
  return scroller;
};

describe('VirtualizedList static load more handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete (globalThis as { __VIRTUOSO_THROW__?: boolean }).__VIRTUOSO_THROW__;
  });

  afterEach(() => {
    delete (globalThis as { __AGYN_DISABLE_VIRTUALIZATION__?: boolean }).__AGYN_DISABLE_VIRTUALIZATION__;
    delete (globalThis as { __VIRTUOSO_THROW__?: boolean }).__VIRTUOSO_THROW__;
  });

  it('triggers onLoadMore once per prepend cycle when virtualization is disabled', async () => {
    (globalThis as { __AGYN_DISABLE_VIRTUALIZATION__?: boolean }).__AGYN_DISABLE_VIRTUALIZATION__ = true;

    const onLoadMore = vi.fn();
    const initialItems = Array.from({ length: 12 }, (_, index) => `item-${index}`);
    const { container, rerender } = renderStaticList(initialItems, onLoadMore);
    const scroller = getScroller(container);

    assignScrollMetrics(scroller, { scrollHeight: 1000, clientHeight: 200 });

    await waitFor(() => {
      expect(onLoadMore).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      scroller.scrollTop = 400;
      scroller.dispatchEvent(new Event('scroll'));
      await Promise.resolve();
    });

    expect(onLoadMore).toHaveBeenCalledTimes(1);

    await act(async () => {
      scroller.scrollTop = 0;
      scroller.dispatchEvent(new Event('scroll'));
      await Promise.resolve();
    });

    expect(onLoadMore).toHaveBeenCalledTimes(1);

    await act(async () => {
      scroller.dispatchEvent(new Event('scroll'));
      await Promise.resolve();
    });

    expect(onLoadMore).toHaveBeenCalledTimes(1);

    const prependedItems = ['prep-1', 'prep-0', ...initialItems];
    rerender(
      <div style={{ height: '400px' }}>
        <VirtualizedList
          className="virtualized-list-test"
          style={{ height: '100%' }}
          items={prependedItems}
          hasMore
          renderItem={(_, item) => (
            <div style={{ height: '40px' }} data-testid={`item-${item}`}>
              {item}
            </div>
          )}
          getItemKey={(item) => item}
          onLoadMore={onLoadMore}
        />
      </div>,
    );

    assignScrollMetrics(scroller, { scrollHeight: 1160, clientHeight: 200 });

    await waitFor(() => {
      expect(onLoadMore).toHaveBeenCalledTimes(2);
    });

    await act(async () => {
      scroller.dispatchEvent(new Event('scroll'));
      await Promise.resolve();
    });

    expect(onLoadMore).toHaveBeenCalledTimes(2);

    const furtherPrepended = ['prep-3', 'prep-2', ...prependedItems];
    rerender(
      <div style={{ height: '400px' }}>
        <VirtualizedList
          className="virtualized-list-test"
          style={{ height: '100%' }}
          items={furtherPrepended}
          hasMore
          renderItem={(_, item) => (
            <div style={{ height: '40px' }} data-testid={`item-${item}`}>
              {item}
            </div>
          )}
          getItemKey={(item) => item}
          onLoadMore={onLoadMore}
        />
      </div>,
    );

    assignScrollMetrics(scroller, { scrollHeight: 1320, clientHeight: 200 });

    await waitFor(() => {
      expect(onLoadMore).toHaveBeenCalledTimes(3);
    });

    await act(async () => {
      scroller.dispatchEvent(new Event('scroll'));
      await Promise.resolve();
    });

    expect(onLoadMore).toHaveBeenCalledTimes(3);
  });

  it('fires once after Virtuoso error fallback while guarding duplicate scroll events', async () => {
    const onLoadMore = vi.fn();
    const items = Array.from({ length: 8 }, (_, index) => `thread-${index}`);

    const { container, rerender } = renderStaticList(items, onLoadMore);

    expect(container.querySelector('[data-testid="mock-virtuoso"]')).toBeInTheDocument();

    (globalThis as { __AGYN_DISABLE_VIRTUALIZATION__?: boolean }).__AGYN_DISABLE_VIRTUALIZATION__ = true;

    await act(async () => {
      rerender(renderListNode(items, onLoadMore));
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(container.querySelector('[data-testid="mock-virtuoso"]')).not.toBeInTheDocument();
    });

    const scroller = getScroller(container);

    assignScrollMetrics(scroller, { scrollHeight: 720, clientHeight: 200 });

    await waitFor(() => {
      expect(onLoadMore).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      scroller.scrollTop = 1;
      scroller.dispatchEvent(new Event('scroll'));
      await Promise.resolve();
    });

    expect(onLoadMore).toHaveBeenCalledTimes(1);

    await act(async () => {
      scroller.dispatchEvent(new Event('scroll'));
      scroller.dispatchEvent(new Event('scroll'));
      await Promise.resolve();
    });

    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });
});
