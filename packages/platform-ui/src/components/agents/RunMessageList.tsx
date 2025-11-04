import React from 'react';
import { MessageBubble } from './MessageBubble';

export type UnifiedRunMessage = {
  id: string;
  role: string;
  text?: string | null;
  source: unknown;
  createdAt: string;
  side: 'left' | 'right';
};

type RunMessageListProps = {
  items: UnifiedRunMessage[];
  onToggleJson: (id: string) => void;
  showJson: Record<string, boolean>;
  isLoading?: boolean;
  error?: Error | null;
};

export function RunMessageList({ items, showJson, onToggleJson, isLoading, error }: RunMessageListProps) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const [atBottom, setAtBottom] = React.useState(true);

  const prevCount = React.useRef(0);
  React.useEffect(() => {
    const c = containerRef.current;
    if (!c) return;
    const justAppended = items.length > prevCount.current;
    if (justAppended && atBottom) {
      // Use scrollTop assignment for broad compatibility (jsdom and browsers)
      c.scrollTop = c.scrollHeight;
    }
    prevCount.current = items.length;
  }, [items, atBottom]);

  const onScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const threshold = 8;
    const nearBottom = el.scrollHeight - el.clientHeight - el.scrollTop <= threshold;
    setAtBottom(nearBottom);
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
        {error && <div className="text-sm text-red-600" role="alert">{error.message}</div>}
        {!isLoading && !error && items.length === 0 && <div className="text-sm text-gray-500">No messages</div>}
        {items.map((m) => (
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
        ))}
      </div>
      {!atBottom && (
        <button
          type="button"
          className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-white/90 border rounded px-3 py-1 shadow"
          onClick={() => {
            const c = containerRef.current;
            if (c) c.scrollTop = c.scrollHeight;
          }}
          data-testid="jump-to-latest"
        >
          Jump to latest
        </button>
      )}
    </div>
  );
}
