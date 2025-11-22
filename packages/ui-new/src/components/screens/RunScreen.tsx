import { useState } from 'react';
import { ArrowLeft, Square, Eye, EyeOff, MessageSquare, Bot, Wrench, FileText, Settings2, ScrollText } from 'lucide-react';
import Sidebar from '../Sidebar';
import { RunEventsList, RunEvent } from '../RunEventsList';
import { RunEventDetails } from '../RunEventDetails';
import { StatusIndicator, Status } from '../StatusIndicator';
import { Badge } from '../Badge';
import { Button } from '../Button';
import { IconButton } from '../IconButton';
import * as Popover from '@radix-ui/react-popover';
import * as Tooltip from '@radix-ui/react-tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';

export type EventFilter = 'message' | 'llm' | 'tool' | 'summary';
export type StatusFilter = 'running' | 'finished' | 'failed' | 'terminated';

interface RunScreenProps {
  runId: string;
  status: Status;
  createdAt: string;
  duration: string;
  statistics: {
    totalEvents: number;
    messages: number;
    llm: number;
    tools: number;
    summaries: number;
  };
  tokens: {
    input: number;
    cached: number;
    output: number;
    reasoning: number;
    total: number;
  };
  events: RunEvent[];
  onTerminate?: () => void;
  onBack?: () => void;
}

export default function RunScreen({
  runId,
  status,
  createdAt,
  duration,
  statistics,
  tokens,
  events,
  onTerminate,
  onBack,
}: RunScreenProps) {
  const [selectedEventId, setSelectedEventId] = useState<string | undefined>(events[0]?.id);
  const [isFollowing, setIsFollowing] = useState(true);
  const [eventFilters, setEventFilters] = useState<Set<EventFilter>>(new Set());
  const [statusFilters, setStatusFilters] = useState<Set<StatusFilter>>(new Set());
  const [tokensPopoverOpen, setTokensPopoverOpen] = useState(false);
  const [runsPopoverOpen, setRunsPopoverOpen] = useState(false);

  const toggleEventFilter = (filter: EventFilter) => {
    const newFilters = new Set(eventFilters);
    if (newFilters.has(filter)) {
      newFilters.delete(filter);
    } else {
      newFilters.add(filter);
    }
    setEventFilters(newFilters);
  };

  const toggleStatusFilter = (filter: StatusFilter) => {
    const newFilters = new Set(statusFilters);
    if (newFilters.has(filter)) {
      newFilters.delete(filter);
    } else {
      newFilters.add(filter);
    }
    setStatusFilters(newFilters);
  };

  const filteredEvents = events.filter(event => {
    // Apply event type filters
    if (eventFilters.size > 0) {
      const eventType = event.type === 'summarization' ? 'summary' : event.type;
      if (!eventFilters.has(eventType as EventFilter)) {
        return false;
      }
    }

    // Apply status filters
    if (statusFilters.size > 0 && event.status) {
      if (!statusFilters.has(event.status as StatusFilter)) {
        return false;
      }
    }

    return true;
  });

  const selectedEvent = filteredEvents.find(e => e.id === selectedEventId);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatNumber = (num: number) => {
    return num.toLocaleString();
  };

  // Calculate totals by status
  const totalRuns = events.length;
  const runsByStatus = {
    running: events.filter(e => e.status === 'running').length,
    finished: events.filter(e => e.status === 'finished').length,
    failed: events.filter(e => e.status === 'failed').length,
    terminated: events.filter(e => e.status === 'terminated').length,
  };

  return (
    <div className="h-screen bg-[var(--agyn-bg-light)] flex flex-col">
      {/* Showcase Navigation - NOT PART OF FINAL SCREEN */}
      {onBack && (
        <div className="h-[40px] bg-[var(--agyn-dark)] border-b border-[var(--agyn-border-subtle)] flex items-center px-4 gap-3">
          <IconButton icon={<ArrowLeft />} onClick={onBack} variant="ghost" size="sm" />
          <span className="text-sm text-white">Run • {runId}</span>
        </div>
      )}

      {/* Main Screen Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <Sidebar />

        {/* Main Content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="bg-white border-b border-[var(--agyn-border-subtle)] px-6 py-3">
            <div className="flex items-center justify-between">
              {/* Left: Status & Metadata */}
              <div className="flex items-center gap-4">
                {/* Status */}
                <div className="flex items-center gap-3">
                  <StatusIndicator status={status} size="md" showTooltip={false} />
                  <span className="font-medium capitalize">{status}</span>
                </div>

                {/* Divider */}
                <div className="text-[var(--agyn-border-subtle)]">|</div>

                {/* Duration */}
                <div className="text-sm text-[var(--agyn-dark)]">
                  {duration}
                </div>

                {/* Divider */}
                <div className="text-[var(--agyn-border-subtle)]">|</div>

                {/* Date */}
                <div className="text-sm text-[var(--agyn-text-subtle)]">
                  {formatDate(createdAt)}
                </div>

                {/* Divider */}
                <div className="text-[var(--agyn-border-subtle)]">|</div>

                {/* Tokens with Popover */}
                <Popover.Root open={tokensPopoverOpen} onOpenChange={setTokensPopoverOpen}>
                  <Popover.Trigger asChild>
                    <button 
                      className="text-sm text-[var(--agyn-dark)] hover:text-[var(--agyn-blue)] transition-colors cursor-pointer"
                      onMouseEnter={() => setTokensPopoverOpen(true)}
                      onMouseLeave={() => setTokensPopoverOpen(false)}
                    >
                      {formatNumber(tokens.total)} <span className="text-[var(--agyn-text-subtle)]">tokens</span>
                    </button>
                  </Popover.Trigger>
                  <Popover.Portal>
                    <Popover.Content
                      className="bg-white rounded-[10px] shadow-lg border border-[var(--agyn-border-subtle)] p-3 min-w-[200px] z-50"
                      sideOffset={5}
                      onMouseEnter={() => setTokensPopoverOpen(true)}
                      onMouseLeave={() => setTokensPopoverOpen(false)}
                    >
                      <div className="space-y-2">
                        <div className="text-xs font-medium text-[var(--agyn-dark)] mb-2">Token Usage</div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-[var(--agyn-text-subtle)]">Input</span>
                          <span className="text-[var(--agyn-dark)] font-medium">{formatNumber(tokens.input)}</span>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-[var(--agyn-text-subtle)]">Cached</span>
                          <span className="text-[var(--agyn-dark)] font-medium">{formatNumber(tokens.cached)}</span>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-[var(--agyn-text-subtle)]">Output</span>
                          <span className="text-[var(--agyn-dark)] font-medium">{formatNumber(tokens.output)}</span>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-[var(--agyn-text-subtle)]">Reasoning</span>
                          <span className="text-[var(--agyn-dark)] font-medium">{formatNumber(tokens.reasoning)}</span>
                        </div>
                        <div className="border-t border-[var(--agyn-border-subtle)] pt-2 mt-2">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-[var(--agyn-dark)] font-medium">Total</span>
                            <span className="text-[var(--agyn-dark)] font-medium">{formatNumber(tokens.total)}</span>
                          </div>
                        </div>
                      </div>
                      <Popover.Arrow className="fill-white" />
                    </Popover.Content>
                  </Popover.Portal>
                </Popover.Root>
              </div>

              {/* Right: Actions */}
              <div className="flex items-center gap-2">
                {status === 'running' && (
                  <Button
                    onClick={onTerminate}
                    variant="danger"
                    size="sm"
                  >
                    <Square className="w-4 h-4 mr-1.5" />
                    Terminate
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* Content Area */}
          <div className="flex-1 flex overflow-hidden">
            {/* Events List */}
            <div className="w-80 border-r border-[var(--agyn-border-subtle)] bg-white flex flex-col">
              {/* Events List Header */}
              <div className="bg-white border-b border-[var(--agyn-border-subtle)] px-3 py-2 flex items-center justify-between">
                {/* Events Count with Popover */}
                <Popover.Root open={runsPopoverOpen} onOpenChange={setRunsPopoverOpen}>
                  <Popover.Trigger asChild>
                    <button 
                      className="text-sm text-[var(--agyn-dark)] hover:text-[var(--agyn-blue)] transition-colors cursor-pointer"
                      onMouseEnter={() => setRunsPopoverOpen(true)}
                      onMouseLeave={() => setRunsPopoverOpen(false)}
                    >
                      {formatNumber(totalRuns)} <span className="text-[var(--agyn-text-subtle)]">events</span>
                    </button>
                  </Popover.Trigger>
                  <Popover.Portal>
                    <Popover.Content
                      className="bg-white rounded-[10px] shadow-lg border border-[var(--agyn-border-subtle)] p-3 min-w-[200px] z-50"
                      sideOffset={5}
                      onMouseEnter={() => setRunsPopoverOpen(true)}
                      onMouseLeave={() => setRunsPopoverOpen(false)}
                    >
                      <div className="space-y-2">
                        <div className="text-xs font-medium text-[var(--agyn-dark)] mb-3">Event Statistics</div>
                        
                        {/* By Kind */}
                        <div>
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between text-xs">
                              <div className="flex items-center gap-1.5">
                                <MessageSquare className="w-3 h-3 text-[var(--agyn-blue)]" />
                                <span className="text-[var(--agyn-text-subtle)]">Message</span>
                              </div>
                              <span className="text-[var(--agyn-dark)] font-medium">{formatNumber(statistics.messages)}</span>
                            </div>
                            <div className="flex items-center justify-between text-xs">
                              <div className="flex items-center gap-1.5">
                                <Bot className="w-3 h-3 text-[var(--agyn-purple)]" />
                                <span className="text-[var(--agyn-text-subtle)]">LLM</span>
                              </div>
                              <span className="text-[var(--agyn-dark)] font-medium">{formatNumber(statistics.llm)}</span>
                            </div>
                            <div className="flex items-center justify-between text-xs">
                              <div className="flex items-center gap-1.5">
                                <Wrench className="w-3 h-3 text-[var(--agyn-cyan)]" />
                                <span className="text-[var(--agyn-text-subtle)]">Tool</span>
                              </div>
                              <span className="text-[var(--agyn-dark)] font-medium">{formatNumber(statistics.tools)}</span>
                            </div>
                            <div className="flex items-center justify-between text-xs">
                              <div className="flex items-center gap-1.5">
                                <FileText className="w-3 h-3 text-[var(--agyn-gray)]" />
                                <span className="text-[var(--agyn-text-subtle)]">Summary</span>
                              </div>
                              <span className="text-[var(--agyn-dark)] font-medium">{formatNumber(statistics.summaries)}</span>
                            </div>
                          </div>
                        </div>
                        
                        {/* By Status */}
                        <div className="pt-2 border-t border-[var(--agyn-border-subtle)]">
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between text-xs">
                              <div className="flex items-center gap-1.5">
                                <StatusIndicator status="running" size="sm" showTooltip={false} />
                                <span className="text-[var(--agyn-text-subtle)]">Running</span>
                              </div>
                              <span className="text-[var(--agyn-dark)] font-medium">{formatNumber(runsByStatus.running)}</span>
                            </div>
                            <div className="flex items-center justify-between text-xs">
                              <div className="flex items-center gap-1.5">
                                <StatusIndicator status="finished" size="sm" showTooltip={false} />
                                <span className="text-[var(--agyn-text-subtle)]">Finished</span>
                              </div>
                              <span className="text-[var(--agyn-dark)] font-medium">{formatNumber(runsByStatus.finished)}</span>
                            </div>
                            <div className="flex items-center justify-between text-xs">
                              <div className="flex items-center gap-1.5">
                                <StatusIndicator status="failed" size="sm" showTooltip={false} />
                                <span className="text-[var(--agyn-text-subtle)]">Failed</span>
                              </div>
                              <span className="text-[var(--agyn-dark)] font-medium">{formatNumber(runsByStatus.failed)}</span>
                            </div>
                            <div className="flex items-center justify-between text-xs">
                              <div className="flex items-center gap-1.5">
                                <StatusIndicator status="terminated" size="sm" showTooltip={false} />
                                <span className="text-[var(--agyn-text-subtle)]">Terminated</span>
                              </div>
                              <span className="text-[var(--agyn-dark)] font-medium">{formatNumber(runsByStatus.terminated)}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                      <Popover.Arrow className="fill-white" />
                    </Popover.Content>
                  </Popover.Portal>
                </Popover.Root>

                {/* Actions */}
                <div className="flex items-center gap-1">
                  <Tooltip.Provider>
                    <Tooltip.Root>
                      <Tooltip.Trigger asChild>
                        <div>
                          <IconButton
                            icon={<ScrollText className={isFollowing ? 'text-[var(--agyn-blue)]' : ''} />}
                            onClick={() => setIsFollowing(!isFollowing)}
                            variant="ghost"
                            size="sm"
                          />
                        </div>
                      </Tooltip.Trigger>
                      <Tooltip.Portal>
                        <Tooltip.Content
                          className="bg-[var(--agyn-dark)] text-white px-3 py-2 rounded-md text-xs z-50"
                          sideOffset={5}
                        >
                          Follow new events
                          <Tooltip.Arrow className="fill-[var(--agyn-dark)]" />
                        </Tooltip.Content>
                      </Tooltip.Portal>
                    </Tooltip.Root>
                  </Tooltip.Provider>
                  
                  {/* Filter Configuration Dropdown */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <div>
                        <IconButton icon={<Settings2 />} variant="ghost" size="sm" />
                      </div>
                    </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56 bg-white rounded-[10px] border border-[var(--agyn-border-subtle)] shadow-lg p-1">
                    <DropdownMenuGroup>
                      <DropdownMenuLabel className="px-3 py-2 text-xs font-medium text-[var(--agyn-text-subtle)]">
                        Event Kinds
                      </DropdownMenuLabel>
                      <DropdownMenuItem
                        className="flex items-center justify-between px-3 py-2 cursor-pointer rounded-md hover:bg-[var(--agyn-bg-light)] focus:bg-[var(--agyn-bg-light)]"
                        onSelect={(e) => {
                          e.preventDefault();
                          toggleEventFilter('message');
                        }}
                      >
                        <div className="flex items-center gap-2">
                          <MessageSquare className="w-4 h-4 text-[var(--agyn-blue)]" />
                          <span className="text-sm">Message</span>
                          <span className="text-xs text-[var(--agyn-text-subtle)]">({formatNumber(statistics.messages)})</span>
                        </div>
                        {eventFilters.has('message') ? (
                          <Eye className="w-4 h-4 text-[var(--agyn-blue)]" />
                        ) : (
                          <EyeOff className="w-4 h-4 text-[var(--agyn-text-subtle)]" />
                        )}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="flex items-center justify-between px-3 py-2 cursor-pointer rounded-md hover:bg-[var(--agyn-bg-light)] focus:bg-[var(--agyn-bg-light)]"
                        onSelect={(e) => {
                          e.preventDefault();
                          toggleEventFilter('llm');
                        }}
                      >
                        <div className="flex items-center gap-2">
                          <Bot className="w-4 h-4 text-[var(--agyn-purple)]" />
                          <span className="text-sm">LLM</span>
                          <span className="text-xs text-[var(--agyn-text-subtle)]">({formatNumber(statistics.llm)})</span>
                        </div>
                        {eventFilters.has('llm') ? (
                          <Eye className="w-4 h-4 text-[var(--agyn-blue)]" />
                        ) : (
                          <EyeOff className="w-4 h-4 text-[var(--agyn-text-subtle)]" />
                        )}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="flex items-center justify-between px-3 py-2 cursor-pointer rounded-md hover:bg-[var(--agyn-bg-light)] focus:bg-[var(--agyn-bg-light)]"
                        onSelect={(e) => {
                          e.preventDefault();
                          toggleEventFilter('tool');
                        }}
                      >
                        <div className="flex items-center gap-2">
                          <Wrench className="w-4 h-4 text-[var(--agyn-cyan)]" />
                          <span className="text-sm">Tool</span>
                          <span className="text-xs text-[var(--agyn-text-subtle)]">({formatNumber(statistics.tools)})</span>
                        </div>
                        {eventFilters.has('tool') ? (
                          <Eye className="w-4 h-4 text-[var(--agyn-blue)]" />
                        ) : (
                          <EyeOff className="w-4 h-4 text-[var(--agyn-text-subtle)]" />
                        )}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="flex items-center justify-between px-3 py-2 cursor-pointer rounded-md hover:bg-[var(--agyn-bg-light)] focus:bg-[var(--agyn-bg-light)]"
                        onSelect={(e) => {
                          e.preventDefault();
                          toggleEventFilter('summary');
                        }}
                      >
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4 text-[var(--agyn-gray)]" />
                          <span className="text-sm">Summary</span>
                          <span className="text-xs text-[var(--agyn-text-subtle)]">({formatNumber(statistics.summaries)})</span>
                        </div>
                        {eventFilters.has('summary') ? (
                          <Eye className="w-4 h-4 text-[var(--agyn-blue)]" />
                        ) : (
                          <EyeOff className="w-4 h-4 text-[var(--agyn-text-subtle)]" />
                        )}
                      </DropdownMenuItem>
                    </DropdownMenuGroup>

                    <DropdownMenuSeparator className="my-1 bg-[var(--agyn-border-subtle)]" />

                    <DropdownMenuGroup>
                      <DropdownMenuLabel className="px-3 py-2 text-xs font-medium text-[var(--agyn-text-subtle)]">
                        Event Status
                      </DropdownMenuLabel>
                      <DropdownMenuItem
                        className="flex items-center justify-between px-3 py-2 cursor-pointer rounded-md hover:bg-[var(--agyn-bg-light)] focus:bg-[var(--agyn-bg-light)]"
                        onSelect={(e) => {
                          e.preventDefault();
                          toggleStatusFilter('running');
                        }}
                      >
                        <div className="flex items-center gap-2">
                          <StatusIndicator status="running" size="sm" showTooltip={false} />
                          <span className="text-sm">Running</span>
                          <span className="text-xs text-[var(--agyn-text-subtle)]">({runsByStatus.running})</span>
                        </div>
                        {statusFilters.has('running') ? (
                          <Eye className="w-4 h-4 text-[var(--agyn-blue)]" />
                        ) : (
                          <EyeOff className="w-4 h-4 text-[var(--agyn-text-subtle)]" />
                        )}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="flex items-center justify-between px-3 py-2 cursor-pointer rounded-md hover:bg-[var(--agyn-bg-light)] focus:bg-[var(--agyn-bg-light)]"
                        onSelect={(e) => {
                          e.preventDefault();
                          toggleStatusFilter('finished');
                        }}
                      >
                        <div className="flex items-center gap-2">
                          <StatusIndicator status="finished" size="sm" showTooltip={false} />
                          <span className="text-sm">Finished</span>
                          <span className="text-xs text-[var(--agyn-text-subtle)]">({runsByStatus.finished})</span>
                        </div>
                        {statusFilters.has('finished') ? (
                          <Eye className="w-4 h-4 text-[var(--agyn-blue)]" />
                        ) : (
                          <EyeOff className="w-4 h-4 text-[var(--agyn-text-subtle)]" />
                        )}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="flex items-center justify-between px-3 py-2 cursor-pointer rounded-md hover:bg-[var(--agyn-bg-light)] focus:bg-[var(--agyn-bg-light)]"
                        onSelect={(e) => {
                          e.preventDefault();
                          toggleStatusFilter('failed');
                        }}
                      >
                        <div className="flex items-center gap-2">
                          <StatusIndicator status="failed" size="sm" showTooltip={false} />
                          <span className="text-sm">Failed</span>
                          <span className="text-xs text-[var(--agyn-text-subtle)]">({runsByStatus.failed})</span>
                        </div>
                        {statusFilters.has('failed') ? (
                          <Eye className="w-4 h-4 text-[var(--agyn-blue)]" />
                        ) : (
                          <EyeOff className="w-4 h-4 text-[var(--agyn-text-subtle)]" />
                        )}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="flex items-center justify-between px-3 py-2 cursor-pointer rounded-md hover:bg-[var(--agyn-bg-light)] focus:bg-[var(--agyn-bg-light)]"
                        onSelect={(e) => {
                          e.preventDefault();
                          toggleStatusFilter('terminated');
                        }}
                      >
                        <div className="flex items-center gap-2">
                          <StatusIndicator status="terminated" size="sm" showTooltip={false} />
                          <span className="text-sm">Terminated</span>
                          <span className="text-xs text-[var(--agyn-text-subtle)]">({runsByStatus.terminated})</span>
                        </div>
                        {statusFilters.has('terminated') ? (
                          <Eye className="w-4 h-4 text-[var(--agyn-blue)]" />
                        ) : (
                          <EyeOff className="w-4 h-4 text-[var(--agyn-text-subtle)]" />
                        )}
                      </DropdownMenuItem>
                    </DropdownMenuGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
                </div>
              </div>

              {/* Events List */}
              <div className="flex-1 overflow-hidden">
                <RunEventsList
                  events={filteredEvents}
                  selectedEventId={selectedEventId}
                  onSelectEvent={setSelectedEventId}
                />
              </div>
            </div>

            {/* Event Details */}
            <div className="flex-1 bg-white overflow-hidden">
              {selectedEvent ? (
                <RunEventDetails event={selectedEvent} />
              ) : (
                <div className="h-full flex items-center justify-center text-[var(--agyn-text-subtle)]">
                  Select an event to view details
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
