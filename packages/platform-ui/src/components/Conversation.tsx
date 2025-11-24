import { type ReactNode, useRef, useEffect, useState } from 'react';
import { Message, type MessageRole } from './Message';
import { RunInfo } from './RunInfo';
import { QueuedMessage } from './QueuedMessage';
import { Reminder } from './Reminder';
import { StatusIndicator, type Status } from './StatusIndicator';

export interface ConversationMessage {
  id: string;
  role: MessageRole;
  content: ReactNode;
  timestamp?: string;
}

export interface Run {
  id: string;
  messages: ConversationMessage[];
  status: 'finished' | 'running' | 'failed' | 'pending';
  duration?: string;
  tokens?: number;
  cost?: string;
}

export interface QueuedMessageData {
  id: string;
  content: ReactNode;
}

export interface ReminderData {
  id: string;
  content: ReactNode;
  scheduledTime: string;
  date?: string;
}

interface ConversationProps {
  runs: Run[];
  queuedMessages?: QueuedMessageData[];
  reminders?: ReminderData[];
  header?: ReactNode;
  footer?: ReactNode;
  className?: string;
  defaultCollapsed?: boolean;
  collapsed?: boolean;
}

export function Conversation({
  runs,
  queuedMessages = [],
  reminders = [],
  header,
  footer,
  className = '',
  defaultCollapsed = false,
  collapsed,
}: ConversationProps) {
  const messagesRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [runHeights, setRunHeights] = useState<Map<string, number>>(new Map());

  // Use controlled or uncontrolled state
  const isCollapsed = collapsed ?? defaultCollapsed;
  
  // Measure run heights for the sticky run info column
  useEffect(() => {
    const newHeights = new Map<string, number>();
    runs.forEach((run) => {
      const element = messagesRefs.current.get(run.id);
      if (element) {
        newHeights.set(run.id, element.offsetHeight);
      }
    });
    setRunHeights(newHeights);
  }, [runs]);

  const hasQueueOrReminders = queuedMessages.length > 0 || reminders.length > 0;

  return (
    <div className={`flex flex-col h-full bg-white rounded-[10px] border border-[var(--agyn-border-subtle)] overflow-hidden ${className}`}>
      {/* Header */}
      {header && (
        <div className="px-6 py-4 border-b border-[var(--agyn-border-subtle)] bg-[var(--agyn-bg-light)]">
          {header}
        </div>
      )}

      {/* Main Content Area - Single Scroll Container */}
      <div className="flex-1 min-w-0 overflow-y-auto flex flex-col">
        {/* Runs Container */}
        <div className="flex flex-col flex-1 min-w-0">
          {/* Runs */}
          {runs.map((run, index) => {
            return (
              <div key={run.id} className="min-w-0">
                {/* Run Divider - spans both columns */}
                {index > 0 && (
                  <div className="border-t border-[var(--agyn-border-subtle)]" />
                )}
                
                {/* Run content - two columns */}
                <div className="flex min-w-0">
                  {/* Messages Column */}
                  <div className="flex-1 min-w-0 px-6 pt-6 pb-2">
                    <div
                      className="min-w-0"
                      ref={(el) => {
                        if (el) messagesRefs.current.set(run.id, el);
                      }}
                    >
                      {run.messages.map((message) => (
                        <Message
                          key={message.id}
                          role={message.role}
                          content={message.content}
                          timestamp={message.timestamp}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Run Info Column */}
                  <div className={`flex-shrink-0 border-l border-[var(--agyn-border-subtle)] bg-[var(--agyn-bg-light)]/50 relative transition-all ${isCollapsed ? 'w-8' : 'w-[150px]'}`}>
                    <div className={isCollapsed ? 'pt-6 pb-6 flex items-center justify-center' : 'pt-6 px-6 pb-6'}>
                      {isCollapsed ? (
                        // Collapsed View - Just StatusIndicator
                        <div
                          className="relative w-full"
                          style={{ height: `${runHeights.get(run.id) || 0}px` }}
                        >
                          <div className="sticky flex justify-center" style={{ top: '21px' }}>
                            <StatusIndicator status={run.status as Status} size="sm" />
                          </div>
                        </div>
                      ) : (
                        // Expanded View - Full Info
                        <RunInfo
                          runId={run.id}
                          status={run.status}
                          duration={run.duration}
                          tokens={run.tokens}
                          cost={run.cost}
                          height={runHeights.get(run.id) || 0}
                        />
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Queue and Reminders Section */}
          {hasQueueOrReminders && (
            <div className="flex min-w-0">
              {/* Pending messages in left column */}
              <div className="flex-1 min-w-0 px-6 pb-6">
                <div className="pt-6 min-w-0">
                  {/* Pending Divider */}
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-8 border-t border-[var(--agyn-border-subtle)]" />
                    <span className="text-xs text-[var(--agyn-gray)] tracking-wider">PENDING</span>
                    <div className="flex-1 border-t border-[var(--agyn-border-subtle)]" />
                  </div>
                  
                  <div className="space-y-3">
                    {/* Queued Messages */}
                    {queuedMessages.map((msg) => (
                      <QueuedMessage
                        key={msg.id}
                        content={msg.content}
                      />
                    ))}

                    {/* Reminders */}
                    {reminders.map((reminder) => (
                      <Reminder
                        key={reminder.id}
                        content={reminder.content}
                        scheduledTime={reminder.scheduledTime}
                        date={reminder.date}
                      />
                    ))}
                  </div>
                </div>
              </div>

              {/* Empty space for run info column */}
              <div className={`flex-shrink-0 border-l border-[var(--agyn-border-subtle)] bg-[var(--agyn-bg-light)]/50 transition-all ${isCollapsed ? 'w-8' : 'w-[150px]'}`} />
            </div>
          )}

          {/* Spacer to fill remaining space */}
          <div className="flex-1 flex">
            <div className="flex-1" />
            <div className={`flex-shrink-0 border-l border-[var(--agyn-border-subtle)] bg-[var(--agyn-bg-light)]/50 transition-all ${isCollapsed ? 'w-8' : 'w-[150px]'}`} />
          </div>
        </div>
      </div>

      {/* Footer */}
      {footer && (
        <div className="px-6 py-4 border-t border-[var(--agyn-border-subtle)] bg-[var(--agyn-bg-light)]">
          {footer}
        </div>
      )}
    </div>
  );
}
