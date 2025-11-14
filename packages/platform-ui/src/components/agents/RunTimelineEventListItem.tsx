import { forwardRef } from 'react';
import type { RunTimelineEvent } from '@/api/types/agents';
import { STATUS_COLORS, formatDuration, getEventTypeLabel } from './runTimelineFormatting';

type Props = {
  event: RunTimelineEvent;
  selected: boolean;
  onSelect: (eventId: string) => void;
};

export const RunTimelineEventListItem = forwardRef<HTMLDivElement, Props>(({ event, selected, onSelect }, ref) => {
  const timestamp = new Date(event.ts).toLocaleTimeString();

  return (
    <div
      id={`run-event-option-${event.id}`}
      ref={ref}
      role="option"
      aria-selected={selected}
      tabIndex={-1}
      data-event-id={event.id}
      className={`cursor-pointer rounded-md border px-3 py-2 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 ${selected ? 'border-blue-500 bg-blue-50' : 'border-transparent hover:bg-gray-50'}`}
      onClick={() => onSelect(event.id)}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-gray-900">{getEventTypeLabel(event)}</span>
        <span className={`text-white text-[10px] px-2 py-0.5 rounded ${STATUS_COLORS[event.status] ?? 'bg-gray-500'}`}>{event.status}</span>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-gray-500">
        <span>{timestamp}</span>
        <span aria-hidden="true">•</span>
        <span>{formatDuration(event.durationMs)}</span>
      </div>
    </div>
  );
});

RunTimelineEventListItem.displayName = 'RunTimelineEventListItem';
