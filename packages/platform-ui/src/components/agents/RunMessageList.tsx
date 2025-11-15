import React from 'react';
import { MessageBubble } from './MessageBubble';
import { ReminderCountdown } from './ReminderCountdown';

export type RunMeta = { id: string; status: 'running' | 'finished' | 'terminated'; createdAt: string; updatedAt: string };
export type UnifiedRunMessage = {
  id: string;
  role: string;
  text?: string | null;
  source: unknown;
  createdAt: string;
  side: 'left' | 'right';
  runId: string;
};
export type UnifiedListItem =
  | { type: 'run_header'; run: RunMeta; start?: string; end?: string; durationMs?: number }
  | { type: 'message'; message: UnifiedRunMessage }
  | {
      type: 'reminder';
      reminder: { id: string; threadId: string; note: string; at: string };
      serverOffsetMs?: number;
      onExpire?: () => void;
    };

type RunMessageListProps = {
  items: UnifiedListItem[];
  onToggleJson: (id: string) => void;
  showJson: Record<string, boolean>;
  isLoading?: boolean;
  error?: Error | null;
  // Upward lazy-loading
  hasMoreAbove?: boolean;
  loadingMoreAbove?: boolean;
  onLoadMoreAbove?: () => void;
  onViewRunTimeline?: (run: RunMeta) => void;
};

export function RunMessageList({ items, showJson, onToggleJson, isLoading, error, hasMoreAbove, loadingMoreAbove, onLoadMoreAbove, onViewRunTimeline }: RunMessageListProps) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const [atBottom, setAtBottom] = React.useState(true);

  const prevCount = React.useRef(0);
  React.useEffect(() => {
    const c = containerRef.current;
    if (!c) return;
    const justAppended = items.length > prevCount.current;
    if (justAppended && atBottom) {
      // Use scrollTop assignment; guard in case of read-only in test envs
      try {
        c.scrollTop = c.scrollHeight;
      } catch (_err) {
        // ignore read-only scrollTop in test envs
        void _err;
      }
    }
    prevCount.current = items.length;
  }, [items, atBottom]);

  const onScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const threshold = 8;
    const nearBottom = el.scrollHeight - el.clientHeight - el.scrollTop <= threshold;
    setAtBottom(nearBottom);
    const nearTop = el.scrollTop <= threshold;
    if (nearTop && hasMoreAbove && !loadingMoreAbove) {
      onLoadMoreAbove?.();
    }
  };

  return (
    <div className="relative h-full" aria-busy={!!isLoading || undefined}>
      <div className="text-sm font-medium px-2 py-1">Messages</div>
      <div
        ref={containerRef}
        className="h-[calc(100%-2rem)] overflow-auto p-2 flex flex-col gap-2"
        onScroll={onScroll}
        aria-live="polite"
        aria-label="Run messages"
        role="list"
        data-testid="message-list"
      >
        {isLoading && <div className="text-sm text-gray-500">Loading…</div>}
        {loadingMoreAbove && <div className="text-xs text-gray-500 self-center">Loading older messages…</div>}
        {error && <div className="text-sm text-red-600" role="alert">{error.message}</div>}
        {!isLoading && !error && items.length === 0 && <div className="text-sm text-gray-500">No messages</div>}
        {items.map((it, idx) => {
          if (it.type === 'run_header') {
            const run = it.run;
            const shortId = run.id.slice(0, 8);
            const range = it.start && it.end ? `${new Date(it.start).toLocaleTimeString()}–${new Date(it.end).toLocaleTimeString()}` : '';
            return (
              <div key={`hdr-${run.id}-${idx}`} className="self-center text-xs text-gray-600 my-1 flex items-center gap-2" role="separator" data-testid="run-header">
                <span className="px-2 py-0.5 rounded border bg-white">run {shortId}</span>
                <span
                  className="inline-block px-1.5 py-0.5 rounded text-white"
                  style={{ backgroundColor: run.status === 'finished' ? '#16a34a' : run.status === 'running' ? '#2563eb' : '#6b7280' }}
                >
                  {run.status}
                </span>
                {range && <span className="text-gray-500">{range}</span>}
                {onViewRunTimeline && (
                  <button
                    type="button"
                    className="ml-2 px-2 py-0.5 text-xs border rounded bg-white hover:bg-gray-100"
                    onClick={() => onViewRunTimeline(run)}
                  >
                    Timeline
                  </button>
                )}
              </div>
            );
          }
          if (it.type === 'reminder') {
            return (
              <div key={`reminder-${it.reminder.id}`} role="listitem" data-testid="reminder-countdown-row" className="self-stretch">
                <ReminderCountdown
                  threadId={it.reminder.threadId}
                  at={it.reminder.at}
                  note={it.reminder.note}
                  serverOffsetMs={it.serverOffsetMs}
                  onExpire={it.onExpire}
                />
              </div>
            );
          }
          const m = it.message;
          return (
            <MessageBubble
              key={m.id}
              id={m.id}
              role={m.role}
              timestamp={m.createdAt}
              text={m.text}
              source={m.source}
              side={m.side}
              showJson={!!showJson[m.id]}
              onToggleJson={onToggleJson}
            />
          );
        })}
      </div>
      {!atBottom && (
        <button
          type="button"
          className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-white/90 border rounded px-3 py-1 shadow"
          onClick={() => {
            const c = containerRef.current;
            if (c) {
              try {
                c.scrollTop = c.scrollHeight;
              } catch (_err) {
                // ignore read-only scrollTop in test envs
                void _err;
              }
            }
          }}
          data-testid="jump-to-latest"
        >
          New messages
        </button>
      )}
    </div>
  );
}
