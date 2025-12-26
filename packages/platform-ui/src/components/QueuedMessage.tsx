import { type ReactNode } from 'react';
import { Clock, Loader2, Trash2 } from 'lucide-react';
import { IconButton } from './IconButton';

interface QueuedMessageProps {
  content: ReactNode;
  className?: string;
  onCancel?: () => void;
  isCancelling?: boolean;
}

export function QueuedMessage({
  content,
  className = '',
  onCancel,
  isCancelling = false,
}: QueuedMessageProps) {
  return (
    <div className={`flex justify-start mb-4 ${className}`}>
      <div className="flex gap-3 max-w-[70%]">
        {/* Avatar */}
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: 'var(--agyn-bg-light)' }}
        >
          <Clock className="w-4 h-4 text-[var(--agyn-gray)]" />
        </div>

        {/* Message Content */}
        <div className="flex flex-col gap-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-[var(--agyn-gray)]">User</span>
            {onCancel ? (
              <IconButton
                icon={
                  isCancelling ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />
                }
                size="xs"
                variant="danger"
                aria-label="Cancel queued message"
                title="Cancel queued message"
                disabled={isCancelling}
                onClick={onCancel}
              />
            ) : null}
          </div>
          <div className="text-[var(--agyn-gray)] break-words">
            {content}
          </div>
        </div>
      </div>
    </div>
  );
}
