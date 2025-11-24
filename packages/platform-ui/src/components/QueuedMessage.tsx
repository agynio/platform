import { ReactNode } from 'react';
import { Clock } from 'lucide-react';

interface QueuedMessageProps {
  content: ReactNode;
  className?: string;
}

export function QueuedMessage({
  content,
  className = '',
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
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="text-xs text-[var(--agyn-gray)]">
              User
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