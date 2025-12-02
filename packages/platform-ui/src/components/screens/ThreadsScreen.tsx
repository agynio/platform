import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { debugConversation } from '@/lib/debug';
import { formatDistanceToNow } from 'date-fns';
import { Play, Container, Bell, Send, PanelRightClose, PanelRight, Loader2, MessageSquarePlus, Terminal } from 'lucide-react';
import { AutocompleteInput, type AutocompleteInputHandle, type AutocompleteOption } from '@/components/AutocompleteInput';
import { Button } from '../Button';
import { IconButton } from '../IconButton';
import { ThreadsList } from '../ThreadsList';
import type { Thread } from '../ThreadItem';
import { SegmentedControl } from '../SegmentedControl';
import {
  Conversation,
  type Run,
  type QueuedMessageData,
  type ReminderData,
  type ConversationHandle,
  type ConversationScrollState,
} from '../Conversation';
import { Popover, PopoverTrigger, PopoverContent } from '../ui/popover';
import { StatusIndicator } from '../StatusIndicator';
import { AutosizeTextarea } from '../AutosizeTextarea';

const THREAD_MESSAGE_MAX_LENGTH = 8000;

interface ThreadsScreenProps {
  threads: Thread[];
  runs: Run[];
  containers: { id: string; name: string; status: 'running' | 'finished' }[];
  reminders: { id: string; title: string; time: string }[];
  filterMode: 'all' | 'open' | 'closed';
  selectedThreadId: string | null;
  selectedThread?: Thread;
  inputValue: string;
  isRunsInfoCollapsed: boolean;
  threadsHasMore?: boolean;
  threadsIsLoading?: boolean;
  isLoading?: boolean;
  isEmpty?: boolean;
  listError?: ReactNode;
  detailError?: ReactNode;
  conversationHydrationComplete?: boolean;
  onFilterModeChange?: (mode: 'all' | 'open' | 'closed') => void;
  onSelectThread?: (threadId: string) => void;
  onToggleRunsInfoCollapsed?: (isCollapsed: boolean) => void;
  onInputValueChange?: (value: string) => void;
  onSendMessage?: (value: string, context: { threadId: string | null }) => void;
  onThreadsLoadMore?: () => void;
  onThreadExpand?: (threadId: string, isExpanded: boolean) => void;
  onCreateDraft?: () => void;
  onToggleThreadStatus?: (threadId: string, nextStatus: 'open' | 'closed') => void;
  isToggleThreadStatusPending?: boolean;
  isSendMessagePending?: boolean;
  onOpenContainerTerminal?: (containerId: string) => void;
  draftMode?: boolean;
  draftRecipientId?: string | null;
  draftRecipientLabel?: string | null;
  draftFetchOptions?: (query: string) => Promise<AutocompleteOption[]>;
  onDraftRecipientChange?: (agentId: string | null, agentTitle: string | null) => void;
  onDraftCancel?: () => void;
  className?: string;
}

type ConversationCacheEntry = {
  runs: Run[];
  queuedMessages: QueuedMessageData[];
  reminders: ReminderData[];
  hydrationComplete: boolean;
  atBottomAtOpen: boolean;
  scrollState?: ConversationScrollState | null;
};

type PendingRestoreEntry = {
  state: ConversationScrollState;
  showLoader: boolean;
};

type ConversationCacheState = {
  order: string[];
  entries: Record<string, ConversationCacheEntry>;
};

interface ConversationsHostProps {
  activeThreadId: string;
  runs: Run[];
  queuedMessages: QueuedMessageData[];
  reminders: ReminderData[];
  hydrationComplete: boolean;
  isRunsInfoCollapsed: boolean;
  className?: string;
  header?: ReactNode;
  footer?: ReactNode;
  defaultCollapsed?: boolean;
  collapsed?: boolean;
}

const MAX_CONVERSATION_CACHE = 10;

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

const sanitizeScrollState = (state: ConversationScrollState | null | undefined): ConversationScrollState | null => {
  if (!state) return null;

  const next: ConversationScrollState = {};

  if (isFiniteNumber(state.index)) {
    next.index = Math.max(0, Math.floor(state.index));
  }

  if (isFiniteNumber(state.offset) && next.index !== undefined) {
    next.offset = Math.max(0, state.offset);
  }

  if (isFiniteNumber(state.scrollTop)) {
    next.scrollTop = Math.max(0, state.scrollTop);
  }

  if (state.atBottom) {
    next.atBottom = true;
  }

  if (next.index === undefined && next.scrollTop === undefined && !next.atBottom) {
    return null;
  }

  return next;
};

export function ConversationsHost({
  activeThreadId,
  runs,
  queuedMessages,
  reminders,
  hydrationComplete,
  isRunsInfoCollapsed,
  className,
  header,
  footer,
  defaultCollapsed,
  collapsed,
}: ConversationsHostProps) {
  const [cache, setCache] = useState<ConversationCacheState>(() => ({
    order: [activeThreadId],
    entries: {
      [activeThreadId]: {
        runs,
        queuedMessages,
        reminders,
        hydrationComplete,
        atBottomAtOpen: true,
        scrollState: null,
      },
    },
  }));
  const cacheRef = useRef(cache);
  const conversationRefs = useRef<Map<string, ConversationHandle>>(new Map());
  const pendingRestoresRef = useRef<Map<string, PendingRestoreEntry>>(new Map());
  const restoreFrameRefs = useRef<Map<string, number>>(new Map());
  const previousActiveRef = useRef<string>(activeThreadId);

  useEffect(() => {
    cacheRef.current = cache;
  }, [cache]);

  useEffect(() => {
    const frameMap = restoreFrameRefs.current;
    const pendingMap = pendingRestoresRef.current;
    const handleMap = conversationRefs.current;
    return () => {
      for (const frameId of frameMap.values()) {
        cancelAnimationFrame(frameId);
      }
      frameMap.clear();
      pendingMap.clear();
      handleMap.clear();
    };
  }, []);

  useEffect(() => {
    setCache((prev) => {
      const entries: Record<string, ConversationCacheEntry> = { ...prev.entries };
      const previousEntry = entries[activeThreadId];
      const preservedState = sanitizeScrollState(previousEntry?.scrollState);
      const atBottomAtOpen = previousEntry?.atBottomAtOpen ?? true;
      const hydrationState = hydrationComplete || Boolean(previousEntry?.hydrationComplete);

      entries[activeThreadId] = {
        runs,
        queuedMessages,
        reminders,
        hydrationComplete: hydrationState,
        atBottomAtOpen,
        scrollState: preservedState,
      };

      debugConversation('conversations-host.cache.refresh', () => ({
        threadId: activeThreadId,
        hadEntry: Boolean(previousEntry),
      }));

      const filtered = prev.order.filter((id) => id !== activeThreadId);
      const nextOrder = [activeThreadId, ...filtered];
      if (nextOrder.length > MAX_CONVERSATION_CACHE) {
        const trimmed = nextOrder.slice(0, MAX_CONVERSATION_CACHE);
        const removed = nextOrder.slice(MAX_CONVERSATION_CACHE);
        const trimmedEntries: Record<string, ConversationCacheEntry> = {};
        for (const id of trimmed) {
          if (entries[id]) {
            trimmedEntries[id] = entries[id];
          }
        }
        for (const id of removed) {
          pendingRestoresRef.current.delete(id);
          conversationRefs.current.delete(id);
          const frameId = restoreFrameRefs.current.get(id);
          if (typeof frameId === 'number') {
            cancelAnimationFrame(frameId);
            restoreFrameRefs.current.delete(id);
          }
          debugConversation('conversations-host.cache.evict', () => ({ threadId: id }));
        }
        return { order: trimmed, entries: trimmedEntries };
      }
      return { order: nextOrder, entries };
    });
  }, [activeThreadId, hydrationComplete, queuedMessages, reminders, runs]);

  const storeScrollState = useCallback((threadId: string, scrollState: ConversationScrollState | null) => {
    const sanitized = sanitizeScrollState(scrollState);
    debugConversation('conversations-host.cache.store', () => ({ threadId, hasState: Boolean(sanitized) }));
    setCache((prev) => {
      const entry = prev.entries[threadId];
      if (!entry) return prev;
      if (entry.scrollState === sanitized) return prev;
      const entries = {
        ...prev.entries,
        [threadId]: {
          ...entry,
          scrollState: sanitized,
        },
      };
      return { order: prev.order, entries };
    });
  }, []);

  const storeAtBottomAtOpen = useCallback((threadId: string, atBottomAtOpen: boolean) => {
    debugConversation('conversations-host.cache.at-bottom', () => ({ threadId, atBottomAtOpen }));
    setCache((prev) => {
      const entry = prev.entries[threadId];
      if (!entry) return prev;
      if (entry.atBottomAtOpen === atBottomAtOpen) return prev;
      const entries = {
        ...prev.entries,
        [threadId]: {
          ...entry,
          atBottomAtOpen,
        },
      };
      return { order: prev.order, entries };
    });
  }, []);

  const captureScrollState = useCallback(
    async (threadId: string) => {
      const handle = conversationRefs.current.get(threadId);
      if (!handle) {
        debugConversation('conversations-host.capture.skip', () => ({ threadId }));
        return;
      }
      const snapshot = await handle.captureScrollState();
      debugConversation('conversations-host.capture.success', () => ({ threadId, hasState: Boolean(snapshot) }));
      storeScrollState(threadId, snapshot);
      storeAtBottomAtOpen(threadId, handle.isAtBottom());
    },
    [storeAtBottomAtOpen, storeScrollState],
  );

  const scheduleRestoreFrame = useCallback((threadId: string, entry: PendingRestoreEntry) => {
    const frames = restoreFrameRefs.current;
    const pending = pendingRestoresRef.current;
    pending.set(threadId, entry);

    const previousFrame = frames.get(threadId);
    if (typeof previousFrame === 'number') {
      cancelAnimationFrame(previousFrame);
    }

    const frameId = requestAnimationFrame(() => {
      frames.delete(threadId);
      const pendingEntry = pending.get(threadId);
      if (!pendingEntry) {
        debugConversation('conversations-host.restore.frame-missing', () => ({ threadId }));
        return;
      }
      const handle = conversationRefs.current.get(threadId);
      if (!handle) {
        debugConversation('conversations-host.restore.defer', () => ({ threadId }));
        return;
      }
      pending.delete(threadId);
      debugConversation('conversations-host.restore.apply', () => ({ threadId, showLoader: pendingEntry.showLoader }));
      handle.restoreScrollState(pendingEntry.state, { showLoader: pendingEntry.showLoader });
    });

    frames.set(threadId, frameId);
    debugConversation('conversations-host.restore.schedule', () => ({ threadId, frameId, showLoader: entry.showLoader }));
  }, []);

  const requestRestore = useCallback(
    (threadId: string, state: ConversationScrollState | null | undefined, options?: { showLoader?: boolean }) => {
      const sanitized = sanitizeScrollState(state);
      if (!sanitized) {
        pendingRestoresRef.current.delete(threadId);
        debugConversation('conversations-host.restore.skip', () => ({ threadId }));
        return;
      }
      const showLoader = options?.showLoader ?? true;
      const handle = conversationRefs.current.get(threadId);
      const entry: PendingRestoreEntry = { state: sanitized, showLoader };
      if (handle) {
        debugConversation('conversations-host.restore.immediate', () => ({ threadId, showLoader }));
        scheduleRestoreFrame(threadId, entry);
        return;
      }
      debugConversation('conversations-host.restore.queue', () => ({ threadId, showLoader }));
      pendingRestoresRef.current.set(threadId, entry);
    },
    [scheduleRestoreFrame],
  );

  useEffect(() => {
    const previousId = previousActiveRef.current;
    if (previousId && previousId !== activeThreadId) {
      debugConversation('conversations-host.switch.capture', () => ({ from: previousId }));
      void captureScrollState(previousId);
    }

    const entry = cacheRef.current.entries[activeThreadId];
    const cachedState = sanitizeScrollState(entry?.scrollState);
    if (cachedState) {
      debugConversation('conversations-host.switch.restore', () => ({ threadId: activeThreadId }));
      requestRestore(activeThreadId, cachedState, { showLoader: false });
    } else {
      debugConversation('conversations-host.switch.no-state', () => ({ threadId: activeThreadId }));
    }

    previousActiveRef.current = activeThreadId;
  }, [activeThreadId, captureScrollState, requestRestore]);

  const normalizedOrder = cache.order.includes(activeThreadId)
    ? cache.order
    : [activeThreadId, ...cache.order].slice(0, MAX_CONVERSATION_CACHE);

  return (
    <div className="relative h-full">
      {normalizedOrder.map((threadId) => {
        const isActive = threadId === activeThreadId;
        const cached = cache.entries[threadId];
        const runsForThread = isActive ? runs : cached?.runs ?? [];
        const queuedForThread = isActive ? queuedMessages : cached?.queuedMessages ?? [];
        const remindersForThread = isActive ? reminders : cached?.reminders ?? [];
        const hydrationForThread = isActive
          ? cached?.hydrationComplete ?? hydrationComplete
          : cached?.hydrationComplete ?? false;
        const atBottomAtOpen = cached?.atBottomAtOpen ?? true;
        const visibilityClass = isActive
          ? 'absolute inset-0 flex flex-col visible opacity-100 pointer-events-auto'
          : 'absolute inset-0 flex flex-col invisible opacity-0 pointer-events-none';

        const handleRef = (handle: ConversationHandle | null) => {
          if (handle) {
            debugConversation('conversations-host.handle.attach', () => ({ threadId }));
            conversationRefs.current.set(threadId, handle);
            const pending = pendingRestoresRef.current.get(threadId);
            if (pending) {
              scheduleRestoreFrame(threadId, pending);
            }
          } else {
            debugConversation('conversations-host.handle.detach', () => ({ threadId }));
            conversationRefs.current.delete(threadId);
            const frameId = restoreFrameRefs.current.get(threadId);
            if (typeof frameId === 'number') {
              cancelAnimationFrame(frameId);
              restoreFrameRefs.current.delete(threadId);
            }
          }
        };

        return (
          <div
            key={threadId}
            className={visibilityClass}
            aria-hidden={!isActive}
            data-testid={`conversation-host-item-${threadId}`}
          >
            <Conversation
              ref={handleRef}
              threadId={threadId}
              runs={runsForThread}
              queuedMessages={queuedForThread}
              reminders={remindersForThread}
              hydrationComplete={hydrationForThread}
              isActive={isActive}
              className={className}
              header={header}
              footer={footer}
              defaultCollapsed={defaultCollapsed ?? isRunsInfoCollapsed}
              collapsed={collapsed ?? isRunsInfoCollapsed}
              atBottomAtOpen={atBottomAtOpen}
              testId={isActive ? undefined : null}
            />
          </div>
        );
      })}
    </div>
  );
}

export default function ThreadsScreen({
  threads,
  runs,
  containers,
  reminders,
  filterMode,
  selectedThreadId,
  selectedThread,
  inputValue,
  isRunsInfoCollapsed,
  threadsHasMore = false,
  threadsIsLoading = false,
  isLoading = false,
  isEmpty = false,
  listError,
  detailError,
  conversationHydrationComplete = true,
  onFilterModeChange,
  onSelectThread,
  onToggleRunsInfoCollapsed,
  onInputValueChange,
  onSendMessage,
  onThreadsLoadMore,
  onThreadExpand,
  onCreateDraft,
  onToggleThreadStatus,
  isToggleThreadStatusPending = false,
  isSendMessagePending = false,
  onOpenContainerTerminal,
  draftMode = false,
  draftRecipientId = null,
  draftRecipientLabel = null,
  draftFetchOptions,
  onDraftRecipientChange,
  onDraftCancel,
  className = '',
}: ThreadsScreenProps) {
  const filteredThreads = threads.filter((thread) => {
    if (filterMode === 'all') return true;
    if (filterMode === 'open') return thread.isOpen;
    if (filterMode === 'closed') return !thread.isOpen;
    return true;
  });

  const resolvedSelectedThread = selectedThread ?? threads.find((thread) => thread.id === selectedThreadId);
  const [draftRecipientQuery, setDraftRecipientQuery] = useState('');
  const draftRecipientInputRef = useRef<AutocompleteInputHandle | null>(null);

  const resolvedDraftFetchOptions = useCallback(
    async (query: string) => {
      if (!draftFetchOptions) return [];
      return draftFetchOptions(query);
    },
    [draftFetchOptions],
  );

  useEffect(() => {
    if (!draftMode) {
      setDraftRecipientQuery('');
      return;
    }
    if (draftRecipientId && draftRecipientLabel) {
      setDraftRecipientQuery(draftRecipientLabel);
    }
  }, [draftMode, draftRecipientId, draftRecipientLabel]);

  useEffect(() => {
    if (!draftMode) return;
    const frame = requestAnimationFrame(() => {
      draftRecipientInputRef.current?.focus();
      draftRecipientInputRef.current?.open();
    });
    return () => cancelAnimationFrame(frame);
  }, [draftMode]);

  const handleDraftRecipientInputChange = useCallback(
    (next: string) => {
      setDraftRecipientQuery(next);
      if (draftRecipientId) {
        onDraftRecipientChange?.(null, null);
      }
    },
    [draftRecipientId, onDraftRecipientChange],
  );

  const handleDraftRecipientSelect = useCallback(
    (option: AutocompleteOption) => {
      setDraftRecipientQuery(option.label);
      onDraftRecipientChange?.(option.value, option.label);
    },
    [onDraftRecipientChange],
  );

  const renderThreadsList = () => {
    if (listError) {
      return (
        <div className="flex h-full items-center justify-center px-6 text-center text-sm text-[var(--agyn-red)]">
          {listError}
        </div>
      );
    }

    return (
      <ThreadsList
        threads={filteredThreads}
        selectedThreadId={selectedThreadId ?? undefined}
        onSelectThread={(threadId) => onSelectThread?.(threadId)}
        className="h-full rounded-none border-none"
        hasMore={threadsHasMore}
        isLoading={threadsIsLoading || isLoading}
        onLoadMore={onThreadsLoadMore}
        onToggleExpand={onThreadExpand}
        emptyState={
          <span className="text-sm">
            {isEmpty ? 'No threads available yet' : 'No threads match the current filter'}
          </span>
        }
      />
    );
  };

  const renderComposer = (sendDisabled: boolean) => (
    <div className="border-t border-[var(--agyn-border-subtle)] bg-[var(--agyn-bg-light)] p-4">
      <div className="relative">
        <AutosizeTextarea
          placeholder="Type a message..."
          value={inputValue}
          onChange={(event) => onInputValueChange?.(event.target.value)}
          size="sm"
          minLines={1}
          maxLines={8}
          className="pr-12"
        />
        <div className="absolute bottom-[11px] right-[5px]">
          <IconButton
            icon={<Send className="h-4 w-4" />}
            variant="primary"
            size="sm"
            onClick={() => onSendMessage?.(inputValue, { threadId: selectedThreadId })}
            disabled={sendDisabled}
            title="Send message"
            aria-label="Send message"
            aria-busy={isSendMessagePending || undefined}
          />
        </div>
      </div>
    </div>
  );

  const renderDetailContent = () => {
    if (detailError) {
      return (
        <div className="flex h-full items-center justify-center px-6 text-center text-sm text-[var(--agyn-red)]">
          {detailError}
        </div>
      );
    }

    if (isLoading) {
      return (
        <div className="flex h-full items-center justify-center text-[var(--agyn-gray)]">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Loading thread…
        </div>
      );
    }

    if (draftMode) {
      const trimmedInputValue = inputValue.trim();
      const hasRecipient = Boolean(draftRecipientId);
      const hasMessage = trimmedInputValue.length > 0;
      const withinLengthLimit = inputValue.length <= THREAD_MESSAGE_MAX_LENGTH;
      const baseDisabled = !onSendMessage || !selectedThreadId || isSendMessagePending;
      const draftSendDisabled =
        baseDisabled || !hasRecipient || !hasMessage || !withinLengthLimit;

      return (
        <>
          <div className="border-b border-[var(--agyn-border-subtle)] bg-white p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
              <div className="flex-1">
                <AutocompleteInput
                  ref={draftRecipientInputRef}
                  value={draftRecipientQuery}
                  onChange={handleDraftRecipientInputChange}
                  onSelect={handleDraftRecipientSelect}
                  fetchOptions={resolvedDraftFetchOptions}
                  placeholder="Search agents..."
                  clearable
                  autoOpenOnMount
                  disabled={!draftFetchOptions}
                />
              </div>
              {onDraftCancel ? (
                <Button variant="ghost" size="sm" type="button" onClick={onDraftCancel}>
                  Cancel
                </Button>
              ) : null}
            </div>
          </div>
          <div className="flex flex-1 items-center justify-center px-4 text-center text-sm text-[var(--agyn-gray)]">
            Start your new conversation with the agent
          </div>
          {renderComposer(draftSendDisabled)}
        </>
      );
    }

    if (isEmpty) {
      return (
        <div className="flex h-full items-center justify-center text-[var(--agyn-gray)]">
          No threads available. Start a new conversation to see it here.
        </div>
      );
    }

    if (!resolvedSelectedThread) {
      return (
        <div className="flex h-full items-center justify-center text-[var(--agyn-gray)]">
          Select a thread to view details
        </div>
      );
    }

    const createdAtDate = new Date(resolvedSelectedThread.createdAt);
    const createdAtValid = Number.isFinite(createdAtDate.getTime());
    const createdAtRelative = createdAtValid
      ? formatDistanceToNow(createdAtDate, { addSuffix: true })
      : resolvedSelectedThread.createdAt;
    const createdAtTitle = createdAtValid ? createdAtDate.toLocaleString() : undefined;
    const nextThreadStatus: 'open' | 'closed' = resolvedSelectedThread.isOpen ? 'closed' : 'open';
    const toggleLabel = resolvedSelectedThread.isOpen ? 'Close thread' : 'Reopen thread';
    const toggleDisabled = !onToggleThreadStatus || isToggleThreadStatusPending;
    const agentDisplayName = resolvedSelectedThread.agentName?.trim().length
      ? resolvedSelectedThread.agentName.trim()
      : resolvedSelectedThread.agentTitle?.trim() ?? '';
    const agentDisplayRole = resolvedSelectedThread.agentRole?.trim();

    return (
      <>
        <div className="bg-white border-b border-[var(--agyn-border-subtle)] p-4">
          <div className="mb-3 flex items-start justify-between">
            <div className="flex-1">
              <div className="mb-1 flex items-center gap-2">
                <StatusIndicator status={resolvedSelectedThread.status} size="sm" showTooltip={false} />
                {agentDisplayName ? (
                  <span className="text-xs text-[var(--agyn-gray)]">{agentDisplayName}</span>
                ) : null}
                {agentDisplayRole ? (
                  <>
                    <span className="text-xs text-[var(--agyn-gray)]">•</span>
                    <span className="text-xs text-[var(--agyn-gray)]" data-testid="thread-detail-role">
                      {agentDisplayRole}
                    </span>
                  </>
                ) : null}
                <span className="text-xs text-[var(--agyn-gray)]">•</span>
                <span className="text-xs text-[var(--agyn-gray)]" title={createdAtTitle}>
                  {createdAtRelative}
                </span>
              </div>
              <h3 className="mt-1 text-[var(--agyn-dark)]">{resolvedSelectedThread.summary}</h3>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Play className="h-4 w-4 text-[var(--agyn-gray)]" />
                <span className="text-sm text-[var(--agyn-dark)]">{runs.length}</span>
                <span className="text-xs text-[var(--agyn-gray)]">runs</span>
              </div>

              <Popover>
                <PopoverTrigger asChild>
                  <button className="flex items-center gap-2 rounded-[6px] px-2 py-1 transition-colors hover:bg-[var(--agyn-bg-light)]">
                    <Container className="h-4 w-4 text-[var(--agyn-gray)]" />
                    <span className="text-sm text-[var(--agyn-dark)]">
                      {containers.filter((container) => container.status === 'running').length}
                    </span>
                    <span className="text-xs text-[var(--agyn-gray)]">containers</span>
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-[280px]">
                  <div className="space-y-2">
                    <h4 className="mb-3 text-sm text-[var(--agyn-dark)]">Containers</h4>
                    {containers.length === 0 ? (
                      <div className="rounded-[10px] border border-[var(--agyn-border-subtle)] bg-white px-3 py-2 text-sm text-[var(--agyn-text-subtle)]">
                        No containers available.
                      </div>
                    ) : (
                      containers.map((container) => {
                        const isRunning = container.status === 'running';
                        return (
                          <div
                            key={container.id}
                            className="rounded-[10px] border border-[var(--agyn-border-subtle)] bg-[var(--agyn-bg-light)] px-3 py-2"
                          >
                            <div className="flex items-center gap-2">
                              <span className="truncate text-sm text-[var(--agyn-dark)]">{container.name}</span>
                              <IconButton
                                variant="ghost"
                                size="sm"
                                icon={<Terminal className="h-4 w-4" />}
                                aria-label="Open terminal"
                                title="Open terminal"
                                onClick={() => onOpenContainerTerminal?.(container.id)}
                                disabled={!isRunning || !onOpenContainerTerminal}
                              />
                              <StatusIndicator status={container.status} size="sm" showTooltip={false} />
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </PopoverContent>
              </Popover>

              <Popover>
                <PopoverTrigger asChild>
                  <button className="flex items-center gap-2 rounded-[6px] px-2 py-1 transition-colors hover:bg-[var(--agyn-bg-light)]">
                    <Bell className="h-4 w-4 text-[var(--agyn-gray)]" />
                    <span className="text-sm text-[var(--agyn-dark)]">{reminders.length}</span>
                    <span className="text-xs text-[var(--agyn-gray)]">reminders</span>
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-[280px]">
                  <div className="space-y-2">
                    <h4 className="mb-3 text-sm text-[var(--agyn-dark)]">Reminders</h4>
                    {reminders.map((reminder) => (
                      <div
                        key={reminder.id}
                        className="rounded-[6px] bg-[var(--agyn-bg-light)] px-3 py-2"
                      >
                        <p className="mb-1 text-sm text-[var(--agyn-dark)]">{reminder.title}</p>
                        <p className="text-xs text-[var(--agyn-gray)]">{reminder.time}</p>
                      </div>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            <div className="flex items-center gap-2">
              {onToggleThreadStatus ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onToggleThreadStatus(resolvedSelectedThread.id, nextThreadStatus)}
                  disabled={toggleDisabled}
                  aria-busy={isToggleThreadStatusPending || undefined}
                >
                  {toggleLabel}
                </Button>
              ) : null}

              <IconButton
                icon={
                  isRunsInfoCollapsed ? <PanelRight className="h-4 w-4" /> : <PanelRightClose className="h-4 w-4" />
                }
                variant="ghost"
                size="sm"
                onClick={() => onToggleRunsInfoCollapsed?.(!isRunsInfoCollapsed)}
                title={isRunsInfoCollapsed ? 'Show runs info' : 'Hide runs info'}
              />
            </div>
          </div>

          {resolvedSelectedThread.childrenError ? (
            <div className="mt-3 rounded-[6px] border border-[var(--agyn-border-strong)] bg-[var(--agyn-bg-light)] px-3 py-2 text-sm text-[var(--agyn-red)]">
              {resolvedSelectedThread.childrenError}
            </div>
          ) : null}
        </div>

        <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
          <ConversationsHost
            activeThreadId={resolvedSelectedThread.id}
            runs={runs}
            queuedMessages={[] as QueuedMessageData[]}
            reminders={[] as ReminderData[]}
            hydrationComplete={conversationHydrationComplete}
            isRunsInfoCollapsed={isRunsInfoCollapsed}
            className="h-full rounded-none border-none"
            defaultCollapsed={isRunsInfoCollapsed}
            collapsed={isRunsInfoCollapsed}
          />
        </div>

        {renderComposer(!onSendMessage || !selectedThreadId || isSendMessagePending)}
      </>
    );
  };

  return (
    <div className={`flex min-h-0 min-w-0 flex-1 overflow-hidden ${className}`}>
      <div className="flex min-h-0 w-[360px] flex-col border-r border-[var(--agyn-border-subtle)] bg-white">
        <div className="flex h-[66px] items-center justify-between border-b border-[var(--agyn-border-subtle)] px-4">
          <SegmentedControl
            items={[
              { value: 'all', label: 'All' },
              { value: 'open', label: 'Open' },
              { value: 'closed', label: 'Closed' },
            ]}
            value={filterMode}
            onChange={(value) => onFilterModeChange?.(value as 'all' | 'open' | 'closed')}
            size="sm"
          />
          <IconButton
            icon={<MessageSquarePlus className="h-4 w-4" />}
            variant="ghost"
            size="sm"
            title="New thread"
            onClick={onCreateDraft}
            disabled={!onCreateDraft}
          />
        </div>

        <div className="flex-1 min-h-0 overflow-hidden">{renderThreadsList()}</div>
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-[var(--agyn-bg-light)]">{renderDetailContent()}</div>
    </div>
  );
}
