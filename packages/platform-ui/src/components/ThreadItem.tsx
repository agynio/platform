import { ChevronRight, ChevronDown } from 'lucide-react';
import { StatusIndicator, type Status } from './StatusIndicator';

export type ThreadStatus = 'running' | 'pending' | 'finished' | 'failed';

export interface Thread {
  id: string;
  summary: string;
  agentName: string;
  agentAvatar?: string;
  createdAt: string;
  status: ThreadStatus;
  isOpen: boolean;
  subthreads?: Thread[];
}

interface ThreadItemProps {
  thread: Thread;
  depth?: number;
  onToggleExpand?: (threadId: string) => void;
  onSelect?: (threadId: string) => void;
  isExpanded?: boolean;
  isSelected?: boolean;
}

const getAgentAvatarColor = (agentName: string): string => {
  // Use consistent colors based on agent name
  const colors = [
    'var(--agyn-blue)',
    'var(--agyn-purple)',
    'var(--agyn-cyan)',
    '#10B981',
    '#F59E0B',
  ];
  const hash = agentName.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return colors[hash % colors.length];
};

export function ThreadItem({
  thread,
  depth = 0,
  onToggleExpand,
  onSelect,
  isExpanded = false,
  isSelected = false,
}: ThreadItemProps) {
  const hasSubthreads = thread.subthreads && thread.subthreads.length > 0;
  const indentWidth = depth * 24; // Reduced from 32px to 24px
  const avatarColor = getAgentAvatarColor(thread.agentName);

  const handleToggleExpand = () => {
    if (hasSubthreads && onToggleExpand) {
      onToggleExpand(thread.id);
    }
  };

  const handleSelect = () => {
    if (onSelect) {
      onSelect(thread.id);
    }
  };

  return (
    <div>
      {/* Thread Item */}
      <div
        className={`group cursor-pointer transition-colors relative ${
          isSelected ? 'bg-[var(--agyn-blue)]/5' : ''
        }`}
      >
        {/* Selected indicator - absolute positioned to avoid layout shift */}
        {isSelected && (
          <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-[var(--agyn-blue)] z-10" />
        )}
        
        <div
          className="flex items-start gap-3 px-4 py-3 hover:bg-[var(--agyn-bg-light)] relative"
          style={{ paddingLeft: `${16 + indentWidth}px` }}
          onClick={handleSelect}
        >
          {/* Avatar */}
          <div
            className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-white text-sm"
            style={{ backgroundColor: avatarColor }}
          >
            {thread.agentAvatar || thread.agentName.charAt(0).toUpperCase()}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm text-[var(--agyn-dark)]">{thread.agentName}</span>
              <span className="text-xs text-[var(--agyn-gray)]">•</span>
              <span className="text-xs text-[var(--agyn-gray)]">{thread.createdAt}</span>
            </div>
            <p className="text-sm text-[var(--agyn-dark)] overflow-hidden" style={{ 
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical'
            }}>
              {thread.summary}
            </p>
          </div>

          {/* Status Indicator */}
          <div className="flex-shrink-0 flex items-center gap-2">
            <StatusIndicator status={thread.status as Status} size="sm" />
          </div>
        </div>

        {/* Expand/Collapse Button - Below Content */}
        {hasSubthreads && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleToggleExpand();
            }}
            className="w-full px-4 py-1.5 flex items-center gap-2 text-xs text-[var(--agyn-gray)] hover:bg-[var(--agyn-bg-light)] transition-colors relative"
            style={{ paddingLeft: `${16 + indentWidth + 44}px` }}
          >
            {isExpanded ? (
              <>
                <ChevronDown className="w-3.5 h-3.5" />
                <span>Hide {thread.subthreads?.length} subthread{thread.subthreads?.length !== 1 ? 's' : ''}</span>
              </>
            ) : (
              <>
                <ChevronRight className="w-3.5 h-3.5" />
                <span>Show {thread.subthreads?.length} subthread{thread.subthreads?.length !== 1 ? 's' : ''}</span>
              </>
            )}
          </button>
        )}
        
        {/* Border after item */}
        <div 
          className="border-b border-[var(--agyn-border-subtle)]"
          style={{ marginLeft: depth > 0 ? `${indentWidth}px` : '0' }}
        />
      </div>
    </div>
  );
}
