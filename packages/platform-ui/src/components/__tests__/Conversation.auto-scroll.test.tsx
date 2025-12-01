import React from 'react';
import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterEach,
  vi,
  type Mock,
} from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import { Conversation, type Run, type ConversationHandle } from '../Conversation';
import { waitForStableScrollHeight } from '../agents/waitForStableScrollHeight';

vi.mock('../agents/waitForStableScrollHeight', () => ({
  waitForStableScrollHeight: vi.fn(() => Promise.resolve()),
}));

vi.mock('../VirtualizedList', () => {
  const { forwardRef, useRef, useImperativeHandle, useMemo, useEffect } = React;

  const instances: any[] = [];

  const VirtualizedList = forwardRef(function MockVirtualizedList(props: any, ref) {
    const scrollerRef = useRef<HTMLDivElement | null>(null);
    const atBottomRef = useRef(true);
    const propsRef = useRef(props);
    propsRef.current = props;

    const scrollToIndexMock = useMemo(() => vi.fn(), []);
    const scrollToMock = useMemo(() => vi.fn(), []);
    const captureScrollPositionMock = useMemo(
      () => vi.fn(() => Promise.resolve({ index: undefined, scrollTop: 0 })),
      [],
    );
    const restoreScrollPositionMock = useMemo(() => vi.fn(), []);

    const instanceRef = useRef<any | null>(null);
    if (!instanceRef.current) {
      instanceRef.current = {
        scrollToIndex: scrollToIndexMock,
        scrollTo: scrollToMock,
        setAtBottom(value: boolean) {
          atBottomRef.current = value;
          propsRef.current.onAtBottomChange?.(value);
        },
        getScroller: () => scrollerRef.current,
        captureScrollPosition: captureScrollPositionMock,
        restoreScrollPosition: restoreScrollPositionMock,
      };
      instances.push(instanceRef.current);
    }

    const { onAtBottomChange } = props;

    useImperativeHandle(ref, () => ({
      scrollToIndex: (...args: any[]) => {
        scrollToIndexMock(...args);
      },
      scrollTo: (...args: any[]) => {
        scrollToMock(...args);
      },
      getScrollerElement: () => scrollerRef.current,
      isAtBottom: () => atBottomRef.current,
      captureScrollPosition: () => captureScrollPositionMock(),
      restoreScrollPosition: (position: unknown) => {
        restoreScrollPositionMock(position);
      },
    }));

    useEffect(() => {
      onAtBottomChange?.(atBottomRef.current);
      return () => {
        const index = instances.indexOf(instanceRef.current);
        if (index >= 0) {
          instances.splice(index, 1);
        }
      };
    }, [onAtBottomChange]);

    return (
      <div data-testid="mock-virtualized-list" ref={scrollerRef} style={{ overflowY: 'auto', height: '100%' }}>
        {props.items.map((item: unknown, index: number) => {
          const key = props.getItemKey ? props.getItemKey(item) : index;
          return <div key={key}>{props.renderItem(index, item)}</div>;
        })}
      </div>
    );
  });

  return {
    VirtualizedList,
    __virtualizedListMock: {
      getInstances: () => instances,
      clear: () => {
        instances.splice(0, instances.length);
      },
    },
  };
});

const waitForStableScrollHeightMock = vi.mocked(waitForStableScrollHeight);

type MockVirtualizedListInstance = {
  scrollToIndex: Mock;
  scrollTo: Mock;
  setAtBottom: (value: boolean) => void;
  getScroller: () => HTMLDivElement | null;
  captureScrollPosition: Mock;
  restoreScrollPosition: Mock;
};

type VirtualizedListMockModule = {
  __virtualizedListMock: {
    getInstances: () => MockVirtualizedListInstance[];
    clear: () => void;
  };
};

let virtualizedListMockModule: VirtualizedListMockModule;

beforeAll(async () => {
  virtualizedListMockModule = (await import('../VirtualizedList')) as unknown as VirtualizedListMockModule;
});

function createRuns(): Run[] {
  return [
    {
      id: 'run-1',
      status: 'finished',
      messages: [
        { id: 'm1', role: 'user', content: 'Hello' },
        { id: 'm2', role: 'assistant', content: 'Hi there' },
      ],
    },
  ];
}

function getLatestInstance(): MockVirtualizedListInstance {
  const instances = virtualizedListMockModule.__virtualizedListMock.getInstances();
  expect(instances.length).toBeGreaterThan(0);
  return instances[instances.length - 1];
}

async function completeInitialHydration({
  rerender,
  instance,
  runs,
}: {
  rerender: (ui: React.ReactElement) => void;
  instance: MockVirtualizedListInstance;
  runs: Run[];
}) {
  await act(async () => {
    rerender(
      <Conversation
        threadId="thread-1"
        runs={runs}
        hydrationComplete
        isActive
      />,
    );
    await Promise.resolve();
  });

  const scroller = instance.getScroller();
  expect(scroller).not.toBeNull();
  expect(waitForStableScrollHeightMock).toHaveBeenCalledWith(scroller);
}

describe('Conversation auto-follow behavior', () => {
  beforeEach(() => {
    waitForStableScrollHeightMock.mockClear();
    waitForStableScrollHeightMock.mockImplementation(() => Promise.resolve());
    virtualizedListMockModule.__virtualizedListMock.clear();

    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows a loader until the first scroll completes after hydration', async () => {
    const runs = createRuns();

    const { rerender } = render(
      <Conversation threadId="thread-1" runs={runs} hydrationComplete={false} isActive />,
    );

    expect(screen.getByTestId('conversation-loader')).toBeInTheDocument();

    const instance = getLatestInstance();
    expect(instance.scrollToIndex).not.toHaveBeenCalled();

    await completeInitialHydration({ rerender, instance, runs });

    expect(instance.scrollToIndex).toHaveBeenCalledTimes(1);
    expect(instance.scrollToIndex.mock.calls[0][0]).toMatchObject({ index: 1, align: 'end', behavior: 'auto' });
    expect(screen.getByTestId('conversation-loader')).toBeInTheDocument();

    act(() => {
      instance.setAtBottom(true);
    });

    await waitFor(() => {
      expect(screen.queryByTestId('conversation-loader')).toBeNull();
    });
  });

  it('auto-follows new messages when the viewer is at the bottom', async () => {
    const runs = createRuns();

    const { rerender } = render(
      <Conversation threadId="thread-1" runs={runs} hydrationComplete={false} isActive />,
    );

    const instance = getLatestInstance();
    await completeInitialHydration({ rerender, instance, runs });

    act(() => {
      instance.setAtBottom(true);
    });
    await waitFor(() => {
      expect(screen.queryByTestId('conversation-loader')).toBeNull();
    });

    instance.scrollToIndex.mockClear();
    waitForStableScrollHeightMock.mockClear();

    const updatedRuns: Run[] = [
      {
        ...runs[0],
        messages: [
          ...runs[0].messages,
          { id: 'm3', role: 'assistant', content: 'A new reply' },
        ],
      },
    ];

    await act(async () => {
      rerender(
        <Conversation threadId="thread-1" runs={updatedRuns} hydrationComplete isActive />,
      );
      await Promise.resolve();
    });

    expect(waitForStableScrollHeightMock).toHaveBeenCalled();
    expect(instance.scrollToIndex).toHaveBeenCalledTimes(1);
    expect(instance.scrollToIndex.mock.calls[0][0]).toMatchObject({ index: 1, align: 'end', behavior: 'auto' });
  });

  it('does not auto-follow when the viewer is not at the bottom', async () => {
    const runs = createRuns();

    const { rerender } = render(
      <Conversation threadId="thread-1" runs={runs} hydrationComplete={false} isActive />,
    );

    const instance = getLatestInstance();
    await completeInitialHydration({ rerender, instance, runs });

    act(() => {
      instance.setAtBottom(false);
    });
    await waitFor(() => {
      expect(screen.queryByTestId('conversation-loader')).toBeNull();
    });

    instance.scrollToIndex.mockClear();
    waitForStableScrollHeightMock.mockClear();

    const updatedRuns: Run[] = [
      {
        ...runs[0],
        messages: [
          ...runs[0].messages,
          { id: 'm3', role: 'assistant', content: 'Another reply' },
        ],
      },
    ];

    await act(async () => {
      rerender(
        <Conversation threadId="thread-1" runs={updatedRuns} hydrationComplete isActive />,
      );
      await Promise.resolve();
    });

    expect(waitForStableScrollHeightMock).not.toHaveBeenCalled();
    expect(instance.scrollToIndex).not.toHaveBeenCalled();
  });

  it('keeps the loader hidden after restoring scroll state on reactivation', async () => {
    const runs = createRuns();
    const ref = React.createRef<ConversationHandle>();

    const { rerender } = render(
      <Conversation threadId="thread-1" runs={runs} hydrationComplete={false} isActive ref={ref} />,
    );

    const instance = getLatestInstance();
    await completeInitialHydration({ rerender, instance, runs });

    act(() => {
      instance.setAtBottom(true);
    });
    await waitFor(() => {
      expect(screen.queryByTestId('conversation-loader')).toBeNull();
    });

    rerender(
      <Conversation threadId="thread-1" runs={runs} hydrationComplete isActive={false} ref={ref} />,
    );
    expect(screen.queryByTestId('conversation-loader')).toBeNull();

    rerender(<Conversation threadId="thread-1" runs={runs} hydrationComplete isActive ref={ref} />);

    act(() => {
    ref.current?.restoreScrollState({ index: 0, offset: 0, scrollTop: 10 });
    });

    await waitFor(() => {
      expect(screen.queryByTestId('conversation-loader')).toBeNull();
    });
  });
});

describe('Conversation scroll restoration', () => {
  let rafQueue: FrameRequestCallback[];

  const flushRaf = async () => {
    await act(async () => {
      while (rafQueue.length > 0) {
        const callback = rafQueue.shift();
        if (callback) {
          callback(Date.now());
        }
      }
      await Promise.resolve();
    });
  };

  beforeEach(() => {
    waitForStableScrollHeightMock.mockClear();
    waitForStableScrollHeightMock.mockImplementation(() => Promise.resolve());
    virtualizedListMockModule.__virtualizedListMock.clear();

    rafQueue = [];
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      rafQueue.push(callback);
      return rafQueue.length;
    });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => {
      const index = Math.max(0, Math.floor(id) - 1);
      if (rafQueue[index]) {
        rafQueue[index] = () => {};
      }
    });
  });

  afterEach(() => {
    rafQueue = [];
    vi.unstubAllGlobals();
  });

  it('clamps restoration index when runs are available', async () => {
    const ref = React.createRef<ConversationHandle>();
    const runs = createRuns();

    const { rerender } = render(
      <Conversation ref={ref} threadId="thread-restore" runs={[]} hydrationComplete isActive />,
    );

    const instance = getLatestInstance();
    await flushRaf();
    instance.scrollToIndex.mockClear();
    instance.scrollTo.mockClear();

    await act(async () => {
      ref.current?.restoreScrollState({ index: 5, offset: 12 });
    });

    await flushRaf();

    expect(instance.scrollToIndex).not.toHaveBeenCalled();
    expect(waitForStableScrollHeightMock).not.toHaveBeenCalled();
    expect(screen.getByTestId('conversation-loader')).toBeInTheDocument();

    await act(async () => {
      rerender(<Conversation ref={ref} threadId="thread-restore" runs={runs} hydrationComplete isActive />);
    });

    await flushRaf();

    const matchingCall = instance.scrollToIndex.mock.calls.find((call) => {
      const args = call[0] as { index: number; offset?: number };
      return args.index === 1 && args.offset === 12;
    });

    expect(matchingCall).toBeDefined();
    expect(instance.scrollTo).not.toHaveBeenCalled();
    expect(waitForStableScrollHeightMock).toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.queryByTestId('conversation-loader')).toBeNull();
    });
  });

  it('uses scrollTop fallback when index is absent', async () => {
    const ref = React.createRef<ConversationHandle>();
    const runs = createRuns();

    render(<Conversation ref={ref} threadId="thread-top" runs={runs} hydrationComplete isActive />);

    const instance = getLatestInstance();
    await flushRaf();
    instance.scrollToIndex.mockClear();
    instance.scrollTo.mockClear();

    await act(async () => {
      ref.current?.restoreScrollState({ scrollTop: 120 });
    });

    await flushRaf();

    expect(
      instance.scrollTo.mock.calls.some((call) => {
        const args = call[0];
        return typeof args === 'object' && args !== null && 'top' in args && (args as ScrollToOptions).top === 120;
      }),
    ).toBe(true);
    expect(
      instance.scrollToIndex.mock.calls.every((call) => {
        const args = call[0] as { offset?: number } | undefined;
        return !args || typeof args.offset !== 'number';
      }),
    ).toBe(true);
  });

  it('restores to the bottom when only atBottom flag is provided', async () => {
    const ref = React.createRef<ConversationHandle>();
    const runs = createRuns();

    render(<Conversation ref={ref} threadId="thread-bottom" runs={runs} hydrationComplete isActive />);

    const instance = getLatestInstance();
    await flushRaf();
    instance.scrollToIndex.mockClear();
    instance.scrollTo.mockClear();

    await act(async () => {
      ref.current?.restoreScrollState({ index: Number.NaN, atBottom: true });
    });

    await flushRaf();

    const matchingCall = instance.scrollToIndex.mock.calls.find((call) => {
      const args = call[0] as { index: number; align?: string };
      return args.index === 1 && args.align === 'end';
    });

    expect(matchingCall).toBeDefined();
    expect(instance.scrollTo).not.toHaveBeenCalled();
  });

  it('ignores restores when virtuoso snapshot lacks range data', async () => {
    const ref = React.createRef<ConversationHandle>();
    const runs = createRuns();

    render(<Conversation ref={ref} threadId="thread-missing" runs={runs} hydrationComplete isActive />);

    const instance = getLatestInstance();
    await flushRaf();
    instance.scrollToIndex.mockClear();
    instance.scrollTo.mockClear();

    instance.captureScrollPosition.mockResolvedValueOnce(null);
    instance.setAtBottom(false);

    const captured = await ref.current?.captureScrollState();
    expect(captured).toBeNull();

    await act(async () => {
      ref.current?.restoreScrollState(captured ?? null);
    });
    expect(instance.scrollToIndex).not.toHaveBeenCalled();
    expect(instance.scrollTo).not.toHaveBeenCalled();
    expect(screen.queryByTestId('conversation-loader')).toBeNull();
  });

});
