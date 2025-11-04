import React from 'react';

export type MessageBubbleProps = {
  id: string;
  role: string;
  timestamp: string;
  text?: string | null;
  source: unknown;
  side: 'left' | 'right';
  showJson: boolean;
  onToggleJson: (id: string) => void;
};

export function MessageBubble({ id, role, timestamp, text, source, side, showJson, onToggleJson }: MessageBubbleProps) {
  return (
    <div
      className={`max-w-[85%] ${side === 'left' ? 'self-start' : 'self-end'}`}
      data-testid="message-bubble"
      data-side={side}
      role="listitem"
      aria-label={`${role} message at ${new Date(timestamp).toLocaleTimeString()}`}
    >
      <div className={`rounded-lg border ${side === 'left' ? 'bg-white' : 'bg-gray-50'} p-3 shadow-sm`}>
        <div className="text-xs text-gray-600 flex items-center justify-between">
          <span className="font-medium">{role}</span>
          <time dateTime={timestamp}>{new Date(timestamp).toLocaleTimeString()}</time>
        </div>
        <div className="mt-2 text-sm whitespace-pre-wrap leading-relaxed">
          {text ? text : <span className="text-gray-500">(no text)</span>}
        </div>
        <div className="mt-2">
          <button
            type="button"
            className="text-xs underline hover:no-underline"
            onClick={() => onToggleJson(id)}
            aria-expanded={!!showJson}
            aria-controls={`raw-${id}`}
          >
            {showJson ? 'Hide raw JSON' : 'Show raw JSON'}
          </button>
          {showJson && (
            <pre
              id={`raw-${id}`}
              className="mt-2 text-xs bg-gray-100 p-2 rounded overflow-x-auto"
              data-testid="raw-json"
              tabIndex={0}
            >
              {JSON.stringify(source, null, 2)}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}

