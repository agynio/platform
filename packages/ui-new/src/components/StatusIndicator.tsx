import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';

export type Status = 'finished' | 'failed' | 'pending' | 'running' | 'terminated';
export type StatusIndicatorSize = 'sm' | 'md' | 'lg';

interface StatusIndicatorProps {
  status: Status;
  size?: StatusIndicatorSize;
  showTooltip?: boolean;
  className?: string;
}

const statusConfig: Record<Status, { color: string; label: string }> = {
  pending: { color: 'var(--agyn-status-pending)', label: 'Pending' },
  running: { color: 'var(--agyn-status-pending)', label: 'Running' },
  finished: { color: 'var(--agyn-status-finished)', label: 'Finished' },
  failed: { color: 'var(--agyn-status-failed)', label: 'Failed' },
  terminated: { color: 'var(--agyn-status-terminated)', label: 'Terminated' },
};

const sizeConfig: Record<StatusIndicatorSize, string> = {
  sm: '6px',
  md: '10px',
  lg: '16px',
};

export function StatusIndicator({
  status,
  size = 'md',
  showTooltip = true,
  className = '',
}: StatusIndicatorProps) {
  const config = statusConfig[status];
  const dotSize = sizeConfig[size];
  const isRunning = status === 'running';

  const dot = (
    <div
      className={`rounded-full flex-shrink-0 ${isRunning ? 'animate-pulse-scale' : ''} ${className}`}
      style={{
        width: dotSize,
        height: dotSize,
        backgroundColor: config.color,
      }}
      aria-label={config.label}
    />
  );

  if (!showTooltip) {
    return dot;
  }

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="inline-flex items-center justify-center cursor-default">
            {dot}
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p>{config.label}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}