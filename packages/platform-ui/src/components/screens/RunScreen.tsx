import * as Popover from '@radix-ui/react-popover';
import * as Tooltip from '@radix-ui/react-tooltip';
import {
  ArrowLeft,
  Bot,
  Eye,
  EyeOff,
  FileText,
  Loader2,
  MessageSquare,
  ScrollText,
  Settings2,
  Square,
  X,
  Wrench,
} from 'lucide-react';
import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { Button } from '../Button';
import { IconButton } from '../IconButton';
import { RunEventDetails } from '../RunEventDetails';
import { type RunEvent, RunEventsList } from '../RunEventsList';
import { type Status, StatusIndicator } from '../StatusIndicator';
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
  selectedEventId: string | null;
  isFollowing: boolean;
  eventFilters: EventFilter[];
  statusFilters: StatusFilter[];
  tokensPopoverOpen: boolean;
  runsPopoverOpen: boolean;
  hasMoreEvents?: boolean;
  isLoadingMoreEvents?: boolean;
  isLoading?: boolean;
  isEmpty?: boolean;
  error?: ReactNode;
  listErrorMessage?: string;
  onSelectEvent: (eventId: string) => void;
  onFollowingChange: (isFollowing: boolean) => void;
  onEventFiltersChange: (filters: EventFilter[]) => void;
  onStatusFiltersChange: (filters: StatusFilter[]) => void;
  onTokensPopoverOpenChange: (open: boolean) => void;
  onRunsPopoverOpenChange: (open: boolean) => void;
  onLoadMoreEvents?: () => void;
  onRefreshEvents?: () => void;
  isRefreshingEvents?: boolean;
  onTerminate?: () => void;
  onBack?: () => void;
  isDesktopLayout?: boolean;
  onClearSelection?: () => void;
  className?: string;
}

export default function RunScreen({
  runId,
  status,
  createdAt,
  duration,
  statistics,
  tokens,
  events,
  selectedEventId,
  isFollowing,
  eventFilters,
  statusFilters,
  tokensPopoverOpen,
  runsPopoverOpen,
  hasMoreEvents = false,
  isLoadingMoreEvents = false,
  isLoading = false,
  isEmpty = false,
  error,
  listErrorMessage,
  onSelectEvent,
  onFollowingChange,
  onEventFiltersChange,
  onStatusFiltersChange,
  onTokensPopoverOpenChange,
  onRunsPopoverOpenChange,
  onLoadMoreEvents,
  onRefreshEvents,
  isRefreshingEvents = false,
  onTerminate,
  onBack,
  isDesktopLayout = true,
  onClearSelection,
  className = '',
}: RunScreenProps) {
  const eventFilterSet = new Set(eventFilters);
  const statusFilterSet = new Set(statusFilters);

  const filteredEvents = events.filter((event) => {
    if (eventFilterSet.size > 0) {
      const eventType = event.type === 'summarization' ? 'summary' : event.type;
      if (!eventFilterSet.has(eventType as EventFilter)) {
        return false;
      }
    }

    if (statusFilterSet.size > 0 && event.status) {
      if (!statusFilterSet.has(event.status as StatusFilter)) {
        return false;
      }
    }

    return true;
  });

  const selectedEvent = filteredEvents.find((event) => event.id === selectedEventId);

  const formatDate = (value: string) => {
    const date = new Date(value);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatNumber = (value: number) => value.toLocaleString();

  const totalEvents = events.length;
  const runsByStatus = {
    running: events.filter((event) => event.status === 'running').length,
    finished: events.filter((event) => event.status === 'finished').length,
    failed: events.filter((event) => event.status === 'failed').length,
    terminated: events.filter((event) => event.status === 'terminated').length,
  } satisfies Record<StatusFilter, number>;

  const handleToggleEventFilter = (filter: EventFilter) => {
    const nextFilters = new Set(eventFilters);
    if (eventFilterSet.has(filter)) {
      nextFilters.delete(filter);
    } else {
      nextFilters.add(filter);
    }
    onEventFiltersChange(Array.from(nextFilters));
  };

  const handleToggleStatusFilter = (filter: StatusFilter) => {
    const nextFilters = new Set(statusFilters);
    if (statusFilterSet.has(filter)) {
      nextFilters.delete(filter);
    } else {
      nextFilters.add(filter);
    }
    onStatusFiltersChange(Array.from(nextFilters));
  };

  const renderEventsList = () => {
    if (error) {
      return (
        <div className="flex flex-1 items-center justify-center px-4 text-center text-sm text-[var(--agyn-red)]">
          {error}
        </div>
      );
    }

    if (isLoading) {
      return (
        <div className="flex flex-1 items-center justify-center text-[var(--agyn-gray)]">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Loading events…
        </div>
      );
    }

    if (filteredEvents.length === 0) {
      return (
        <div className="flex flex-1 items-center justify-center px-4 text-center text-[var(--agyn-gray)]">
          {isEmpty ? 'No events available yet.' : 'No events match the current filters.'}
        </div>
      );
    }

    return (
      <RunEventsList
        events={filteredEvents}
        selectedEventId={selectedEventId ?? undefined}
        onSelectEvent={onSelectEvent}
        hasMore={hasMoreEvents}
        isLoadingMore={isLoadingMoreEvents}
        loadMore={onLoadMoreEvents}
        errorMessage={listErrorMessage}
      />
    );
  };

  const renderEventDetails = () => {
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
          Loading event…
        </div>
      );
    }

    if (isEmpty) {
      return (
        <div className="flex h-full items-center justify-center text-[var(--agyn-gray)]">
          No events recorded for this run yet.
        </div>
      );
    }

    if (!selectedEvent) {
      return (
        <div className="flex h-full items-center justify-center text-[var(--agyn-text-subtle)]">
          Select an event to view details
        </div>
      );
    }

    return <RunEventDetails event={selectedEvent} />;
  };

  const shouldShowMobileDetails = !isDesktopLayout && !error && Boolean(selectedEvent) && Boolean(onClearSelection);
  const activeMobileEvent = shouldShowMobileDetails ? selectedEvent : null;
  const handleDismissMobileDetails = () => {
    onClearSelection?.();
  };

  return (
    <div className={`flex h-screen flex-col bg-[var(--agyn-bg-light)] ${className}`}>
      {onBack && (
        <div className="flex h-[40px] items-center gap-3 border-b border-[var(--agyn-border-subtle)] bg-[var(--agyn-dark)] px-4">
          <IconButton icon={<ArrowLeft />} onClick={onBack} variant="ghost" size="sm" />
          <span className="text-sm text-white">Run • {runId}</span>
        </div>
      )}

      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex flex-col gap-4 border-b border-[var(--agyn-border-subtle)] bg-white px-4 py-3 md:flex-row md:items-center md:justify-between md:gap-6 md:px-6">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className="flex items-center gap-3">
              <StatusIndicator status={status} size="md" showTooltip={false} />
              <span className="font-medium capitalize">{status}</span>
            </div>

            <div className="text-[var(--agyn-border-subtle)]">|</div>

            <div className="text-sm text-[var(--agyn-dark)]">{duration}</div>

            <div className="text-[var(--agyn-border-subtle)]">|</div>

            <div className="text-sm text-[var(--agyn-text-subtle)]">{formatDate(createdAt)}</div>

            <div className="text-[var(--agyn-border-subtle)]">|</div>

            <Popover.Root open={tokensPopoverOpen} onOpenChange={onTokensPopoverOpenChange}>
              <Popover.Trigger asChild>
                <button
                  className="text-sm text-[var(--agyn-dark)] transition-colors hover:text-[var(--agyn-blue)]"
                  onMouseEnter={() => onTokensPopoverOpenChange(true)}
                  onMouseLeave={() => onTokensPopoverOpenChange(false)}
                >
                  {formatNumber(tokens.total)}{' '}
                  <span className="text-[var(--agyn-text-subtle)]">tokens</span>
                </button>
              </Popover.Trigger>
              <Popover.Portal>
                <Popover.Content
                  className="z-50 min-w-[200px] rounded-[10px] border border-[var(--agyn-border-subtle)] bg-white p-3 shadow-lg"
                  sideOffset={5}
                  onMouseEnter={() => onTokensPopoverOpenChange(true)}
                  onMouseLeave={() => onTokensPopoverOpenChange(false)}
                >
                  <div className="space-y-2">
                    <div className="mb-2 text-xs font-medium text-[var(--agyn-dark)]">Token Usage</div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[var(--agyn-text-subtle)]">Input</span>
                      <span className="font-medium text-[var(--agyn-dark)]">{formatNumber(tokens.input)}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[var(--agyn-text-subtle)]">Cached</span>
                      <span className="font-medium text-[var(--agyn-dark)]">{formatNumber(tokens.cached)}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[var(--agyn-text-subtle)]">Output</span>
                      <span className="font-medium text-[var(--agyn-dark)]">{formatNumber(tokens.output)}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[var(--agyn-text-subtle)]">Reasoning</span>
                      <span className="font-medium text-[var(--agyn-dark)]">{formatNumber(tokens.reasoning)}</span>
                    </div>
                    <div className="mt-2 border-t border-[var(--agyn-border-subtle)] pt-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-[var(--agyn-dark)]">Total</span>
                        <span className="font-medium text-[var(--agyn-dark)]">{formatNumber(tokens.total)}</span>
                      </div>
                    </div>
                  </div>
                  <Popover.Arrow className="fill-white" />
                </Popover.Content>
              </Popover.Portal>
            </Popover.Root>
          </div>

          <div className="flex items-center gap-2">
            {status === 'running' && (
              <Button onClick={onTerminate} variant="danger" size="sm">
                <Square className="mr-1.5 h-4 w-4" />
                Terminate
              </Button>
            )}
          </div>
        </div>

        <div className="flex flex-1 flex-col overflow-hidden md:flex-row">
          <div className="flex w-full min-h-0 flex-col border-b border-[var(--agyn-border-subtle)] bg-white md:w-80 md:border-b-0 md:border-r">
            <div className="flex flex-col gap-3 border-b border-[var(--agyn-border-subtle)] px-3 py-3">
              <div className="flex items-center justify-between gap-2">
                <Popover.Root open={runsPopoverOpen} onOpenChange={onRunsPopoverOpenChange}>
                  <Popover.Trigger asChild>
                    <button
                      className="text-sm text-[var(--agyn-dark)] transition-colors hover:text-[var(--agyn-blue)]"
                      onMouseEnter={() => onRunsPopoverOpenChange(true)}
                      onMouseLeave={() => onRunsPopoverOpenChange(false)}
                    >
                      {formatNumber(totalEvents)}{' '}
                      <span className="text-[var(--agyn-text-subtle)]">events</span>
                    </button>
                  </Popover.Trigger>
                  <Popover.Portal>
                    <Popover.Content
                      className="z-50 min-w-[200px] rounded-[10px] border border-[var(--agyn-border-subtle)] bg-white p-3 shadow-lg"
                      sideOffset={5}
                      onMouseEnter={() => onRunsPopoverOpenChange(true)}
                      onMouseLeave={() => onRunsPopoverOpenChange(false)}
                    >
                      <div className="space-y-2">
                        <div className="mb-3 text-xs font-medium text-[var(--agyn-dark)]">Event Statistics</div>

                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-1.5">
                              <MessageSquare className="h-3 w-3 text-[var(--agyn-blue)]" />
                              <span className="text-[var(--agyn-text-subtle)]">Message</span>
                            </div>
                            <span className="font-medium text-[var(--agyn-dark)]">{formatNumber(statistics.messages)}</span>
                          </div>
                          <div className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-1.5">
                              <Bot className="h-3 w-3 text-[var(--agyn-purple)]" />
                              <span className="text-[var(--agyn-text-subtle)]">LLM</span>
                            </div>
                            <span className="font-medium text-[var(--agyn-dark)]">{formatNumber(statistics.llm)}</span>
                          </div>
                          <div className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-1.5">
                              <Wrench className="h-3 w-3 text-[var(--agyn-cyan)]" />
                              <span className="text-[var(--agyn-text-subtle)]">Tool</span>
                            </div>
                            <span className="font-medium text-[var(--agyn-dark)]">{formatNumber(statistics.tools)}</span>
                          </div>
                          <div className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-1.5">
                              <FileText className="h-3 w-3 text-[var(--agyn-gray)]" />
                              <span className="text-[var(--agyn-text-subtle)]">Summary</span>
                            </div>
                            <span className="font-medium text-[var(--agyn-dark)]">{formatNumber(statistics.summaries)}</span>
                          </div>
                        </div>

                        <div className="border-t border-[var(--agyn-border-subtle)] pt-2">
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between text-xs">
                              <div className="flex items-center gap-1.5">
                                <StatusIndicator status="running" size="sm" showTooltip={false} />
                                <span className="text-[var(--agyn-text-subtle)]">Running</span>
                              </div>
                              <span className="font-medium text-[var(--agyn-dark)]">{formatNumber(runsByStatus.running)}</span>
                            </div>
                            <div className="flex items-center justify-between text-xs">
                              <div className="flex items-center gap-1.5">
                                <StatusIndicator status="finished" size="sm" showTooltip={false} />
                                <span className="text-[var(--agyn-text-subtle)]">Finished</span>
                              </div>
                              <span className="font-medium text-[var(--agyn-dark)]">{formatNumber(runsByStatus.finished)}</span>
                            </div>
                            <div className="flex items-center justify-between text-xs">
                              <div className="flex items-center gap-1.5">
                                <StatusIndicator status="failed" size="sm" showTooltip={false} />
                                <span className="text-[var(--agyn-text-subtle)]">Failed</span>
                              </div>
                              <span className="font-medium text-[var(--agyn-dark)]">{formatNumber(runsByStatus.failed)}</span>
                            </div>
                            <div className="flex items-center justify-between text-xs">
                              <div className="flex items-center gap-1.5">
                                <StatusIndicator status="terminated" size="sm" showTooltip={false} />
                                <span className="text-[var(--agyn-text-subtle)]">Terminated</span>
                              </div>
                              <span className="font-medium text-[var(--agyn-dark)]">{formatNumber(runsByStatus.terminated)}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                      <Popover.Arrow className="fill-white" />
                    </Popover.Content>
                  </Popover.Portal>
                </Popover.Root>

                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1">
                    <Tooltip.Provider>
                      <Tooltip.Root>
                        <Tooltip.Trigger asChild>
                          <div>
                            <IconButton
                              icon={<ScrollText className={isFollowing ? 'text-[var(--agyn-blue)]' : ''} />}
                              onClick={() => onFollowingChange(!isFollowing)}
                              variant="ghost"
                              size="sm"
                            />
                          </div>
                        </Tooltip.Trigger>
                        <Tooltip.Portal>
                          <Tooltip.Content
                            className="z-50 rounded-md bg-[var(--agyn-dark)] px-3 py-2 text-xs text-white"
                            sideOffset={5}
                          >
                            Follow new events
                            <Tooltip.Arrow className="fill-[var(--agyn-dark)]" />
                          </Tooltip.Content>
                        </Tooltip.Portal>
                      </Tooltip.Root>
                    </Tooltip.Provider>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <div>
                          <IconButton icon={<Settings2 />} variant="ghost" size="sm" />
                        </div>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="end"
                        className="w-56 rounded-[10px] border border-[var(--agyn-border-subtle)] bg-white p-1 shadow-lg"
                      >
                      <DropdownMenuGroup>
                        <DropdownMenuLabel className="px-3 py-2 text-xs font-medium text-[var(--agyn-text-subtle)]">
                          Event Kinds
                        </DropdownMenuLabel>
                        <DropdownMenuItem
                          className="flex items-center justify-between rounded-md px-3 py-2 text-sm transition-colors hover:bg-[var(--agyn-bg-light)] focus:bg-[var(--agyn-bg-light)]"
                          onSelect={(event) => {
                            event.preventDefault();
                            handleToggleEventFilter('message');
                          }}
                        >
                          <div className="flex items-center gap-2">
                            <MessageSquare className="h-4 w-4 text-[var(--agyn-blue)]" />
                            <span>Message</span>
                            <span className="text-xs text-[var(--agyn-text-subtle)]">
                              ({formatNumber(statistics.messages)})
                            </span>
                          </div>
                          {eventFilterSet.has('message') ? (
                            <Eye className="h-4 w-4 text-[var(--agyn-blue)]" />
                          ) : (
                            <EyeOff className="h-4 w-4 text-[var(--agyn-text-subtle)]" />
                          )}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="flex items-center justify-between rounded-md px-3 py-2 text-sm transition-colors hover:bg-[var(--agyn-bg-light)] focus:bg-[var(--agyn-bg-light)]"
                          onSelect={(event) => {
                            event.preventDefault();
                            handleToggleEventFilter('llm');
                          }}
                        >
                          <div className="flex items-center gap-2">
                            <Bot className="h-4 w-4 text-[var(--agyn-purple)]" />
                            <span>LLM</span>
                            <span className="text-xs text-[var(--agyn-text-subtle)]">
                              ({formatNumber(statistics.llm)})
                            </span>
                          </div>
                          {eventFilterSet.has('llm') ? (
                            <Eye className="h-4 w-4 text-[var(--agyn-blue)]" />
                          ) : (
                            <EyeOff className="h-4 w-4 text-[var(--agyn-text-subtle)]" />
                          )}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="flex items-center justify-between rounded-md px-3 py-2 text-sm transition-colors hover:bg-[var(--agyn-bg-light)] focus:bg-[var(--agyn-bg-light)]"
                          onSelect={(event) => {
                            event.preventDefault();
                            handleToggleEventFilter('tool');
                          }}
                        >
                          <div className="flex items-center gap-2">
                            <Wrench className="h-4 w-4 text-[var(--agyn-cyan)]" />
                            <span>Tool</span>
                            <span className="text-xs text-[var(--agyn-text-subtle)]">
                              ({formatNumber(statistics.tools)})
                            </span>
                          </div>
                          {eventFilterSet.has('tool') ? (
                            <Eye className="h-4 w-4 text-[var(--agyn-blue)]" />
                          ) : (
                            <EyeOff className="h-4 w-4 text-[var(--agyn-text-subtle)]" />
                          )}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="flex items-center justify-between rounded-md px-3 py-2 text-sm transition-colors hover:bg-[var(--agyn-bg-light)] focus:bg-[var(--agyn-bg-light)]"
                          onSelect={(event) => {
                            event.preventDefault();
                            handleToggleEventFilter('summary');
                          }}
                        >
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4 text-[var(--agyn-gray)]" />
                            <span>Summary</span>
                            <span className="text-xs text-[var(--agyn-text-subtle)]">
                              ({formatNumber(statistics.summaries)})
                            </span>
                          </div>
                          {eventFilterSet.has('summary') ? (
                            <Eye className="h-4 w-4 text-[var(--agyn-blue)]" />
                          ) : (
                            <EyeOff className="h-4 w-4 text-[var(--agyn-text-subtle)]" />
                          )}
                        </DropdownMenuItem>
                      </DropdownMenuGroup>

                      <DropdownMenuSeparator className="my-1 bg-[var(--agyn-border-subtle)]" />

                      <DropdownMenuGroup>
                        <DropdownMenuLabel className="px-3 py-2 text-xs font-medium text-[var(--agyn-text-subtle)]">
                          Event Status
                        </DropdownMenuLabel>
                        <DropdownMenuItem
                          className="flex items-center justify-between rounded-md px-3 py-2 text-sm transition-colors hover:bg-[var(--agyn-bg-light)] focus:bg-[var(--agyn-bg-light)]"
                          onSelect={(event) => {
                            event.preventDefault();
                            handleToggleStatusFilter('running');
                          }}
                        >
                          <div className="flex items-center gap-2">
                            <StatusIndicator status="running" size="sm" showTooltip={false} />
                            <span>Running</span>
                            <span className="text-xs text-[var(--agyn-text-subtle)]">({formatNumber(runsByStatus.running)})</span>
                          </div>
                          {statusFilterSet.has('running') ? (
                            <Eye className="h-4 w-4 text-[var(--agyn-blue)]" />
                          ) : (
                            <EyeOff className="h-4 w-4 text-[var(--agyn-text-subtle)]" />
                          )}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="flex items-center justify-between rounded-md px-3 py-2 text-sm transition-colors hover:bg-[var(--agyn-bg-light)] focus:bg-[var(--agyn-bg-light)]"
                          onSelect={(event) => {
                            event.preventDefault();
                            handleToggleStatusFilter('finished');
                          }}
                        >
                          <div className="flex items-center gap-2">
                            <StatusIndicator status="finished" size="sm" showTooltip={false} />
                            <span>Finished</span>
                            <span className="text-xs text-[var(--agyn-text-subtle)]">({formatNumber(runsByStatus.finished)})</span>
                          </div>
                          {statusFilterSet.has('finished') ? (
                            <Eye className="h-4 w-4 text-[var(--agyn-blue)]" />
                          ) : (
                            <EyeOff className="h-4 w-4 text-[var(--agyn-text-subtle)]" />
                          )}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="flex items-center justify-between rounded-md px-3 py-2 text-sm transition-colors hover:bg-[var(--agyn-bg-light)] focus:bg-[var(--agyn-bg-light)]"
                          onSelect={(event) => {
                            event.preventDefault();
                            handleToggleStatusFilter('failed');
                          }}
                        >
                          <div className="flex items-center gap-2">
                            <StatusIndicator status="failed" size="sm" showTooltip={false} />
                            <span>Failed</span>
                            <span className="text-xs text-[var(--agyn-text-subtle)]">({formatNumber(runsByStatus.failed)})</span>
                          </div>
                          {statusFilterSet.has('failed') ? (
                            <Eye className="h-4 w-4 text-[var(--agyn-blue)]" />
                          ) : (
                            <EyeOff className="h-4 w-4 text-[var(--agyn-text-subtle)]" />
                          )}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="flex items-center justify-between rounded-md px-3 py-2 text-sm transition-colors hover:bg-[var(--agyn-bg-light)] focus:bg-[var(--agyn-bg-light)]"
                          onSelect={(event) => {
                            event.preventDefault();
                            handleToggleStatusFilter('terminated');
                          }}
                        >
                          <div className="flex items-center gap-2">
                            <StatusIndicator status="terminated" size="sm" showTooltip={false} />
                            <span>Terminated</span>
                            <span className="text-xs text-[var(--agyn-text-subtle)]">({formatNumber(runsByStatus.terminated)})</span>
                          </div>
                          {statusFilterSet.has('terminated') ? (
                            <Eye className="h-4 w-4 text-[var(--agyn-blue)]" />
                          ) : (
                            <EyeOff className="h-4 w-4 text-[var(--agyn-text-subtle)]" />
                          )}
                        </DropdownMenuItem>
                      </DropdownMenuGroup>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  {onRefreshEvents && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={onRefreshEvents}
                      disabled={isRefreshingEvents}
                      className="whitespace-nowrap"
                    >
                      {isRefreshingEvents && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                      )}
                      Refresh
                    </Button>
                  )}

                  {onLoadMoreEvents && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={onLoadMoreEvents}
                      disabled={!hasMoreEvents || isLoadingMoreEvents}
                      className="whitespace-nowrap"
                    >
                      {isLoadingMoreEvents && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                      )}
                      Load older events
                    </Button>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap gap-2" role="group" aria-label="Status filters">
                  {(['running', 'finished', 'failed', 'terminated'] as StatusFilter[]).map((filter) => {
                    const active = statusFilterSet.has(filter);
                    const label = filter === 'finished' ? 'Success' : filter.charAt(0).toUpperCase() + filter.slice(1);
                    return (
                      <Button
                        key={filter}
                        type="button"
                        variant={active ? 'primary' : 'outline'}
                        size="sm"
                        onClick={() => handleToggleStatusFilter(filter)}
                        aria-pressed={active}
                        className="flex items-center gap-2"
                      >
                        <span aria-hidden="true">
                          <StatusIndicator status={filter} size="sm" showTooltip={false} />
                        </span>
                        <span>{label}</span>
                      </Button>
                    );
                  })}
                </div>
              </div>

              <div className="flex-1 overflow-hidden">
                {renderEventsList()}
              </div>
            </div>

          <div className="hidden flex-1 flex-col overflow-hidden bg-white md:flex">
            {renderEventDetails()}
          </div>
        </div>
      </div>

      {activeMobileEvent ? <MobileEventDialog event={activeMobileEvent} onClose={handleDismissMobileDetails} /> : null}
    </div>
  );
}

function describeMobileEvent(event: RunEvent): string {
  if (event.type === 'message') {
    const subtype = event.data.messageSubtype;
    if (subtype === 'result') return 'Message • Result';
    if (subtype === 'intermediate') return 'Message • Intermediate';
    return 'Message';
  }

  if (event.type === 'llm') {
    return 'LLM Call';
  }

  if (event.type === 'tool') {
    return event.data.toolName ? `Tool • ${event.data.toolName}` : 'Tool Call';
  }

  if (event.type === 'summarization') {
    return 'Summarization';
  }

  return 'Event';
}

interface MobileEventDialogProps {
  event: RunEvent;
  onClose: () => void;
}

function MobileEventDialog({ event, onClose }: MobileEventDialogProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const titleId = useMemo(() => `mobile-run-event-${event.id}`, [event.id]);
  const descriptionId = useMemo(() => `mobile-run-event-description-${event.id}`, [event.id]);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    if (closeButtonRef.current && typeof closeButtonRef.current.focus === 'function') {
      closeButtonRef.current.focus({ preventScroll: true });
    }

    const handleKeyDown = (keyboardEvent: KeyboardEvent) => {
      if (keyboardEvent.key === 'Escape') {
        keyboardEvent.preventDefault();
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previouslyFocused?.focus?.({ preventScroll: true });
    };
  }, [onClose]);

  useEffect(() => {
    const node = dialogRef.current;
    if (!node) return;

    const handleTrap = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const focusableSelectors = 'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';
      const focusable = Array.from(node.querySelectorAll<HTMLElement>(focusableSelectors)).filter((element) =>
        element.getAttribute('tabindex') !== '-1' && !element.hasAttribute('data-focus-guard'),
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (event.shiftKey) {
        if (active === first || !node.contains(active)) {
          event.preventDefault();
          last.focus();
        }
        return;
      }

      if (active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    node.addEventListener('keydown', handleTrap);
    return () => node.removeEventListener('keydown', handleTrap);
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[var(--agyn-dark)]/60 md:hidden">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="mt-auto w-full max-h-[90vh] overflow-hidden rounded-t-[16px] bg-white shadow-xl"
      >
        <div ref={dialogRef} className="flex h-full flex-col">
          <div className="flex items-start justify-between border-b border-[var(--agyn-border-subtle)] px-4 py-3">
            <div>
              <p id={titleId} className="text-sm font-medium text-[var(--agyn-dark)]">
                {describeMobileEvent(event)}
              </p>
              <p id={descriptionId} className="text-xs text-[var(--agyn-text-subtle)]">
                {event.timestamp}
              </p>
            </div>
            <button
              ref={closeButtonRef}
              type="button"
              onClick={onClose}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[var(--agyn-gray)] transition-colors hover:bg-[var(--agyn-bg-light)] hover:text-[var(--agyn-blue)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--agyn-blue)] focus-visible:ring-offset-2 focus-visible:ring-offset-white"
              aria-label="Close event details"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-3">
            <RunEventDetails event={event} />
          </div>
        </div>
      </div>
    </div>
  );
}
