import React from 'react';
import { describe, it, expect, beforeAll, beforeEach, vi, type Mock } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { ConversationsHost } from '../ThreadsScreen';
import type { Run, QueuedMessageData, ReminderData } from '../../Conversation';

vi.mock('../../Conversation', () => {
  const { useRef, useImperativeHandle, forwardRef, useMemo, useEffect } = React;
  let instanceCounter = 0;
  const conversationMock = vi.fn();
  const handleSpies = new Map<string, { capture: Mock; restore: Mock }>();
  const atBottomOverrides = new Map<string, boolean>();
  const handleExposureOverrides = new Map<string, boolean>();

  const ConversationComponent = forwardRef<any, any>((props, ref) => {
    const instanceIdRef = useRef<number | null>(null);
    if (instanceIdRef.current === null) {
      instanceIdRef.current = instanceCounter++;
    }

    const captureSpy = useMemo(
      () => vi.fn(async () => ({ index: instanceIdRef.current ?? 0, offset: 4, scrollTop: 42 })),
      [],
    );
    const restoreSpy = useMemo(() => vi.fn(), []);
    const shouldExposeHandle = handleExposureOverrides.get(props.threadId) ?? true;

    useImperativeHandle(
      ref,
      () =>
        shouldExposeHandle
          ? {
              captureScrollState: () => captureSpy(),
              restoreScrollState: (state: unknown, options?: unknown) => {
                restoreSpy(state, options);
              },
              isAtBottom: () => atBottomOverrides.get(props.threadId) ?? true,
            }
          : null,
      [shouldExposeHandle, captureSpy, restoreSpy, props.threadId],
    );

    conversationMock(props);

    useEffect(() => {
      handleSpies.set(props.threadId, { capture: captureSpy, restore: restoreSpy });
      return () => {
        handleSpies.delete(props.threadId);
      };
    }, [captureSpy, props.threadId, restoreSpy]);

    return (
      <div
        data-testid={`conversation-${props.threadId}`}
        data-active={props.isActive ? 'true' : 'false'}
        data-instance-id={instanceIdRef.current ?? -1}
      />
    );
  });

  ConversationComponent.displayName = 'MockConversation';

  return {
    Conversation: ConversationComponent,
    __conversationMock: conversationMock,
    __conversationHandleSpies: handleSpies,
    __conversationSetHandleExposure: (threadId: string, exposed: boolean) => {
      if (exposed) {
        handleExposureOverrides.delete(threadId);
        return;
      }
      handleExposureOverrides.set(threadId, false);
    },
    __conversationResetHandleExposure: () => {
      handleExposureOverrides.clear();
    },
    __conversationSetAtBottom: (threadId: string, atBottom: boolean) => {
      atBottomOverrides.set(threadId, atBottom);
    },
    __conversationResetAtBottom: () => {
      atBottomOverrides.clear();
    },
  };
});

type ConversationMockModule = {
  __conversationMock: ReturnType<typeof vi.fn>;
  __conversationHandleSpies: Map<string, { capture: Mock; restore: Mock }>;
  __conversationSetHandleExposure: (threadId: string, exposed: boolean) => void;
  __conversationResetHandleExposure: () => void;
  __conversationSetAtBottom: (threadId: string, atBottom: boolean) => void;
  __conversationResetAtBottom: () => void;
};

let conversationMockModule: ConversationMockModule;

beforeAll(async () => {
  conversationMockModule = (await import('../../Conversation')) as unknown as ConversationMockModule;
});

beforeEach(() => {
  conversationMockModule.__conversationMock.mockClear();
  conversationMockModule.__conversationHandleSpies.clear();
  conversationMockModule.__conversationResetHandleExposure();
  conversationMockModule.__conversationResetAtBottom();
  vi.unstubAllGlobals();
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function createRun(id: string): Run {
  return {
    id: `run-${id}`,
    status: 'finished',
    messages: [
      {
        id: `msg-${id}`,
        role: 'assistant',
        content: `Message for ${id}`,
      },
    ],
  };
}

const EMPTY_QUEUE: QueuedMessageData[] = [];
const EMPTY_REMINDERS: ReminderData[] = [];

describe('ConversationsHost', () => {
  it('caches up to 10 conversations using LRU eviction', async () => {
    const { rerender } = render(
      <ConversationsHost
        activeThreadId="thread-1"
        runs={[createRun('1')]}
        queuedMessages={EMPTY_QUEUE}
        reminders={EMPTY_REMINDERS}
        hydrationComplete
        isRunsInfoCollapsed={false}
      />,
    );

    let preservedInstanceId: string | null = null;

    for (let index = 2; index <= 12; index += 1) {
      const threadId = `thread-${index}`;

      await act(async () => {
        rerender(
          <ConversationsHost
            activeThreadId={threadId}
            runs={[createRun(String(index))]}
            queuedMessages={EMPTY_QUEUE}
            reminders={EMPTY_REMINDERS}
            hydrationComplete
            isRunsInfoCollapsed={false}
          />,
        );
        await Promise.resolve();
      });

      if (index === 5) {
        preservedInstanceId = screen
          .getByTestId('conversation-thread-5')
          .getAttribute('data-instance-id');
      }
    }

    expect(screen.queryByTestId('conversation-thread-1')).toBeNull();
    expect(screen.queryByTestId('conversation-thread-2')).toBeNull();

    const cachedItems = screen.getAllByTestId(/conversation-host-item-/);
    expect(cachedItems).toHaveLength(10);

    expect(screen.getByTestId('conversation-thread-5')).toBeInTheDocument();

    await act(async () => {
      rerender(
        <ConversationsHost
          activeThreadId="thread-5"
          runs={[createRun('5')]}
          queuedMessages={EMPTY_QUEUE}
          reminders={EMPTY_REMINDERS}
          hydrationComplete
          isRunsInfoCollapsed={false}
        />,
      );
      await Promise.resolve();
    });

    const revivedInstanceId = screen
      .getByTestId('conversation-thread-5')
      .getAttribute('data-instance-id');

    expect(revivedInstanceId).toBe(preservedInstanceId);

    const spiesForFive = conversationMockModule.__conversationHandleSpies.get('thread-5');
    expect(spiesForFive?.restore).toHaveBeenCalledTimes(1);
  });

  it('clears pending restore frames on cache eviction', async () => {
    vi.unstubAllGlobals();
    let rafId = 0;
    const callbacks = new Map<number, FrameRequestCallback>();
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      const id = ++rafId;
      callbacks.set(id, callback);
      return id;
    });
    const cancelSpy = vi.fn((id: number) => {
      callbacks.delete(id);
    });
    vi.stubGlobal('cancelAnimationFrame', cancelSpy);

    const { rerender } = render(
      <ConversationsHost
        activeThreadId="thread-1"
        runs={[createRun('1')]}
        queuedMessages={EMPTY_QUEUE}
        reminders={EMPTY_REMINDERS}
        hydrationComplete
        isRunsInfoCollapsed={false}
      />,
    );

    await act(async () => {
      rerender(
        <ConversationsHost
          activeThreadId="thread-2"
          runs={[createRun('2')]}
          queuedMessages={EMPTY_QUEUE}
          reminders={EMPTY_REMINDERS}
          hydrationComplete
          isRunsInfoCollapsed={false}
        />,
      );
      await Promise.resolve();
    });

    await act(async () => {
      rerender(
        <ConversationsHost
          activeThreadId="thread-1"
          runs={[createRun('1')]}
          queuedMessages={EMPTY_QUEUE}
          reminders={EMPTY_REMINDERS}
          hydrationComplete
          isRunsInfoCollapsed={false}
        />,
      );
      await Promise.resolve();
    });

    const pendingIds = Array.from(callbacks.keys());
    expect(pendingIds.length).toBeGreaterThan(0);
    const frameIdForThread1 = pendingIds[0];

    for (let index = 3; index <= 12; index += 1) {
      const threadId = `thread-${index}`;
      await act(async () => {
        rerender(
          <ConversationsHost
            activeThreadId={threadId}
            runs={[createRun(String(index))]}
            queuedMessages={EMPTY_QUEUE}
            reminders={EMPTY_REMINDERS}
            hydrationComplete
            isRunsInfoCollapsed={false}
          />,
        );
        await Promise.resolve();
      });
    }

    expect(cancelSpy.mock.calls.flat()).toContain(frameIdForThread1);
    expect(callbacks.has(frameIdForThread1)).toBe(false);

    await act(async () => {
      rerender(
        <ConversationsHost
          activeThreadId="thread-1"
          runs={[createRun('1')]}
          queuedMessages={EMPTY_QUEUE}
          reminders={EMPTY_REMINDERS}
          hydrationComplete
          isRunsInfoCollapsed={false}
        />,
      );
      await Promise.resolve();
    });

    const refreshedSpies = conversationMockModule.__conversationHandleSpies.get('thread-1');
    expect(refreshedSpies?.restore).not.toHaveBeenCalled();
  });

  it('marks only the active conversation as visible', async () => {
    const { rerender } = render(
      <ConversationsHost
        activeThreadId="thread-a"
        runs={[createRun('a')]}
        queuedMessages={EMPTY_QUEUE}
        reminders={EMPTY_REMINDERS}
        hydrationComplete
        isRunsInfoCollapsed={false}
      />,
    );

    await act(async () => {
      rerender(
        <ConversationsHost
          activeThreadId="thread-b"
          runs={[createRun('b')]}
          queuedMessages={EMPTY_QUEUE}
          reminders={EMPTY_REMINDERS}
          hydrationComplete
          isRunsInfoCollapsed={false}
        />,
      );
      await Promise.resolve();
    });

    const activeConversation = screen.getByTestId('conversation-thread-b');
    const inactiveConversation = screen.getByTestId('conversation-thread-a');

    expect(activeConversation.getAttribute('data-active')).toBe('true');
    expect(inactiveConversation.getAttribute('data-active')).toBe('false');

    const activeContainer = screen.getByTestId('conversation-host-item-thread-b');
    const inactiveContainer = screen.getByTestId('conversation-host-item-thread-a');

    expect(activeContainer).toHaveClass('visible', 'opacity-100', 'pointer-events-auto');
    expect(inactiveContainer).toHaveClass('invisible', 'opacity-0', 'pointer-events-none');
  });

  it('captures and restores scroll state for cached conversations', async () => {
    const { rerender } = render(
      <ConversationsHost
        activeThreadId="thread-a"
        runs={[createRun('a')]}
        queuedMessages={EMPTY_QUEUE}
        reminders={EMPTY_REMINDERS}
        hydrationComplete
        isRunsInfoCollapsed={false}
      />,
    );

    await act(async () => {
      rerender(
        <ConversationsHost
          activeThreadId="thread-b"
          runs={[createRun('b')]}
          queuedMessages={EMPTY_QUEUE}
          reminders={EMPTY_REMINDERS}
          hydrationComplete
          isRunsInfoCollapsed={false}
        />,
      );
      await Promise.resolve();
    });

    const spiesForA = conversationMockModule.__conversationHandleSpies.get('thread-a');
    expect(spiesForA).toBeDefined();
    expect(spiesForA?.capture).toHaveBeenCalledTimes(1);
    const capturedState = await spiesForA!.capture.mock.results[0].value;
    expect(capturedState).toMatchObject({ index: expect.any(Number), offset: 4, scrollTop: 42 });

    await act(async () => {
      rerender(
        <ConversationsHost
          activeThreadId="thread-a"
          runs={[createRun('a')]}
          queuedMessages={EMPTY_QUEUE}
          reminders={EMPTY_REMINDERS}
          hydrationComplete
          isRunsInfoCollapsed={false}
        />,
      );
      await Promise.resolve();
    });

    const refreshedSpiesForA = conversationMockModule.__conversationHandleSpies.get('thread-a');
    expect(refreshedSpiesForA?.restore).toHaveBeenCalledTimes(1);
    expect(refreshedSpiesForA?.restore).toHaveBeenCalledWith(
      expect.objectContaining({ index: expect.any(Number), offset: 4, scrollTop: 42 }),
      { showLoader: false },
    );
  });

  it('reuses cached at-bottom state and hydration flags on reactivation', async () => {
    const { rerender } = render(
      <ConversationsHost
        activeThreadId="thread-a"
        runs={[createRun('a')]}
        queuedMessages={EMPTY_QUEUE}
        reminders={EMPTY_REMINDERS}
        hydrationComplete
        isRunsInfoCollapsed={false}
      />,
    );

    conversationMockModule.__conversationSetAtBottom('thread-a', false);

    await act(async () => {
      rerender(
        <ConversationsHost
          activeThreadId="thread-b"
          runs={[createRun('b')]}
          queuedMessages={EMPTY_QUEUE}
          reminders={EMPTY_REMINDERS}
          hydrationComplete
          isRunsInfoCollapsed={false}
        />,
      );
      await Promise.resolve();
    });

    conversationMockModule.__conversationMock.mockClear();

    await act(async () => {
      rerender(
        <ConversationsHost
          activeThreadId="thread-a"
          runs={[createRun('a')]}
          queuedMessages={EMPTY_QUEUE}
          reminders={EMPTY_REMINDERS}
          hydrationComplete={false}
          isRunsInfoCollapsed={false}
        />,
      );
      await Promise.resolve();
    });

    const callsForA = conversationMockModule.__conversationMock.mock.calls.filter(
      ([props]) => props.threadId === 'thread-a',
    );
    expect(callsForA.length).toBeGreaterThan(0);
    const latestProps = callsForA[callsForA.length - 1]?.[0];
    expect(latestProps?.atBottomAtOpen).toBe(false);
    expect(latestProps?.hydrationComplete).toBe(true);
  });

  it('skips restore when no cached scroll state is available', async () => {
    const { rerender } = render(
      <ConversationsHost
        activeThreadId="thread-a"
        runs={[createRun('a')]}
        queuedMessages={EMPTY_QUEUE}
        reminders={EMPTY_REMINDERS}
        hydrationComplete
        isRunsInfoCollapsed={false}
      />,
    );

    const spiesForA = conversationMockModule.__conversationHandleSpies.get('thread-a');
    expect(spiesForA).toBeDefined();
    spiesForA?.capture.mockResolvedValueOnce(null);

    await act(async () => {
      rerender(
        <ConversationsHost
          activeThreadId="thread-b"
          runs={[createRun('b')]}
          queuedMessages={EMPTY_QUEUE}
          reminders={EMPTY_REMINDERS}
          hydrationComplete
          isRunsInfoCollapsed={false}
        />,
      );
      await Promise.resolve();
    });

    await act(async () => {
      rerender(
        <ConversationsHost
          activeThreadId="thread-a"
          runs={[createRun('a')]}
          queuedMessages={EMPTY_QUEUE}
          reminders={EMPTY_REMINDERS}
          hydrationComplete
          isRunsInfoCollapsed={false}
        />,
      );
      await Promise.resolve();
    });

    const refreshedSpiesForA = conversationMockModule.__conversationHandleSpies.get('thread-a');
    expect(refreshedSpiesForA?.restore).not.toHaveBeenCalled();
  });

  it('retries queued restores once the conversation handle reattaches', async () => {
    vi.unstubAllGlobals();
    let rafId = 0;
    const callbacks = new Map<number, FrameRequestCallback>();
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      const id = ++rafId;
      callbacks.set(id, callback);
      return id;
    });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => {
      callbacks.delete(id);
    });
    const flushAll = () => {
      while (callbacks.size > 0) {
        const pending = Array.from(callbacks.values());
        callbacks.clear();
        pending.forEach((cb) => cb(0));
      }
    };

    const { rerender } = render(
      <ConversationsHost
        activeThreadId="thread-1"
        runs={[createRun('1')]}
        queuedMessages={EMPTY_QUEUE}
        reminders={EMPTY_REMINDERS}
        hydrationComplete
        isRunsInfoCollapsed={false}
      />,
    );

    await act(async () => {
      rerender(
        <ConversationsHost
          activeThreadId="thread-2"
          runs={[createRun('2')]}
          queuedMessages={EMPTY_QUEUE}
          reminders={EMPTY_REMINDERS}
          hydrationComplete
          isRunsInfoCollapsed={false}
        />,
      );
      await Promise.resolve();
    });

    const spiesForThread1 = conversationMockModule.__conversationHandleSpies.get('thread-1');
    expect(spiesForThread1).toBeDefined();
    await spiesForThread1!.capture.mock.results[0].value;

    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      rerender(
        <ConversationsHost
          activeThreadId="thread-1"
          runs={[createRun('1')]}
          queuedMessages={EMPTY_QUEUE}
          reminders={EMPTY_REMINDERS}
          hydrationComplete
          isRunsInfoCollapsed={false}
        />,
      );
      await Promise.resolve();
    });

    conversationMockModule.__conversationSetHandleExposure('thread-1', false);

    await act(async () => {
      rerender(
        <ConversationsHost
          activeThreadId="thread-1"
          runs={[createRun('1')]}
          queuedMessages={EMPTY_QUEUE}
          reminders={EMPTY_REMINDERS}
          hydrationComplete
          isRunsInfoCollapsed={false}
        />,
      );
      await Promise.resolve();
    });

    flushAll();

    const hiddenHandle = conversationMockModule.__conversationHandleSpies.get('thread-1');
    expect(hiddenHandle?.restore).not.toHaveBeenCalled();

    conversationMockModule.__conversationSetHandleExposure('thread-1', true);

    await act(async () => {
      rerender(
        <ConversationsHost
          activeThreadId="thread-1"
          runs={[createRun('1')]}
          queuedMessages={EMPTY_QUEUE}
          reminders={EMPTY_REMINDERS}
          hydrationComplete
          isRunsInfoCollapsed={false}
        />,
      );
      await Promise.resolve();
    });

    flushAll();

    const restoredHandle = conversationMockModule.__conversationHandleSpies.get('thread-1');
    expect(restoredHandle?.restore).toHaveBeenCalledTimes(1);
    expect(restoredHandle?.restore).toHaveBeenCalledWith(
      expect.objectContaining({ index: expect.any(Number), offset: 4, scrollTop: 42 }),
      { showLoader: false },
    );
  });
});
