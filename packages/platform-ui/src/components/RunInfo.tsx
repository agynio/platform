import { StatusIndicator, type Status } from './StatusIndicator';
import { ExternalLink } from 'lucide-react';

interface RunInfoProps {
  runId: string;
  status: 'finished' | 'running' | 'failed' | 'pending';
  duration?: string;
  tokens?: number;
  cost?: string;
  height: number;
  className?: string;
  onViewRun?: (runId: string) => void;
  runLink?: string;
}

const statusLabels: Record<string, string> = {
  finished: 'Finished',
  running: 'Running',
  failed: 'Failed',
  pending: 'Pending',
};

export function RunInfo({
  runId,
  status,
  duration,
  tokens,
  cost,
  height,
  className = '',
  onViewRun,
  runLink,
}: RunInfoProps) {
  // Show compact view if run is too short (less than 80px)
  const isCompact = height < 80;

  return (
    <div
      className={`relative ${className}`}
      style={{ height: `${height}px` }}
    >
      {/* Sticky info card */}
      <div className="sticky" style={{ top: '24px' }}>
        <div className="text-xs text-left" data-testid="run-info">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <StatusIndicator status={status as Status} size="sm" showTooltip={false} />
              <span className="text-[var(--agyn-dark)]">
                {statusLabels[status]}
              </span>
            </div>

            {duration && (
              <div className="flex items-center justify-between gap-2">
                <span className="text-[var(--agyn-gray)] opacity-60">Duration</span>
                <span className="text-[var(--agyn-dark)]">{duration}</span>
              </div>
            )}

            {!isCompact && tokens !== undefined && (
              <div className="flex items-center justify-between gap-2">
                <span className="text-[var(--agyn-gray)] opacity-60">Tokens</span>
                <span className="text-[var(--agyn-dark)]">{tokens.toLocaleString()}</span>
              </div>
            )}

            {!isCompact && cost && (
              <div className="flex items-center justify-between gap-2">
                <span className="text-[var(--agyn-gray)] opacity-60">Cost</span>
                <span className="text-[var(--agyn-dark)]">{cost}</span>
              </div>
            )}

            {onViewRun ? (
              <button
                type="button"
                onClick={() => onViewRun(runId)}
                className="inline-flex items-center gap-1 text-xs text-[var(--agyn-blue)] hover:text-[var(--agyn-blue)]/80 transition-colors mt-2.5"
              >
                <ExternalLink className="w-3 h-3" />
                <span>View Run</span>
              </button>
            ) : (
              <a
                href={runLink ?? `#/run/${runId}`}
                className="inline-flex items-center gap-1 text-xs text-[var(--agyn-blue)] hover:text-[var(--agyn-blue)]/80 transition-colors mt-2.5"
              >
                <ExternalLink className="w-3 h-3" />
                <span>View Run</span>
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
