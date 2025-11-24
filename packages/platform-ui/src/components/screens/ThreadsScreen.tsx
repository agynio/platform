import { useState } from 'react';
import { ArrowLeft, Play, Container, Bell, Send, PanelRightClose, PanelRight } from 'lucide-react';
import { IconButton } from '../IconButton';
import { ThreadsList } from '../ThreadsList';
import { Thread } from '../ThreadItem';
import { SegmentedControl } from '../SegmentedControl';
import { Conversation, Run } from '../Conversation';
import { Popover, PopoverTrigger, PopoverContent } from '../ui/popover';
import { StatusIndicator } from '../StatusIndicator';
import { AutosizeTextarea } from '../AutosizeTextarea';
import { MainLayout } from '../layouts/MainLayout';

interface ThreadsScreenProps {
  onBack: () => void;
  selectedMenuItem?: string;
  onMenuItemSelect?: (itemId: string) => void;
  threads: Thread[];
  runs: Run[];
  containers: { id: string; name: string; status: 'running' | 'finished' }[];
  reminders: { id: string; title: string; time: string }[];
}

export default function ThreadsScreen({
  onBack,
  selectedMenuItem,
  onMenuItemSelect,
  threads,
  runs,
  containers,
  reminders,
}: ThreadsScreenProps) {
  const [filterMode, setFilterMode] = useState<'all' | 'open' | 'closed'>('all');
  const [selectedThreadId, setSelectedThreadId] = useState<string>(
    threads && threads.length > 0 ? threads[0].id : '',
  );
  const [inputValue, setInputValue] = useState('');
  const [isRunsInfoCollapsed, setIsRunsInfoCollapsed] = useState(false);

  const filteredThreads = (threads ?? []).filter((thread) => {
    if (filterMode === 'all') return true;
    if (filterMode === 'open') return thread.isOpen;
    if (filterMode === 'closed') return !thread.isOpen;
    return true;
  });

  const selectedThread = (threads ?? []).find((t) => t.id === selectedThreadId);

  return (
  <MainLayout selectedMenuItem={selectedMenuItem} onMenuItemSelect={onMenuItemSelect}>
    {/* Right Side Content */}
          {/* Main Content - 2 columns */}
          <div className="flex-1 min-w-0 flex overflow-hidden">
            {/* Threads List Column */}
            <div className="w-[360px] border-r border-[var(--agyn-border-subtle)] flex flex-col bg-white">
              {/* Threads List Header - 66px */}
              <div className="h-[66px] flex items-center px-4 border-b border-[var(--agyn-border-subtle)]">
                <SegmentedControl
                  items={[
                    { value: 'all', label: 'All' },
                    { value: 'open', label: 'Open' },
                    { value: 'closed', label: 'Closed' },
                  ]}
                  value={filterMode}
                  onChange={(value) => setFilterMode(value as 'all' | 'open' | 'closed')}
                  size="sm"
                />
              </div>

              {/* Threads List */}
              <div className="flex-1 overflow-hidden">
                <ThreadsList
                  threads={filteredThreads}
                  selectedThreadId={selectedThreadId}
                  onSelectThread={setSelectedThreadId}
                  className="h-full rounded-none border-none"
                />
              </div>
            </div>

            {/* Selected Thread Content */}
            <div className="flex-1 min-w-0 flex flex-col bg-[var(--agyn-bg-light)]">
              {selectedThread ? (
                <>
                  {/* Thread Header */}
                  <div className="bg-white border-b border-[var(--agyn-border-subtle)] p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <StatusIndicator status={selectedThread.status as any} size="sm" />
                          <span className="text-xs text-[var(--agyn-gray)]">{selectedThread.agentName}</span>
                          <span className="text-xs text-[var(--agyn-gray)]">•</span>
                          <span className="text-xs text-[var(--agyn-gray)]">{selectedThread.createdAt}</span>
                        </div>
                        <h3 className="text-[var(--agyn-dark)]">{selectedThread.summary}</h3>
                      </div>
                    </div>

                    {/* Stats Row */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        {/* Runs Count */}
                        <div className="flex items-center gap-2">
                          <Play className="w-4 h-4 text-[var(--agyn-gray)]" />
                          <span className="text-sm text-[var(--agyn-dark)]">{runs.length}</span>
                          <span className="text-xs text-[var(--agyn-gray)]">runs</span>
                        </div>

                        {/* Containers Count with Popover */}
                        <Popover>
                          <PopoverTrigger asChild>
                            <button className="flex items-center gap-2 hover:bg-[var(--agyn-bg-light)] px-2 py-1 rounded-[6px] transition-colors">
                              <Container className="w-4 h-4 text-[var(--agyn-gray)]" />
                              <span className="text-sm text-[var(--agyn-dark)]">
                                {containers.filter((c) => c.status === 'running').length}
                              </span>
                              <span className="text-xs text-[var(--agyn-gray)]">containers</span>
                            </button>
                          </PopoverTrigger>
                          <PopoverContent className="w-[280px]">
                            <div className="space-y-2">
                              <h4 className="text-sm text-[var(--agyn-dark)] mb-3">Containers</h4>
                              {containers.map((container) => (
                                <div
                                  key={container.id}
                                  className="flex items-center justify-between py-2 px-3 bg-[var(--agyn-bg-light)] rounded-[6px]"
                                >
                                  <span className="text-sm text-[var(--agyn-dark)]">{container.name}</span>
                                  <StatusIndicator status={container.status} size="sm" />
                                </div>
                              ))}
                            </div>
                          </PopoverContent>
                        </Popover>

                        {/* Reminders Count with Popover */}
                        <Popover>
                          <PopoverTrigger asChild>
                            <button className="flex items-center gap-2 hover:bg-[var(--agyn-bg-light)] px-2 py-1 rounded-[6px] transition-colors">
                              <Bell className="w-4 h-4 text-[var(--agyn-gray)]" />
                              <span className="text-sm text-[var(--agyn-dark)]">{reminders.length}</span>
                              <span className="text-xs text-[var(--agyn-gray)]">reminders</span>
                            </button>
                          </PopoverTrigger>
                          <PopoverContent className="w-[280px]">
                            <div className="space-y-2">
                              <h4 className="text-sm text-[var(--agyn-dark)] mb-3">Reminders</h4>
                              {reminders.map((reminder) => (
                                <div
                                  key={reminder.id}
                                  className="py-2 px-3 bg-[var(--agyn-bg-light)] rounded-[6px]"
                                >
                                  <p className="text-sm text-[var(--agyn-dark)] mb-1">{reminder.title}</p>
                                  <p className="text-xs text-[var(--agyn-gray)]">{reminder.time}</p>
                                </div>
                              ))}
                            </div>
                          </PopoverContent>
                        </Popover>
                      </div>

                      {/* Toggle Runs Info Button */}
                      <IconButton
                        icon={isRunsInfoCollapsed ? <PanelRight className="w-4 h-4" /> : <PanelRightClose className="w-4 h-4" />}
                        variant="ghost"
                        size="sm"
                        onClick={() => setIsRunsInfoCollapsed(!isRunsInfoCollapsed)}
                        title={isRunsInfoCollapsed ? 'Show runs info' : 'Hide runs info'}
                      />
                    </div>
                  </div>

                  {/* Conversation - flex-1 to take remaining space */}
                  <div className="flex-1 min-w-0 overflow-hidden min-h-0">
                    <Conversation 
                      runs={runs} 
                      className="h-full rounded-none border-none"
                      collapsed={isRunsInfoCollapsed}
                      onCollapsedChange={setIsRunsInfoCollapsed}
                    />
                  </div>

                  {/* Message Input */}
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
                        />
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center">
                  <p className="text-[var(--agyn-gray)]">Select a thread to view details</p>
                </div>
              )}
            </div>
          </div>
      </MainLayout>
  );
}