import { useCallback, useEffect, useMemo, useRef, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { MessageSquare, Bot, Wrench, FileText, Terminal, Users, Loader2 } from 'lucide-react';
import { type EventType, type MessageSubtype, type RunEventData } from './RunEventDetails';
import { StatusIndicator, type Status } from './StatusIndicator';
import { VirtualizedList } from './VirtualizedList';

export interface RunEvent {
  id: string;
  type: EventType;
  timestamp: string;
  duration?: string;
  status?: Status;
  data: RunEventData;
}

export interface RunEventsListProps {
  events: RunEvent[];
  selectedEventId?: string;
  onSelectEvent: (eventId: string) => void;
  hasMore?: boolean;
  loadMore?: () => void;
  isLoadingMore?: boolean;
  errorMessage?: string;
}

function getEventIcon(event: RunEvent) {
  switch (event.type) {
    case 'message':
      return <MessageSquare className="h-4 w-4 text-[var(--agyn-blue)]" />;
    case 'llm':
      return <Bot className="h-4 w-4 text-[var(--agyn-purple)]" />;
    case 'tool':
      if (event.data?.toolSubtype === 'shell') {
        return <Terminal className="h-4 w-4 text-[var(--agyn-cyan)]" />;
      }
      if (event.data?.toolSubtype === 'manage') {
        return <Users className="h-4 w-4 text-[var(--agyn-cyan)]" />;
      }
      return <Wrench className="h-4 w-4 text-[var(--agyn-cyan)]" />;
    case 'summarization':
      return <FileText className="h-4 w-4 text-[var(--agyn-gray)]" />;
    default:
      return null;
  }
}

function getEventColor(type: EventType) {
  switch (type) {
    case 'message':
      return 'bg-[var(--agyn-blue)]/10 border-[var(--agyn-blue)]/20';
    case 'llm':
      return 'bg-[var(--agyn-purple)]/10 border-[var(--agyn-purple)]/20';
    case 'tool':
      return 'bg-[var(--agyn-cyan)]/10 border-[var(--agyn-cyan)]/20';
    case 'summarization':
      return 'bg-[var(--agyn-gray)]/10 border-[var(--agyn-gray)]/20';
    default:
      return '';
  }
}

function getEventLabel(event: RunEvent) {
  if (event.type === 'message') {
    const subtypeCandidate = event.data.messageSubtype;
    const subtype: MessageSubtype =
      subtypeCandidate === 'intermediate' || subtypeCandidate === 'result' ? subtypeCandidate : 'source';
    if (subtype === 'result') return 'Message • Result';
    if (subtype === 'intermediate') return 'Message • Intermediate';
    return 'Message • Source';
  }

  switch (event.type) {
    case 'llm':
      return 'LLM Call';
    case 'tool':
      return event.data?.toolName || 'Tool Call';
    case 'summarization':
      return 'Summarization';
    default:
      return 'Event';
  }
}

function getEventSubtitle(_event: RunEvent) {
  return null;
}

export function RunEventsList({
  events,
  selectedEventId,
  onSelectEvent,
  hasMore = false,
  loadMore,
  isLoadingMore = false,
  errorMessage,
}: RunEventsListProps) {
  const listRef = useRef<HTMLDivElement | null>(null);
  const eventCount = events.length;
  const selectedIndex = useMemo(
    () => events.findIndex((event) => event.id === selectedEventId),
    [events, selectedEventId],
  );

  const activeDescendantId = selectedEventId ? `run-events-option-${selectedEventId}` : undefined;

  const focusList = useCallback(() => {
    const node = listRef.current;
    if (!node) return;
    if (typeof node.focus === 'function') {
      node.focus({ preventScroll: true });
    }
  }, []);

  const handleItemSelect = useCallback(
    (eventId: string) => {
      onSelectEvent(eventId);
      if (typeof window !== 'undefined') {
        window.requestAnimationFrame(() => {
          focusList();
        });
      }
    },
    [focusList, onSelectEvent],
  );

  const handleKeyDown = useCallback(
    (keyboardEvent: ReactKeyboardEvent<HTMLDivElement>) => {
      if (keyboardEvent.altKey || keyboardEvent.metaKey || keyboardEvent.ctrlKey) return;
      if (eventCount === 0) return;

      const key = keyboardEvent.key;
      const clampIndex = (index: number) => Math.min(Math.max(index, 0), eventCount - 1);

      if (key === 'ArrowDown' || key === 'ArrowUp') {
        keyboardEvent.preventDefault();
        const delta = key === 'ArrowDown' ? 1 : -1;
        const fallbackIndex = key === 'ArrowDown' ? 0 : eventCount - 1;
        const nextIndex = clampIndex(selectedIndex >= 0 ? selectedIndex + delta : fallbackIndex);
        const target = events[nextIndex];
        if (target) handleItemSelect(target.id);
        return;
      }

      if (key === 'Home') {
        keyboardEvent.preventDefault();
        const target = events[0];
        if (target) handleItemSelect(target.id);
        return;
      }

      if (key === 'End') {
        keyboardEvent.preventDefault();
        const target = events[eventCount - 1];
        if (target) handleItemSelect(target.id);
      }
    },
    [eventCount, events, handleItemSelect, selectedIndex],
  );

  useEffect(() => {
    if (!selectedEventId) return;
    if (typeof window === 'undefined') return;

    const raf = window.requestAnimationFrame(() => {
      const container = listRef.current;
      if (!container) return;
      const option = container.querySelector<HTMLButtonElement>(`[data-event-id="${selectedEventId}"]`);
      if (option && typeof option.scrollIntoView === 'function') {
        option.scrollIntoView({ block: 'nearest' });
      }
    });

    return () => {
      window.cancelAnimationFrame(raf);
    };
  }, [events, selectedEventId]);

  const header = hasMore ? (
    <div className="flex items-center justify-center p-4">
      {isLoadingMore ? (
        <div className="flex items-center gap-2 text-[var(--agyn-gray)]">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-xs">Loading more events…</span>
        </div>
      ) : (
        <div className="text-xs text-[var(--agyn-gray)]">Scroll up to load more</div>
      )}
    </div>
  ) : null;

  const footer = !hasMore && eventCount > 0 ? (
    <div className="px-4 py-2 text-center text-xs text-[var(--agyn-gray)]">Beginning of timeline</div>
  ) : null;

  const renderEventItem = useCallback(
    (_index: number, event: RunEvent) => {
      const subtitle = getEventSubtitle(event);
      const isSelected = selectedEventId === event.id;
      const optionId = `run-events-option-${event.id}`;

      return (
        <button
          id={optionId}
          type="button"
          role="option"
          aria-selected={isSelected}
          data-event-id={event.id}
          tabIndex={-1}
          onClick={() => handleItemSelect(event.id)}
          className={`relative w-full border-b border-[var(--agyn-border-subtle)] px-4 py-3 text-left transition-colors hover:bg-[var(--agyn-bg-light)] ${
            isSelected ? 'bg-[var(--agyn-bg-light)]' : ''
          }`}
        >
          {isSelected && <div className="absolute inset-y-0 left-0 w-[3px] bg-[var(--agyn-blue)]" />}
          <div className="flex items-start gap-3">
            <div className={`mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border ${getEventColor(event.type)}`}>
              {getEventIcon(event)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="mb-0.5 flex items-center gap-2">
                <div className="truncate text-sm text-[var(--agyn-dark)]">{getEventLabel(event)}</div>
                {event.status && <StatusIndicator status={event.status} size="sm" showTooltip={false} />}
              </div>
              {subtitle && <div className="mb-1 truncate text-xs text-[var(--agyn-gray)]">{subtitle}</div>}
              <div className="text-xs text-[var(--agyn-gray)]">
                {event.timestamp}
                {event.duration && ` • ${event.duration}`}
              </div>
            </div>
          </div>
        </button>
      );
    },
    [handleItemSelect, selectedEventId],
  );

  return (
    <div className="flex h-full flex-col overflow-hidden bg-white">
      {errorMessage ? (
        <div className="border-b border-[var(--agyn-border-subtle)] bg-[var(--agyn-bg-light)] px-4 py-2 text-xs text-[var(--agyn-red)]">
          {errorMessage}
        </div>
      ) : null}
      <VirtualizedList
        items={events}
        renderItem={renderEventItem}
        getItemKey={(event) => event.id}
        hasMore={hasMore}
        isLoadingMore={isLoadingMore}
        onLoadMore={loadMore}
        header={header}
        footer={footer}
        style={{ flex: 1 }}
        scrollerRef={listRef}
        scrollerProps={{
          role: 'listbox',
          'aria-label': 'Run events',
          tabIndex: 0,
          onKeyDown: handleKeyDown,
          ...(activeDescendantId ? { 'aria-activedescendant': activeDescendantId } : {}),
        }}
      />
    </div>
  );
}
