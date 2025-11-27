import type { ReactNode } from 'react';
import { Play, Container, Bell, Send, PanelRightClose, PanelRight, Loader2 } from 'lucide-react';
import { IconButton } from '../IconButton';
import { ThreadsList } from '../ThreadsList';
import type { Thread } from '../ThreadItem';
import { SegmentedControl } from '../SegmentedControl';
import { Conversation, type Run } from '../Conversation';
import { Popover, PopoverTrigger, PopoverContent } from '../ui/popover';
import { StatusIndicator } from '../StatusIndicator';
import { AutosizeTextarea } from '../AutosizeTextarea';

interface ThreadsScreenProps {
  threads: Thread[];
  runs: Run[];
  containers: { id: string; name: string; status: 'running' | 'finished' }[];
  reminders: { id: string; title: string; time: string }[];
  filterMode: 'all' | 'open' | 'closed';
  selectedThreadId: string | null;
  inputValue: string;
  isRunsInfoCollapsed: boolean;
  threadsHasMore?: boolean;
  threadsIsLoading?: boolean;
  isLoading?: boolean;
  isEmpty?: boolean;
  error?: ReactNode;
  onFilterModeChange?: (mode: 'all' | 'open' | 'closed') => void;
  onSelectThread?: (threadId: string) => void;
  onToggleRunsInfoCollapsed?: (isCollapsed: boolean) => void;
  onInputValueChange?: (value: string) => void;
  onSendMessage?: (value: string, context: { threadId: string | null }) => void;
  onThreadsLoadMore?: () => void;
  className?: string;
}

export default function ThreadsScreen({
  threads,
  runs,
  containers,
  reminders,
  filterMode,
  selectedThreadId,
  inputValue,
  isRunsInfoCollapsed,
  threadsHasMore = false,
  threadsIsLoading = false,
  isLoading = false,
  isEmpty = false,
  error,
  onFilterModeChange,
  onSelectThread,
  onToggleRunsInfoCollapsed,
  onInputValueChange,
  onSendMessage,
  onThreadsLoadMore,
  className = '',
}: ThreadsScreenProps) {
  const filteredThreads = threads.filter((thread) => {
    if (filterMode === 'all') return true;
    if (filterMode === 'open') return thread.isOpen;
    if (filterMode === 'closed') return !thread.isOpen;
    return true;
  });

  const selectedThread = threads.find((thread) => thread.id === selectedThreadId);

  const renderThreadsList = () => {
    if (error) {
      return (
        <div className="flex h-full items-center justify-center px-6 text-center text-sm text-[var(--agyn-red)]">
          {error}
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
        emptyState={
          <span className="text-sm">
            {isEmpty ? 'No threads available yet' : 'No threads match the current filter'}
          </span>
        }
      />
    );
  };

  const renderDetailContent = () => {
    if (error) {
      return (
        <div className="flex h-full items-center justify-center px-6 text-center text-sm text-[var(--agyn-red)]">
          {error}
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

    if (isEmpty) {
      return (
        <div className="flex h-full items-center justify-center text-[var(--agyn-gray)]">
          No threads available. Start a new conversation to see it here.
        </div>
      );
    }

    if (!selectedThread) {
      return (
        <div className="flex h-full items-center justify-center text-[var(--agyn-gray)]">
          Select a thread to view details
        </div>
      );
    }

    return (
      <>
        <div className="bg-white border-b border-[var(--agyn-border-subtle)] p-4">
          <div className="mb-3 flex items-start justify-between">
            <div className="flex-1">
              <div className="mb-1 flex items-center gap-2">
                <StatusIndicator status={selectedThread.status as 'running' | 'finished' | 'pending'} size="sm" />
                <span className="text-xs text-[var(--agyn-gray)]">{selectedThread.agentName}</span>
                <span className="text-xs text-[var(--agyn-gray)]">•</span>
                <span className="text-xs text-[var(--agyn-gray)]">{selectedThread.createdAt}</span>
              </div>
              <h3 className="text-[var(--agyn-dark)]">{selectedThread.summary}</h3>
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
                    {containers.map((container) => (
                      <div
                        key={container.id}
                        className="flex items-center justify-between rounded-[6px] bg-[var(--agyn-bg-light)] px-3 py-2"
                      >
                        <span className="text-sm text-[var(--agyn-dark)]">{container.name}</span>
                        <StatusIndicator status={container.status} size="sm" />
                      </div>
                    ))}
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

            <IconButton
              icon={isRunsInfoCollapsed ? <PanelRight className="h-4 w-4" /> : <PanelRightClose className="h-4 w-4" />}
              variant="ghost"
              size="sm"
              onClick={() => onToggleRunsInfoCollapsed?.(!isRunsInfoCollapsed)}
              title={isRunsInfoCollapsed ? 'Show runs info' : 'Hide runs info'}
            />
          </div>
        </div>

        <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
          <Conversation runs={runs} className="h-full rounded-none border-none" collapsed={isRunsInfoCollapsed} />
        </div>

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
                disabled={!onSendMessage || !selectedThreadId}
              />
            </div>
          </div>
        </div>
      </>
    );
  };

  return (
    <div className={`flex min-w-0 flex-1 overflow-hidden ${className}`}>
      <div className="flex w-[360px] flex-col border-r border-[var(--agyn-border-subtle)] bg-white">
        <div className="flex h-[66px] items-center border-b border-[var(--agyn-border-subtle)] px-4">
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
        </div>

        <div className="flex-1 overflow-hidden">{renderThreadsList()}</div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col bg-[var(--agyn-bg-light)]">{renderDetailContent()}</div>
    </div>
  );
}
