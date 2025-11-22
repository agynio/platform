import { ReactNode } from 'react';
import { User, Bot, Terminal, Settings } from 'lucide-react';
import { MarkdownContent } from './MarkdownContent';

export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

interface MessageProps {
  role: MessageRole;
  content: ReactNode;
  timestamp?: string;
  className?: string;
}

const roleConfig = {
  system: {
    color: 'var(--agyn-gray)',
    bg: 'var(--agyn-bg-light)',
    icon: Settings,
    label: 'System',
  },
  user: {
    color: 'var(--agyn-blue)',
    bg: '#EFF6FF',
    icon: User,
    label: 'User',
  },
  assistant: {
    color: 'var(--agyn-purple)',
    bg: '#F5F3FF',
    icon: Bot,
    label: 'Assistant',
  },
  tool: {
    color: 'var(--agyn-cyan)',
    bg: '#ECFEFF',
    icon: Terminal,
    label: 'Tool',
  },
};

export function Message({ role, content, timestamp, className = '' }: MessageProps) {
  const config = roleConfig[role];
  const Icon = config.icon;

  return (
    <div className={`flex justify-start mb-4 min-w-0 ${className}`}>
      <div className="flex gap-3 max-w-full min-w-0 flex-1">
        {/* Avatar */}
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: config.bg }}
        >
          <Icon className="w-4 h-4" style={{ color: config.color }} />
        </div>

        {/* Message Content */}
        <div className="flex flex-col gap-1 flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs" style={{ color: config.color }}>
              {config.label}
            </span>
            {timestamp && (
              <span className="text-xs text-[var(--agyn-gray)]">{timestamp}</span>
            )}
          </div>
          <div className="text-[var(--agyn-dark)] min-w-0">
            {typeof content === 'string' ? (
              <MarkdownContent content={content} />
            ) : (
              content
            )}
          </div>
        </div>
      </div>
    </div>
  );
}