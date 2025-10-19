import { cn } from '@hautech/ui';

export type ParsedMessageType = 'human' | 'ai' | 'tool' | 'unknown';

export interface CheckpointItemUIProps {
  time: Date;
  kind: ParsedMessageType;
  kindBadge: Record<ParsedMessageType, string>;
  toolCallId?: string;
  infoButton?: React.ReactNode;
  rawToggleButton?: React.ReactNode;
  content?: React.ReactNode;
  infoBlock?: React.ReactNode;
  toolCallsBlock?: React.ReactNode;
  rawBlock?: React.ReactNode;
  taskId?: string;
}

export function CheckpointItemUI({
  time,
  kind,
  kindBadge,
  toolCallId,
  infoButton,
  rawToggleButton,
  content,
  infoBlock,
  toolCallsBlock,
  rawBlock,
  taskId,
}: CheckpointItemUIProps) {
  return (
    <div className="border-b border-border py-2 text-xs">
      <div className="mb-1 flex flex-wrap items-center gap-2 font-mono">
        <span className="text-muted-foreground tabular-nums">{time.toLocaleTimeString()}</span>
        <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-medium', kindBadge[kind])}>{kind}</span>
        <span className="truncate text-muted-foreground max-w-[300px]" title={taskId}>
          {toolCallId}
        </span>
        {infoButton}
        {rawToggleButton}
      </div>
      <div className="space-y-1">
        {content}
        {infoBlock}
        {toolCallsBlock}
        {rawBlock}
      </div>
    </div>
  );
}
