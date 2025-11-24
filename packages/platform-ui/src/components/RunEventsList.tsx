import { MessageSquare, Bot, Wrench, FileText, Terminal, Users, Loader2 } from 'lucide-react';
import { EventType, MessageSubtype } from './RunEventDetails';
import { StatusIndicator, Status } from './StatusIndicator';
import { VirtualizedList } from './VirtualizedList';

export interface RunEvent {
  id: string;
  type: EventType;
  timestamp: string;
  duration?: string;
  status?: Status;
  data: any;
}

export interface RunEventsListProps {
  events: RunEvent[];
  selectedEventId?: string;
  onSelectEvent: (eventId: string) => void;
  hasMore?: boolean;
  loadMore?: () => void;
  isLoadingMore?: boolean;
}

export function RunEventsList({ 
  events, 
  selectedEventId, 
  onSelectEvent, 
  hasMore = false, 
  loadMore = () => {}, 
  isLoadingMore = false 
}: RunEventsListProps) {

  const getEventIcon = (event: RunEvent) => {
    switch (event.type) {
      case 'message':
        return <MessageSquare className="w-4 h-4 text-[var(--agyn-blue)]" />;
      case 'llm':
        return <Bot className="w-4 h-4 text-[var(--agyn-purple)]" />;
      case 'tool':
        if (event.data?.toolSubtype === 'shell') {
          return <Terminal className="w-4 h-4 text-[var(--agyn-cyan)]" />;
        } else if (event.data?.toolSubtype === 'manage') {
          return <Users className="w-4 h-4 text-[var(--agyn-cyan)]" />;
        }
        return <Wrench className="w-4 h-4 text-[var(--agyn-cyan)]" />;
      case 'summarization':
        return <FileText className="w-4 h-4 text-[var(--agyn-gray)]" />;
    }
  };

  const getEventColor = (type: EventType) => {
    switch (type) {
      case 'message':
        return 'bg-[var(--agyn-blue)]/10 border-[var(--agyn-blue)]/20';
      case 'llm':
        return 'bg-[var(--agyn-purple)]/10 border-[var(--agyn-purple)]/20';
      case 'tool':
        return 'bg-[var(--agyn-cyan)]/10 border-[var(--agyn-cyan)]/20';
      case 'summarization':
        return 'bg-[var(--agyn-gray)]/10 border-[var(--agyn-gray)]/20';
    }
  };

  const getEventLabel = (event: RunEvent) => {
    if (event.type === 'message') {
      const messageSubtype: MessageSubtype = event.data?.messageSubtype || 'source';
      switch (messageSubtype) {
        case 'source':
          return 'Message • Source';
        case 'intermediate':
          return 'Message • Intermediate';
        case 'result':
          return 'Message • Result';
      }
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
  };

  const getEventSubtitle = (event: RunEvent) => {
    return null;
  };

  const renderEventItem = (index: number, event: RunEvent) => {
    const subtitle = getEventSubtitle(event);
    const isSelected = selectedEventId === event.id;
    
    return (
      <button
        onClick={() => onSelectEvent(event.id)}
        className={`w-full px-4 py-3 border-b border-[var(--agyn-border-subtle)] hover:bg-[var(--agyn-bg-light)] transition-colors text-left relative ${
          isSelected ? 'bg-[var(--agyn-bg-light)]' : ''
        }`}
      >
        {/* Active Indicator Bar */}
        {isSelected && (
          <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-[var(--agyn-blue)]" />
        )}
        
        <div className="flex items-start gap-3">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 border ${getEventColor(event.type)}`}>
            {getEventIcon(event)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <div className="text-sm text-[var(--agyn-dark)] truncate">
                {getEventLabel(event)}
              </div>
              {event.status && (
                <StatusIndicator status={event.status} size="sm" showTooltip={false} />
              )}
            </div>
            {subtitle && (
              <div className="text-xs text-[var(--agyn-gray)] truncate mb-1">
                {subtitle}
              </div>
            )}
            <div className="text-xs text-[var(--agyn-gray)]">
              {event.timestamp}
              {event.duration && ` • ${event.duration}`}
            </div>
          </div>
        </div>
      </button>
    );
  };

  const header = hasMore ? (
    <div className="p-4 flex items-center justify-center">
      {isLoadingMore ? (
        <div className="flex items-center gap-2 text-[var(--agyn-gray)]">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-xs">Loading more events...</span>
        </div>
      ) : (
        <div className="text-xs text-[var(--agyn-gray)]">Scroll up to load more</div>
      )}
    </div>
  ) : null;

  return (
    <div className="bg-white overflow-hidden h-full flex flex-col">
      <VirtualizedList
        items={events}
        renderItem={renderEventItem}
        getItemKey={(event) => event.id}
        hasMore={hasMore}
        isLoadingMore={isLoadingMore}
        onLoadMore={loadMore}
        header={header}
        style={{ flex: 1 }}
      />
    </div>
  );
}