import { type ReactNode } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Clock } from 'lucide-react';

interface QueuedMessageProps {
  content: ReactNode;
  kind?: 'user' | 'assistant' | 'system';
  enqueuedAt?: string;
  className?: string;
}

export function QueuedMessage({
  content,
  kind = 'user',
  enqueuedAt,
  className = '',
}: QueuedMessageProps) {
  const kindLabel = kind === 'assistant' ? 'Assistant' : kind === 'system' ? 'System' : 'User';
  let relativeTime: string | null = null;
  if (enqueuedAt) {
    const ts = Date.parse(enqueuedAt);
    if (Number.isFinite(ts)) {
      relativeTime = formatDistanceToNow(ts, { addSuffix: true });
    }
  }

  return (
    <div className={`flex justify-start mb-4 ${className}`} data-testid="queued-message">
      <div className="flex gap-3 max-w-[70%]">
        {/* Avatar */}
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: 'var(--agyn-bg-light)' }}
        >
          <Clock className="w-4 h-4 text-[var(--agyn-gray)]" />
        </div>

        {/* Message Content */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="text-xs text-[var(--agyn-gray)]">
              {relativeTime ? `${kindLabel} · ${relativeTime}` : kindLabel}
            </span>
          </div>
          <div className="text-[var(--agyn-gray)]">
            {content}
          </div>
        </div>
      </div>
    </div>
  );
}
