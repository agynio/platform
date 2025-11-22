import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Play, Container, Bell, Send, PanelRightClose, PanelRight } from 'lucide-react';

import { IconButton } from '../IconButton';
import { ThreadsList } from '../ThreadsList';
import { Thread } from '../ThreadItem';
import { SegmentedControl } from '../SegmentedControl';
import { Conversation, Run } from '../Conversation';
import { Popover, PopoverTrigger, PopoverContent } from '../ui/popover';
import { StatusIndicator, Status } from '../StatusIndicator';
import { AutosizeTextarea } from '../AutosizeTextarea';
import Sidebar from '../Sidebar';

type ThreadFilterMode = 'all' | 'open' | 'closed';

export interface ThreadsScreenReminder {
  id: string;
  title: string;
  time: string;
}

export interface ThreadsScreenContainer {
  id: string;
  name: string;
  status: Status;
  onOpenTerminal?: () => void;
}

export interface ThreadsScreenProps {
  threads?: Thread[];
  runs?: Run[];
  containers?: ThreadsScreenContainer[];
  reminders?: ThreadsScreenReminder[];
  selectedThreadId?: string;
  onSelectThread?: (threadId: string) => void;
  onSendMessage?: (message: string) => void;
  onBack?: () => void;
  selectedMenuItem?: string;
  onMenuItemSelect?: (itemId: string) => void;
  renderSidebar?: boolean;
  isRunsInfoCollapsed?: boolean;
  onRunsInfoCollapsedChange?: (collapsed: boolean) => void;
  isLoadingThreads?: boolean;
  onThreadFilterChange?: (filter: ThreadFilterMode) => void;
}

const EMPTY_THREADS: Thread[] = [];
const EMPTY_RUNS: Run[] = [];
const EMPTY_CONTAINERS: ThreadsScreenContainer[] = [];
const EMPTY_REMINDERS: ThreadsScreenReminder[] = [];

export default function ThreadsScreen({
  threads = EMPTY_THREADS,
  runs = EMPTY_RUNS,
  containers = EMPTY_CONTAINERS,
  reminders = EMPTY_REMINDERS,
  selectedThreadId,
  onSelectThread,
  onSendMessage,
  onBack,
  selectedMenuItem,
  onMenuItemSelect,
  renderSidebar = true,
  isRunsInfoCollapsed,
  onRunsInfoCollapsedChange,
  isLoadingThreads = false,
  onThreadFilterChange,
}: ThreadsScreenProps) {
  const [filterMode, setFilterMode] = useState<ThreadFilterMode>('all');
  const [internalSelectedThreadId, setInternalSelectedThreadId] = useState<string>(
    () => selectedThreadId ?? threads[0]?.id ?? ''
  );
  const [inputValue, setInputValue] = useState('');
  const [internalRunsInfoCollapsed, setInternalRunsInfoCollapsed] = useState<boolean>(
    isRunsInfoCollapsed ?? false
  );

  useEffect(() => {
    if (selectedThreadId !== undefined) {
      setInternalSelectedThreadId(selectedThreadId);
    } else if (!internalSelectedThreadId && threads.length) {
      setInternalSelectedThreadId(threads[0].id);
    }
  }, [selectedThreadId, threads, internalSelectedThreadId]);

  useEffect(() => {
    if (isRunsInfoCollapsed !== undefined) {
      setInternalRunsInfoCollapsed(isRunsInfoCollapsed);
    }
  }, [isRunsInfoCollapsed]);

  const runsInfoCollapsed = isRunsInfoCollapsed ?? internalRunsInfoCollapsed;
  const activeSelectedThreadId = selectedThreadId ?? internalSelectedThreadId;

  const setRunsInfoCollapsed = (next: boolean) => {
    if (isRunsInfoCollapsed === undefined) {
      setInternalRunsInfoCollapsed(next);
    }
    onRunsInfoCollapsedChange?.(next);
  };

  const handleSelectThread = (threadId: string) => {
    onSelectThread?.(threadId);
    if (selectedThreadId === undefined) {
      setInternalSelectedThreadId(threadId);
    }
  };

  const handleToggleRunsInfo = () => {
    const next = !runsInfoCollapsed;
    setRunsInfoCollapsed(next);
  };

  const handleFilterChange = (value: ThreadFilterMode) => {
    setFilterMode(value);
    onThreadFilterChange?.(value);
  };

  const filteredThreads = useMemo(() => {
    if (filterMode === 'all') return threads;
    const shouldBeOpen = filterMode === 'open';
    return threads.filter((thread) => thread.isOpen === shouldBeOpen);
  }, [threads, filterMode]);

  const selectedThread = useMemo(
    () => threads.find((t) => t.id === activeSelectedThreadId),
    [threads, activeSelectedThreadId]
  );

  const threadRuns = selectedThread ? runs : EMPTY_RUNS;
  const activeContainers = selectedThread ? containers : EMPTY_CONTAINERS;
  const activeReminders = selectedThread ? reminders : EMPTY_REMINDERS;

  const handleSendMessage = () => {
    const trimmed = inputValue.trim();
    if (!trimmed) return;
    onSendMessage?.(trimmed);
    setInputValue('');
  };

  const renderContainersPopoverContent = () => {
    if (!activeContainers.length) {
      return <p className="text-sm text-[var(--agyn-gray)]">No active containers</p>;
    }

    return (
      <div className="space-y-2">
        <h4 className="text-sm text-[var(--agyn-dark)] mb-3">Containers</h4>
        {activeContainers.map((container) => (
          <button
            key={container.id}
            type="button"
            className="w-full flex items-center justify-between py-2 px-3 bg-[var(--agyn-bg-light)] rounded-[6px] text-left hover:bg-[var(--agyn-bg-light)]/80 transition-colors"
            onClick={() => container.onOpenTerminal?.()}
          >
            <span className="text-sm text-[var(--agyn-dark)]">{container.name}</span>
            <StatusIndicator status={container.status} size="sm" />
          </button>
        ))}
      </div>
    );
  };

  const renderRemindersPopoverContent = () => {
    if (!activeReminders.length) {
      return <p className="text-sm text-[var(--agyn-gray)]">No reminders</p>;
    }

    return (
      <div className="space-y-2">
        <h4 className="text-sm text-[var(--agyn-dark)] mb-3">Reminders</h4>
        {activeReminders.map((reminder) => (
          <div
            key={reminder.id}
            className="py-2 px-3 bg-[var(--agyn-bg-light)] rounded-[6px]"
          >
            <p className="text-sm text-[var(--agyn-dark)] mb-1">{reminder.title}</p>
            <p className="text-xs text-[var(--agyn-gray)]">{reminder.time}</p>
          </div>
        ))}
      </div>
    );
  };

  const renderThreadHeader = () => {
    if (!selectedThread) {
      return (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-[var(--agyn-gray)]">Select a thread to view details</p>
        </div>
      );
    }

    return (
      <>
        <div className="bg-white border-b border-[var(--agyn-border-subtle)] p-4">
          <div className="flex items-start justify-between mb-3">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <StatusIndicator status={selectedThread.status as Status} size="sm" />
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
                <Play className="w-4 h-4 text-[var(--agyn-gray)]" />
                <span className="text-sm text-[var(--agyn-dark)]">{threadRuns.length}</span>
                <span className="text-xs text-[var(--agyn-gray)]">runs</span>
              </div>

              {!!activeContainers.length && (
                <Popover>
                  <PopoverTrigger asChild>
                    <button className="flex items-center gap-2 hover:bg-[var(--agyn-bg-light)] px-2 py-1 rounded-[6px] transition-colors">
                      <Container className="w-4 h-4 text-[var(--agyn-gray)]" />
                      <span className="text-sm text-[var(--agyn-dark)]">
                        {activeContainers.filter((c) => c.status === 'running').length}
                      </span>
                      <span className="text-xs text-[var(--agyn-gray)]">containers</span>
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[280px]">
                    {renderContainersPopoverContent()}
                  </PopoverContent>
                </Popover>
              )}

              {!!activeReminders.length && (
                <Popover>
                  <PopoverTrigger asChild>
                    <button className="flex items-center gap-2 hover:bg-[var(--agyn-bg-light)] px-2 py-1 rounded-[6px] transition-colors">
                      <Bell className="w-4 h-4 text-[var(--agyn-gray)]" />
                      <span className="text-sm text-[var(--agyn-dark)]">{activeReminders.length}</span>
                      <span className="text-xs text-[var(--agyn-gray)]">reminders</span>
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[280px]">
                    {renderRemindersPopoverContent()}
                  </PopoverContent>
                </Popover>
              )}
            </div>

            <IconButton
              icon={runsInfoCollapsed ? <PanelRight className="w-4 h-4" /> : <PanelRightClose className="w-4 h-4" />}
              variant="ghost"
              size="sm"
              onClick={handleToggleRunsInfo}
              title={runsInfoCollapsed ? 'Show runs info' : 'Hide runs info'}
            />
          </div>
        </div>

        <div className="flex-1 min-w-0 overflow-hidden min-h-0">
          <Conversation
            runs={threadRuns}
            className="h-full rounded-none border-none"
            collapsed={runsInfoCollapsed}
            onCollapsedChange={setRunsInfoCollapsed}
          />
        </div>

        <div className="bg-[var(--agyn-bg-light)] border-t border-[var(--agyn-border-subtle)] p-4">
          <div className="relative">
            <AutosizeTextarea
              placeholder="Type a message..."
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              size="sm"
              minLines={1}
              maxLines={8}
              className="pr-12"
            />
            <div className="absolute bottom-[11px] right-[5px]">
              <IconButton
                icon={<Send className="w-4 h-4" />}
                variant="primary"
                size="sm"
                onClick={handleSendMessage}
                disabled={!inputValue.trim() || !onSendMessage}
              />
            </div>
          </div>
        </div>
      </>
    );
  };

  return (
    <div className="h-full bg-[var(--agyn-bg-light)] flex flex-col">
      {onBack ? (
        <div className="h-[40px] bg-[var(--agyn-dark)] border-b border-[var(--agyn-border-subtle)] flex items-center px-4 gap-3">
          <IconButton icon={<ArrowLeft />} onClick={onBack} variant="ghost" size="sm" />
          <span className="text-sm text-white">Threads</span>
        </div>
      ) : null}

      <div className="flex-1 flex overflow-hidden">
        {renderSidebar && (
          <Sidebar selectedMenuItem={selectedMenuItem} onMenuItemSelect={onMenuItemSelect} />
        )}

        <div className="flex-1 min-w-0 flex flex-col">
          <div className="flex-1 min-w-0 flex overflow-hidden">
            <div className="w-[360px] border-r border-[var(--agyn-border-subtle)] flex flex-col bg-white">
              <div className="h-[66px] flex items-center px-4 border-b border-[var(--agyn-border-subtle)]">
                <SegmentedControl
                  items={[
                    { value: 'all', label: 'All' },
                    { value: 'open', label: 'Open' },
                    { value: 'closed', label: 'Closed' },
                  ]}
                  value={filterMode}
                  onChange={(value) => handleFilterChange(value as ThreadFilterMode)}
                  size="sm"
                />
              </div>

              <div className="flex-1 overflow-hidden p-3">
                <ThreadsList
                  threads={filteredThreads}
                  selectedThreadId={activeSelectedThreadId}
                  onSelectThread={handleSelectThread}
                  className="h-full rounded-none border-none"
                  isLoading={isLoadingThreads}
                  emptyState={
                    <div className="text-sm text-[var(--agyn-gray)]">
                      {isLoadingThreads ? 'Loading threads…' : 'No threads'}
                    </div>
                  }
                />
              </div>
            </div>

            <div className="flex-1 min-w-0 flex flex-col bg-[var(--agyn-bg-light)]">
              {renderThreadHeader()}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
