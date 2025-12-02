import {
  type ReactNode,
  useMemo,
  useRef,
  useState,
  useEffect,
  useLayoutEffect,
  useCallback,
  forwardRef,
  useImperativeHandle,
} from 'react';
import { Loader2 } from 'lucide-react';
import { debugConversation } from '@/lib/debug';
import { waitForStableScrollHeight } from './agents/waitForStableScrollHeight';
import {
  VirtualizedList,
  type VirtualizedListHandle,
  type VirtualizedListScrollPosition,
} from './VirtualizedList';
import { Message, type MessageRole } from './Message';
import { RunInfo } from './RunInfo';
import { QueuedMessage } from './QueuedMessage';
import { Reminder } from './Reminder';
import { StatusIndicator, type Status } from './StatusIndicator';

export interface ConversationMessage {
  id: string;
  role: MessageRole;
  content: ReactNode;
  timestamp?: string;
}

export interface Run {
  id: string;
  messages: ConversationMessage[];
  status: 'finished' | 'running' | 'failed' | 'pending';
  duration?: string;
  tokens?: number;
  cost?: string;
  timelineHref?: string;
  onViewRun?: (runId: string) => void;
}

export interface QueuedMessageData {
  id: string;
  content: ReactNode;
}

export interface ReminderData {
  id: string;
  content: ReactNode;
  scheduledTime: string;
  date?: string;
}

interface ConversationProps {
  threadId: string;
  runs: Run[];
  hydrationComplete: boolean;
  isActive: boolean;
  queuedMessages?: QueuedMessageData[];
  reminders?: ReminderData[];
  header?: ReactNode;
  footer?: ReactNode;
  className?: string;
  defaultCollapsed?: boolean;
  collapsed?: boolean;
  atBottomAtOpen?: boolean;
  testId?: string | null;
}

type ConversationListItem =
  | { type: 'run'; run: Run; runIndex: number }
  | { type: 'queue' }
  | { type: 'spacer' };

export interface ConversationScrollState {
  index?: number;
  offset?: number;
  scrollTop?: number;
  atBottom?: boolean;
}

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

const normalizeCapturedState = (
  position: VirtualizedListScrollPosition | null,
  atBottom: boolean,
): ConversationScrollState | null => {
  if (!position) {
    return atBottom ? { atBottom: true } : null;
  }

  const rawIndex = (position as { index?: number; topIndex?: number }).index ?? (position as { index?: number; topIndex?: number }).topIndex;
  const rawOffset = (position as { offset?: number }).offset;
  const rawScrollTop = (position as { scrollTop?: number }).scrollTop;
  const rawAtBottom = (position as { atBottom?: boolean }).atBottom;

  const next: ConversationScrollState = {};
  if (isFiniteNumber(rawIndex)) {
    next.index = rawIndex;
  }
  if (isFiniteNumber(rawOffset) && next.index !== undefined) {
    next.offset = rawOffset;
  }
  if (isFiniteNumber(rawScrollTop)) {
    next.scrollTop = rawScrollTop;
  }
  if (rawAtBottom === true || atBottom) {
    next.atBottom = true;
  }

  if (next.index === undefined && next.scrollTop === undefined && !next.atBottom) {
    return null;
  }

  return next;
};

const sanitizeRestoreState = (state: ConversationScrollState | null): ConversationScrollState | null => {
  if (!state) return null;

  const next: ConversationScrollState = {};
  if (isFiniteNumber(state.index)) {
    next.index = state.index;
  }
  if (isFiniteNumber(state.offset) && next.index !== undefined) {
    next.offset = state.offset;
  }
  if (isFiniteNumber(state.scrollTop)) {
    next.scrollTop = state.scrollTop;
  }
  if (state.atBottom) {
    next.atBottom = true;
  }

  if (next.index === undefined && next.scrollTop === undefined && !next.atBottom) {
    return null;
  }

  return next;
};

export interface ConversationHandle {
  captureScrollState: () => Promise<ConversationScrollState | null>;
  restoreScrollState: (state: ConversationScrollState | null, options?: { showLoader?: boolean }) => void;
  isAtBottom: () => boolean;
}

export const Conversation = forwardRef<ConversationHandle, ConversationProps>(function ConversationComponent({
  threadId,
  runs,
  hydrationComplete,
  isActive,
  queuedMessages = [],
  reminders = [],
  header,
  footer,
  className = '',
  defaultCollapsed = false,
  collapsed,
  atBottomAtOpen = true,
  testId,
}: ConversationProps, ref) {
  const messagesRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const listHandleRef = useRef<VirtualizedListHandle | null>(null);
  const scrollRequestIdRef = useRef(0);
  const rafIdRef = useRef<number | null>(null);
  const pendingRestoreRef = useRef<ConversationScrollState | null>(null);
  const restoreFrameRef = useRef<number | null>(null);
  const initialScrollRequestedRef = useRef(false);
  const initialScrollCompletedRef = useRef(false);
  const isAtBottomRef = useRef(true);
  const prevTotalMessageCountRef = useRef(0);
  const previousThreadIdRef = useRef<string | null>(threadId);
  const [runHeights, setRunHeights] = useState<Map<string, number>>(new Map());
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [isLoaderVisible, setIsLoaderVisible] = useState(() => isActive && !hydrationComplete);
  const committedRunHeightsRef = useRef<Map<string, number>>(new Map());
  const runHeightBufferRef = useRef<Map<string, number>>(new Map());
  const runHeightFrameRef = useRef<number | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const allowAutoFollowRef = useRef(atBottomAtOpen !== false);
  const loaderSuppressedRef = useRef(false);

  const isCollapsed = collapsed ?? defaultCollapsed;
  const hasQueueOrReminders = queuedMessages.length > 0 || reminders.length > 0;
  const totalMessageCount = useMemo(() => runs.reduce((sum, run) => sum + run.messages.length, 0), [runs]);

  const conversationItems = useMemo<ConversationListItem[]>(() => {
    const items: ConversationListItem[] = runs.map((run, index) => ({ type: 'run', run, runIndex: index }));
    if (hasQueueOrReminders) {
      items.push({ type: 'queue' });
    }
    items.push({ type: 'spacer' });
    return items;
  }, [runs, hasQueueOrReminders]);

  const restorableItemCount = useMemo(() => {
    let count = 0;
    for (const item of conversationItems) {
      if (item.type !== 'spacer') {
        count += 1;
      }
    }
    return count;
  }, [conversationItems]);

  const handleMeasuredHeight = useCallback((runId: string, height: number) => {
    const normalized = Math.max(0, Math.round(height));
    runHeightBufferRef.current.set(runId, normalized);
    if (runHeightFrameRef.current !== null) {
      return;
    }
    runHeightFrameRef.current = requestAnimationFrame(() => {
      runHeightFrameRef.current = null;
      if (runHeightBufferRef.current.size === 0) {
        return;
      }
      let changed = false;
      const next = new Map(committedRunHeightsRef.current);
      for (const [id, value] of runHeightBufferRef.current.entries()) {
        if (next.get(id) !== value) {
          next.set(id, value);
          changed = true;
        }
      }
      runHeightBufferRef.current.clear();
      if (changed) {
        committedRunHeightsRef.current = next;
        setRunHeights(next);
      }
    });
  }, [setRunHeights]);

  useEffect(() => {
    const presentIds = new Set(runs.map((run) => run.id));
    let changed = false;
    const next = new Map<string, number>();
    for (const [runId, height] of committedRunHeightsRef.current.entries()) {
      if (presentIds.has(runId)) {
        next.set(runId, height);
      } else {
        changed = true;
      }
    }
    if (changed) {
      committedRunHeightsRef.current = next;
      setRunHeights(next);
    }

    for (const key of Array.from(runHeightBufferRef.current.keys())) {
      if (!presentIds.has(key)) {
        runHeightBufferRef.current.delete(key);
      }
    }

    for (const key of Array.from(messagesRefs.current.keys())) {
      if (!presentIds.has(key)) {
        const element = messagesRefs.current.get(key);
        if (element && resizeObserverRef.current) {
          resizeObserverRef.current.unobserve(element);
        }
        messagesRefs.current.delete(key);
      }
    }
  }, [runs]);

  useEffect(() => {
    if (typeof ResizeObserver !== 'undefined') {
      return;
    }
    const next = new Map<string, number>();
    for (const run of runs) {
      const element = messagesRefs.current.get(run.id);
      if (element) {
        next.set(run.id, element.offsetHeight);
      }
    }
    committedRunHeightsRef.current = next;
    setRunHeights(next);
  }, [runs]);

  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') {
      return;
    }
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const target = entry.target as HTMLElement;
        const runId = target.dataset.runId;
        if (!runId) {
          continue;
        }
        const borderBox = entry.borderBoxSize;
        let blockSize: number | undefined;
        if (Array.isArray(borderBox)) {
          const first = borderBox[0] as { blockSize?: number } | undefined;
          if (typeof first?.blockSize === 'number' && Number.isFinite(first.blockSize)) {
            blockSize = first.blockSize;
          }
        } else if (borderBox) {
          const single = borderBox as { blockSize?: number };
          if (typeof single.blockSize === 'number' && Number.isFinite(single.blockSize)) {
            blockSize = single.blockSize;
          }
        }
        const fallbackHeight = Number.isFinite(entry.contentRect.height) ? entry.contentRect.height : undefined;
        const height = blockSize ?? fallbackHeight ?? 0;
        handleMeasuredHeight(runId, height);
      }
    });
    resizeObserverRef.current = observer;
    for (const [runId, element] of messagesRefs.current.entries()) {
      element.dataset.runId = runId;
      observer.observe(element);
    }
    return () => {
      observer.disconnect();
      resizeObserverRef.current = null;
    };
  }, [handleMeasuredHeight]);

  useLayoutEffect(() => {
    const scroller = listHandleRef.current?.getScrollerElement();
    if (!scroller) return;
    scroller.style.overflowAnchor = 'none';
    scroller.style.scrollBehavior = 'auto';
  }, [conversationItems.length]);

  useEffect(() => {
    if (previousThreadIdRef.current !== threadId) {
      previousThreadIdRef.current = threadId;
      prevTotalMessageCountRef.current = totalMessageCount;
      pendingRestoreRef.current = null;
      if (restoreFrameRef.current !== null) {
        cancelAnimationFrame(restoreFrameRef.current);
        restoreFrameRef.current = null;
      }
    }
  }, [threadId, totalMessageCount]);

  useEffect(() => {
    allowAutoFollowRef.current = atBottomAtOpen !== false;
  }, [atBottomAtOpen, threadId]);

  useEffect(
    () => () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
      }
      if (restoreFrameRef.current !== null) {
        cancelAnimationFrame(restoreFrameRef.current);
      }
      if (runHeightFrameRef.current !== null) {
        cancelAnimationFrame(runHeightFrameRef.current);
        runHeightFrameRef.current = null;
      }
    },
    [],
  );

  const scrollToBottom = useCallback(async () => {
    const handle = listHandleRef.current;
    if (!handle) {
      debugConversation('conversation.scroll.skip-no-handle', () => ({ threadId }));
      return;
    }
    if (conversationItems.length === 0) {
      debugConversation('conversation.scroll.skip-empty', () => ({ threadId }));
      return;
    }

    const requestId = scrollRequestIdRef.current + 1;
    const scroller = handle.getScrollerElement();
    scrollRequestIdRef.current = requestId;
    if (!scroller) {
      debugConversation('conversation.scroll.missing-scroller', () => ({ threadId, requestId }));
    }

    if (scroller) {
      debugConversation('conversation.scroll.wait-for-stable', () => ({ threadId, requestId }));
      await waitForStableScrollHeight(scroller);
      if (scrollRequestIdRef.current !== requestId) {
        debugConversation('conversation.scroll.abort.wait-mismatch', () => ({ threadId, requestId, latest: scrollRequestIdRef.current }));
        return;
      }
    }

    await new Promise<void>((resolve) => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      rafIdRef.current = requestAnimationFrame(() => {
        if (scrollRequestIdRef.current !== requestId) {
          debugConversation('conversation.scroll.abort.frame-mismatch', () => ({ threadId, requestId, latest: scrollRequestIdRef.current }));
          resolve();
          return;
        }
        debugConversation('conversation.scroll.apply-bottom', () => ({ threadId, requestId, itemCount: conversationItems.length }));
        handle.scrollToIndex({ index: conversationItems.length - 1, align: 'end', behavior: 'auto' });
        rafIdRef.current = null;
        resolve();
      });
    });
  }, [conversationItems.length, threadId]);

  useEffect(() => {
    if (!isActive) {
      loaderSuppressedRef.current = false;
      setIsLoaderVisible(false);
      return;
    }

    if (!hydrationComplete) {
      if (!initialScrollCompletedRef.current && !loaderSuppressedRef.current) {
        setIsLoaderVisible(true);
      }
      return;
    }

    if (pendingRestoreRef.current) {
      if (!loaderSuppressedRef.current) {
        setIsLoaderVisible(true);
      }
      return;
    }

    if (initialScrollCompletedRef.current) {
      if (!loaderSuppressedRef.current) {
        setIsLoaderVisible(false);
      }
      return;
    }

    if (!initialScrollRequestedRef.current) {
      if (totalMessageCount === 0 && !hasQueueOrReminders) {
        initialScrollRequestedRef.current = true;
        initialScrollCompletedRef.current = true;
        loaderSuppressedRef.current = false;
        setIsLoaderVisible(false);
        return;
      }

      initialScrollRequestedRef.current = true;

      if (!allowAutoFollowRef.current) {
        initialScrollCompletedRef.current = true;
        loaderSuppressedRef.current = false;
        setIsLoaderVisible(false);
        return;
      }

      if (!loaderSuppressedRef.current) {
        setIsLoaderVisible(true);
      }
      void scrollToBottom();
      return;
    }

    if (isAtBottom) {
      initialScrollCompletedRef.current = true;
      loaderSuppressedRef.current = false;
      setIsLoaderVisible(false);
    }
  }, [hasQueueOrReminders, hydrationComplete, isActive, isAtBottom, scrollToBottom, totalMessageCount]);

  useEffect(() => {
    if (!hydrationComplete || !isActive) {
      prevTotalMessageCountRef.current = totalMessageCount;
      return;
    }

    if (
      totalMessageCount > prevTotalMessageCountRef.current &&
      initialScrollCompletedRef.current &&
      isAtBottomRef.current &&
      allowAutoFollowRef.current
    ) {
      void scrollToBottom();
    }

    prevTotalMessageCountRef.current = totalMessageCount;
  }, [hydrationComplete, isActive, totalMessageCount, scrollToBottom]);

  const handleAtBottomChange = useCallback(
    (value: boolean) => {
      isAtBottomRef.current = value;
      setIsAtBottom(value);
      if (
        isActive &&
        hydrationComplete &&
        initialScrollRequestedRef.current &&
        !initialScrollCompletedRef.current
      ) {
        initialScrollCompletedRef.current = true;
        setIsLoaderVisible(false);
      }
    },
    [hydrationComplete, isActive],
  );

  const tryApplyPendingRestore = useCallback(async (): Promise<boolean> => {
    const state = pendingRestoreRef.current;
    if (!state) {
      debugConversation('conversation.restore.no-pending', () => ({ threadId }));
      return true;
    }

    const handle = listHandleRef.current;
    if (!handle) {
      debugConversation('conversation.restore.wait-handle', () => ({ threadId }));
      return false;
    }

    const itemsLength = conversationItems.length;
    if (restorableItemCount === 0) {
      debugConversation('conversation.restore.wait-items', () => ({ threadId, itemsLength }));
      return false;
    }

    const scroller = handle.getScrollerElement();
    if (!scroller) {
      debugConversation('conversation.restore.wait-scroller', () => ({ threadId }));
      return false;
    }

    debugConversation('conversation.restore.await-height', () => ({ threadId }));
    await waitForStableScrollHeight(scroller);

    if (pendingRestoreRef.current !== state) {
      debugConversation('conversation.restore.changed', () => ({ threadId }));
      return true;
    }

    const idx = Number.isFinite(state.index) ? Math.floor(state.index as number) : undefined;
    const clampedIndex = typeof idx === 'number' ? Math.max(0, Math.min(itemsLength - 1, idx)) : undefined;
    const top = Number.isFinite(state.scrollTop) ? (state.scrollTop as number) : undefined;
    const offset = Number.isFinite(state.offset) ? Math.max(0, state.offset as number) : undefined;
    const wasAtBottom = state.atBottom === true;

    let applied = false;

    if (typeof clampedIndex === 'number') {
      const location: { index: number; align: 'start'; behavior: 'auto'; offset?: number } = {
        index: clampedIndex,
        align: 'start',
        behavior: 'auto',
      };
      if (typeof offset === 'number') {
        location.offset = offset;
      }
      debugConversation('conversation.restore.apply-index', () => ({ threadId, location }));
      handle.scrollToIndex(location);
      applied = true;
    } else if (typeof top === 'number') {
      debugConversation('conversation.restore.apply-scrolltop', () => ({ threadId, top }));
      handle.scrollTo({ top, behavior: 'auto' });
      applied = true;
    } else if (wasAtBottom) {
      debugConversation('conversation.restore.apply-bottom', () => ({ threadId }));
      handle.scrollToIndex({ index: itemsLength - 1, align: 'end', behavior: 'auto' });
      applied = true;
    } else {
      debugConversation('conversation.restore.no-op', () => ({ threadId }));
    }

    if (!applied) {
      pendingRestoreRef.current = null;
      initialScrollRequestedRef.current = true;
      initialScrollCompletedRef.current = true;
      setIsLoaderVisible(false);
      loaderSuppressedRef.current = false;
      debugConversation('conversation.restore.complete', () => ({ threadId, skipped: true }));
      return true;
    }

    pendingRestoreRef.current = null;
    initialScrollRequestedRef.current = true;
    initialScrollCompletedRef.current = true;
    setIsLoaderVisible(false);
    loaderSuppressedRef.current = false;
    debugConversation('conversation.restore.complete', () => ({ threadId }));
    return true;
  }, [conversationItems, restorableItemCount, threadId]);

  const schedulePendingRestore = useCallback(() => {
    if (!pendingRestoreRef.current) {
      return;
    }
    if (restoreFrameRef.current !== null) {
      cancelAnimationFrame(restoreFrameRef.current);
    }
    debugConversation('conversation.restore.schedule', () => ({ threadId }));
    restoreFrameRef.current = requestAnimationFrame(() => {
      restoreFrameRef.current = null;
      debugConversation('conversation.restore.frame', () => ({ threadId }));
      void tryApplyPendingRestore().catch((error) => {
        debugConversation('conversation.restore.error', () => ({ threadId, error }));
      });
    });
  }, [threadId, tryApplyPendingRestore]);

  useEffect(() => {
    if (pendingRestoreRef.current && conversationItems.length > 0) {
      schedulePendingRestore();
    }
  }, [conversationItems.length, schedulePendingRestore]);

  useEffect(() => {
    if (pendingRestoreRef.current && isActive) {
      schedulePendingRestore();
    }
  }, [isActive, schedulePendingRestore]);

  const getItemKey = useCallback((item: ConversationListItem) => {
    if (item.type === 'run') return item.run.id;
    if (item.type === 'queue') return 'queue-section';
    return 'spacer';
  }, []);

  const getMessageContainerRef = useCallback(
    (runId: string) =>
      (element: HTMLDivElement | null) => {
        if (element) {
          element.dataset.runId = runId;
          messagesRefs.current.set(runId, element);
          const observer = resizeObserverRef.current;
          if (observer) {
            observer.observe(element);
          } else if (typeof ResizeObserver === 'undefined') {
            handleMeasuredHeight(runId, element.offsetHeight);
          }
        } else {
          const existing = messagesRefs.current.get(runId);
          if (existing && resizeObserverRef.current) {
            resizeObserverRef.current.unobserve(existing);
          }
          messagesRefs.current.delete(runId);
          runHeightBufferRef.current.delete(runId);
        }
      },
    [handleMeasuredHeight],
  );

  const renderItem = useCallback(
    (_index: number, item: ConversationListItem) => {
      if (item.type === 'run') {
        const { run, runIndex } = item;
        return (
          <div className="min-w-0">
            {runIndex > 0 ? <div className="border-t border-[var(--agyn-border-subtle)]" /> : null}
            <div className="flex min-w-0">
              <div className="flex-1 min-w-0 px-6 pt-6 pb-2">
                <div className="min-w-0" ref={getMessageContainerRef(run.id)}>
                  {run.messages.map((message) => (
                    <Message
                      key={message.id}
                      role={message.role}
                      content={message.content}
                      timestamp={message.timestamp}
                    />
                  ))}
                </div>
              </div>
              <div
                className={`flex-shrink-0 border-l border-[var(--agyn-border-subtle)] bg-[var(--agyn-bg-light)]/50 relative transition-[width] ${isCollapsed ? 'w-8' : 'w-[150px]'}`}
              >
                <div className={isCollapsed ? 'pt-6 pb-6 flex items-center justify-center' : 'pt-6 px-3 pb-6'}>
                  {isCollapsed ? (
                    <div
                      className="relative w-full"
                      style={{ height: `${runHeights.get(run.id) || 0}px` }}
                    >
                      <div className="sticky flex justify-center" style={{ top: '21px' }}>
                        <StatusIndicator status={run.status as Status} size="sm" />
                      </div>
                    </div>
                  ) : (
                    <RunInfo
                      runId={run.id}
                      status={run.status}
                      duration={run.duration}
                      tokens={run.tokens}
                      cost={run.cost}
                      height={runHeights.get(run.id) || 0}
                      runLink={run.timelineHref}
                      onViewRun={run.onViewRun}
                    />
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      }

      if (item.type === 'queue') {
        return (
          <div className="flex min-w-0">
            <div className="flex-1 min-w-0 px-6 pb-6">
              <div className="pt-6 min-w-0">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-8 border-t border-[var(--agyn-border-subtle)]" />
                  <span className="text-xs text-[var(--agyn-gray)] tracking-wider">PENDING</span>
                  <div className="flex-1 border-t border-[var(--agyn-border-subtle)]" />
                </div>
                <div className="space-y-3">
                  {queuedMessages.map((msg) => (
                    <QueuedMessage key={msg.id} content={msg.content} />
                  ))}
                  {reminders.map((reminder) => (
                    <Reminder
                      key={reminder.id}
                      content={reminder.content}
                      scheduledTime={reminder.scheduledTime}
                      date={reminder.date}
                    />
                  ))}
                </div>
              </div>
            </div>
            <div
              className={`flex-shrink-0 border-l border-[var(--agyn-border-subtle)] bg-[var(--agyn-bg-light)]/50 transition-[width] ${isCollapsed ? 'w-8' : 'w-[150px]'}`}
            />
          </div>
        );
      }

      return (
        <div className="flex-1 flex">
          <div className="flex-1" />
          <div
            className={`flex-shrink-0 border-l border-[var(--agyn-border-subtle)] bg-[var(--agyn-bg-light)]/50 transition-[width] ${isCollapsed ? 'w-8' : 'w-[150px]'}`}
          />
        </div>
      );
    },
    [getMessageContainerRef, isCollapsed, queuedMessages, reminders, runHeights],
  );

  useImperativeHandle(
    ref,
    () => ({
      captureScrollState: async () => {
        const handle = listHandleRef.current;
        if (!handle) {
          debugConversation('conversation.capture.skip', () => ({ threadId, reason: 'no-handle' }));
          return null;
        }
        const position = await handle.captureScrollPosition();
        const normalized = normalizeCapturedState(position, handle.isAtBottom());
        debugConversation('conversation.capture.result', () => ({ threadId, normalized }));
        return normalized;
      },
      restoreScrollState: (state, options) => {
        const normalized = sanitizeRestoreState(state);
        if (!normalized) {
          debugConversation('conversation.restore.skip', () => ({ threadId, provided: state }));
          pendingRestoreRef.current = null;
          loaderSuppressedRef.current = false;
          return;
        }

        const showLoader = options?.showLoader ?? true;
        debugConversation('conversation.restore.enqueue', () => ({ threadId, normalized, showLoader }));
        pendingRestoreRef.current = normalized;
        initialScrollRequestedRef.current = true;
        initialScrollCompletedRef.current = false;
        if (showLoader) {
          loaderSuppressedRef.current = false;
          if (isActive) {
            setIsLoaderVisible(true);
          }
        } else {
          loaderSuppressedRef.current = true;
          if (isActive) {
            setIsLoaderVisible(false);
          }
        }
        schedulePendingRestore();
      },
      isAtBottom: () => isAtBottomRef.current,
    }),
    [isActive, schedulePendingRestore, threadId],
  );

  return (
    <div
      className={`flex flex-col h-full bg-white rounded-[10px] border border-[var(--agyn-border-subtle)] overflow-hidden ${className}`}
      data-testid={testId === null ? undefined : testId ?? 'conversation'}
      data-thread-id={threadId}
      data-hydrated={hydrationComplete ? 'true' : 'false'}
    >
      {header ? (
        <div className="px-6 py-4 border-b border-[var(--agyn-border-subtle)] bg-[var(--agyn-bg-light)]">{header}</div>
      ) : null}

      <div className="relative flex-1 min-h-0 min-w-0">
        <VirtualizedList
          ref={(handle) => {
            listHandleRef.current = handle;
            if (handle && pendingRestoreRef.current) {
              schedulePendingRestore();
            }
          }}
          items={conversationItems}
          renderItem={renderItem}
          getItemKey={getItemKey}
          className="h-full"
          style={{ height: '100%' }}
          onAtBottomChange={handleAtBottomChange}
        />

        {isActive && isLoaderVisible ? (
          <div
            className="pointer-events-none absolute inset-0 flex items-center justify-center bg-white/80"
            data-testid="conversation-loader"
          >
            <Loader2 className="h-5 w-5 animate-spin text-[var(--agyn-gray)]" />
          </div>
        ) : null}
      </div>

      {footer ? (
        <div className="px-6 py-4 border-t border-[var(--agyn-border-subtle)] bg-[var(--agyn-bg-light)]">{footer}</div>
      ) : null}
    </div>
  );
});
