import { useState } from 'react';
import type { RunTimelineEvent } from '@/api/types/agents';
import { RunTimelineEventDetails } from './RunTimelineEventDetails';
import { STATUS_COLORS, formatDuration, getEventTypeLabel } from './runTimelineFormatting';

type Props = {
  event: RunTimelineEvent;
};

export function RunTimelineEventCard({ event }: Props) {
  const [expanded, setExpanded] = useState(false);
  const timestamp = new Date(event.ts).toLocaleString();
  const durationLabel = formatDuration(event.durationMs);
  const typeLabel = getEventTypeLabel(event);

  return (
    <div className="border rounded-md bg-white shadow-sm p-3" data-testid="timeline-event">
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="flex flex-col text-left">
          <span className="text-xs text-gray-500">{timestamp} • {durationLabel}</span>
          <span className="text-sm font-semibold">{typeLabel}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-white text-xs px-2 py-0.5 rounded ${STATUS_COLORS[event.status] ?? 'bg-gray-500'}`}>{event.status}</span>
          <button
            type="button"
            className="text-xs px-2 py-0.5 border rounded bg-gray-50 hover:bg-gray-100"
            onClick={() => setExpanded((prev) => !prev)}
          >
            {expanded ? 'Hide details' : 'Show details'}
          </button>
        </div>
      </div>
      {expanded && (
        <div className="mt-3">
          <RunTimelineEventDetails event={event} />
        </div>
      )}
    </div>
  );
}
