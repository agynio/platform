import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type Ref, type UIEvent } from 'react';
import { formatDistanceToNow } from 'date-fns';
import {
  Play,
  Container,
  Bell,
  PanelRightClose,
  PanelRight,
  Loader2,
  MessageSquarePlus,
  Terminal,
  Circle,
  CheckCircle,
  ChevronDown,
} from 'lucide-react';
import { AutocompleteInput, type AutocompleteInputHandle, type AutocompleteOption } from '@/components/AutocompleteInput';
import { Button } from '../Button';
import { IconButton } from '../IconButton';
import { ThreadsList } from '../ThreadsList';
import type { Thread } from '../ThreadItem';
import { SegmentedControl } from '../SegmentedControl';
import { Conversation, type Run, type ReminderData as ConversationReminderData, type QueuedMessageData as ConversationQueuedMessageData } from '../Conversation';
import { Popover, PopoverTrigger, PopoverContent } from '../ui/popover';
import { StatusIndicator } from '../StatusIndicator';
import { MarkdownComposer } from '../MarkdownComposer';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { menuItemBaseClasses } from '../ui/menu-item-classes';
import { cn } from '../ui/utils';
import { THREAD_MESSAGE_MAX_LENGTH } from '@/utils/draftStorage';
import { useThreadSoundNotifications } from '@/hooks/useThreadSoundNotifications';

const UNKNOWN_AGENT_LABEL = '(unknown agent)';

interface ThreadsScreenProps {
  threads: Thread[];
  runs: Run[];
  containers: { id: string; name: string; status: 'running' | 'finished' }[];
  reminders: { id: string; title: string; time: string }[];
  conversationQueuedMessages?: ConversationQueuedMessageData[];
  conversationReminders?: ConversationReminderData[];
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
  conversationScrollRef?: Ref<HTMLDivElement>;
  onConversationScroll?: (event: UIEvent<HTMLDivElement>) => void;
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
  onDraftRecipientChange?: (agentId: string | null, agentName: string | null) => void;
  onDraftCancel?: () => void;
  className?: string;
}

export default function ThreadsScreen({
  threads,
  runs,
  containers,
  reminders,
  conversationQueuedMessages = [],
  conversationReminders = [],
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
  conversationScrollRef,
  onConversationScroll,
}: ThreadsScreenProps) {
  const filteredThreads = threads.filter((thread) => {
    if (filterMode === 'all') return true;
    if (filterMode === 'open') return thread.isOpen;
    if (filterMode === 'closed') return !thread.isOpen;
    return true;
  });

  const notificationThreads = useMemo(
    () => threads.filter((thread) => !thread.id.startsWith('draft:')),
    [threads],
  );

  useThreadSoundNotifications({ threads: notificationThreads });

  const resolvedSelectedThread = selectedThread ?? threads.find((thread) => thread.id === selectedThreadId);
  const [draftRecipientQuery, setDraftRecipientQuery] = useState('');
  const draftRecipientInputRef = useRef<AutocompleteInputHandle | null>(null);
  const [isStatusMenuOpen, setIsStatusMenuOpen] = useState(false);
  const [isContainersPopoverOpen, setIsContainersPopoverOpen] = useState(false);
  const [isRemindersPopoverOpen, setIsRemindersPopoverOpen] = useState(false);

  const hasContainers = containers.length > 0;
  const hasReminders = reminders.length > 0;

  const runningContainersCount = useMemo(
    () => containers.reduce((count, container) => count + (container.status === 'running' ? 1 : 0), 0),
    [containers],
  );

  const resolvedDraftFetchOptions = useCallback(
    async (query: string) => {
      if (!draftFetchOptions) return [];
      return draftFetchOptions(query);
    },
    [draftFetchOptions],
  );

  useEffect(() => {
    setIsStatusMenuOpen(false);
  }, [resolvedSelectedThread?.id]);

  useEffect(() => {
    setIsContainersPopoverOpen(false);
    setIsRemindersPopoverOpen(false);
  }, [resolvedSelectedThread?.id]);

  useEffect(() => {
    if (!hasContainers) {
      setIsContainersPopoverOpen(false);
    }
  }, [hasContainers]);

  useEffect(() => {
    if (!hasReminders) {
      setIsRemindersPopoverOpen(false);
    }
  }, [hasReminders]);

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

  useEffect(() => {
    if (isToggleThreadStatusPending) {
      setIsStatusMenuOpen(false);
    }
  }, [isToggleThreadStatusPending]);

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
        isLoading={threadsIsLoading}
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
      <MarkdownComposer
        value={inputValue}
        onChange={(next) => onInputValueChange?.(next)}
        placeholder="Type a message..."
        minLines={1}
        maxLines={8}
        onSend={() => {
          if (!onSendMessage) return;
          onSendMessage(inputValue, { threadId: selectedThreadId ?? null });
        }}
        sendDisabled={sendDisabled}
        isSending={isSendMessagePending}
        textareaProps={{
          maxLength: THREAD_MESSAGE_MAX_LENGTH,
        }}
      />
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
    const currentStatusValue: 'open' | 'closed' = resolvedSelectedThread.isOpen ? 'open' : 'closed';
    const currentStatusLabel = resolvedSelectedThread.isOpen ? 'Open' : 'Resolved';
    const CurrentStatusIcon = resolvedSelectedThread.isOpen ? Circle : CheckCircle;
    const statusSelectionDisabled = !onToggleThreadStatus || isToggleThreadStatusPending;

    const handleStatusChange = (nextStatus: 'open' | 'closed') => {
      if (!onToggleThreadStatus || isToggleThreadStatusPending) return;
      if (nextStatus === currentStatusValue) return;
      setIsStatusMenuOpen(false);
      onToggleThreadStatus(resolvedSelectedThread.id, nextStatus);
    };
    const agentDisplayName = (() => {
      const trimmed = resolvedSelectedThread.agentName?.trim();
      return trimmed && trimmed.length > 0 ? trimmed : UNKNOWN_AGENT_LABEL;
    })();
    const agentDisplayRole = resolvedSelectedThread.agentRole?.trim();

    return (
      <div className="relative flex min-h-0 flex-1 flex-col">
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
              <DropdownMenu
                open={isStatusMenuOpen}
                onOpenChange={(open) => {
                  if (statusSelectionDisabled) {
                    setIsStatusMenuOpen(false);
                    return;
                  }
                  setIsStatusMenuOpen(open);
                }}
              >
                <DropdownMenuTrigger asChild disabled={statusSelectionDisabled}>
                  <button
                    type="button"
                    className="flex items-center gap-2 rounded-[6px] px-2 py-1 transition-colors hover:bg-[var(--agyn-bg-light)]"
                    aria-label={`Thread status: ${currentStatusLabel}`}
                    aria-busy={isToggleThreadStatusPending || undefined}
                    aria-haspopup="menu"
                    aria-expanded={isStatusMenuOpen}
                    disabled={statusSelectionDisabled}
                  >
                    <CurrentStatusIcon className="h-4 w-4 text-[var(--agyn-gray)]" />
                    <span className="text-sm text-[var(--agyn-dark)]">{currentStatusLabel}</span>
                    <ChevronDown className="h-4 w-4 text-[var(--agyn-gray)]" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  className="w-[160px] rounded-[10px] border border-[var(--agyn-border-subtle)] bg-white p-1 shadow-lg"
                  align="start"
                >
                  <DropdownMenuRadioGroup
                    value={currentStatusValue}
                    onValueChange={(value) => handleStatusChange(value as 'open' | 'closed')}
                  >
                    <DropdownMenuRadioItem
                      value="open"
                      disabled={statusSelectionDisabled}
                      hideIndicator
                      className="data-[state=checked]:font-medium"
                    >
                      <Circle className="h-4 w-4 text-[var(--agyn-gray)] group-data-[state=checked]:text-[var(--agyn-blue)]" />
                      <span>Open</span>
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem
                      value="closed"
                      disabled={statusSelectionDisabled}
                      hideIndicator
                      className="data-[state=checked]:font-medium"
                    >
                      <CheckCircle className="h-4 w-4 text-[var(--agyn-gray)] group-data-[state=checked]:text-[var(--agyn-blue)]" />
                      <span>Resolved</span>
                    </DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>

              <div className="flex items-center gap-2">
                <Play className="h-4 w-4 text-[var(--agyn-gray)]" />
                <span className="text-sm text-[var(--agyn-dark)]">{runs.length}</span>
                <span className="text-xs text-[var(--agyn-gray)]">runs</span>
              </div>

              <Popover
                open={isContainersPopoverOpen}
                onOpenChange={(open) => {
                  if (!hasContainers) return;
                  setIsContainersPopoverOpen(open);
                }}
              >
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="flex items-center gap-2 rounded-[6px] px-2 py-1 transition-colors hover:bg-[var(--agyn-bg-light)]"
                    aria-haspopup="dialog"
                    aria-expanded={isContainersPopoverOpen}
                  >
                    <Container className="h-4 w-4 text-[var(--agyn-gray)]" />
                    <span className="text-sm text-[var(--agyn-dark)]">{runningContainersCount}</span>
                    <span className="text-xs text-[var(--agyn-gray)]">containers</span>
                  </button>
                </PopoverTrigger>
                {hasContainers ? (
                  <PopoverContent
                    className="w-[280px] rounded-[10px] border border-[var(--agyn-border-subtle)] bg-white p-1 shadow-lg"
                    align="end"
                  >
                    <ul className="flex flex-col gap-1">
                      {containers.map((container) => {
                        const isRunning = container.status === 'running';
                        return (
                          <li
                            key={container.id}
                          className={cn(menuItemBaseClasses, 'justify-between')}
                          >
                            <span className="min-w-0 flex-1 truncate">{container.name}</span>
                            <div className="flex items-center gap-2">
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
                          </li>
                        );
                      })}
                    </ul>
                  </PopoverContent>
                ) : null}
              </Popover>

              <Popover
                open={isRemindersPopoverOpen}
                onOpenChange={(open) => {
                  if (!hasReminders) return;
                  setIsRemindersPopoverOpen(open);
                }}
              >
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="flex items-center gap-2 rounded-[6px] px-2 py-1 transition-colors hover:bg-[var(--agyn-bg-light)]"
                    aria-haspopup="dialog"
                    aria-expanded={isRemindersPopoverOpen}
                  >
                    <Bell className="h-4 w-4 text-[var(--agyn-gray)]" />
                    <span className="text-sm text-[var(--agyn-dark)]">{reminders.length}</span>
                    <span className="text-xs text-[var(--agyn-gray)]">reminders</span>
                  </button>
                </PopoverTrigger>
                {hasReminders ? (
                  <PopoverContent
                    className="w-[280px] rounded-[10px] border border-[var(--agyn-border-subtle)] bg-white p-1 shadow-lg"
                    align="end"
                  >
                    <ul className="flex flex-col gap-1">
                      {reminders.map((reminder) => (
                        <li
                          key={reminder.id}
                          className={cn(menuItemBaseClasses, 'flex-col items-start gap-1')}
                        >
                          <p className="w-full truncate text-sm text-[var(--agyn-dark)]">{reminder.title}</p>
                          <p className="text-xs text-[var(--agyn-gray)]">{reminder.time}</p>
                        </li>
                      ))}
                    </ul>
                  </PopoverContent>
                ) : null}
              </Popover>
            </div>

            <div className="flex items-center gap-2">
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
          <Conversation
            runs={runs}
            queuedMessages={conversationQueuedMessages}
            reminders={conversationReminders}
            className="h-full rounded-none border-none"
            collapsed={isRunsInfoCollapsed}
            scrollRef={conversationScrollRef}
            onScroll={onConversationScroll}
          />
        </div>

        {renderComposer(!onSendMessage || !selectedThreadId || isSendMessagePending)}
        {isLoading ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/80 backdrop-blur-sm">
            <Loader2 className="mr-2 h-4 w-4 animate-spin text-[var(--agyn-gray)]" />
            <span className="text-sm text-[var(--agyn-gray)]">Loading thread…</span>
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <div className={`flex min-h-0 min-w-0 flex-1 overflow-hidden ${className}`}>
      <div className="flex min-h-0 w-[360px] flex-col border-r border-[var(--agyn-border-subtle)] bg-white">
        <div className="flex h-[66px] items-center justify-between border-b border-[var(--agyn-border-subtle)] px-4">
          <SegmentedControl
            items={[
              { value: 'open', label: 'Open' },
              { value: 'closed', label: 'Resolved' },
              { value: 'all', label: 'All' },
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
