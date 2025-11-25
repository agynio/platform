import type { ContainerViewModel } from '@/features/monitoring/containers/types';
import ContainersScreen from '../screens/ContainersScreen';

type ContainersPageContentProps = {
  containers: ContainerViewModel[];
  isLoading: boolean;
  error: Error | null;
  onRetry?: () => void;
  onOpenTerminal?: (containerId: string) => void;
  onDeleteContainer?: (containerId: string) => void;
  onViewThread?: (threadId: string) => void;
};

export function ContainersPageContent({
  containers,
  isLoading,
  error,
  onRetry,
  onOpenTerminal,
  onDeleteContainer,
  onViewThread,
}: ContainersPageContentProps) {
  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-[var(--agyn-bg-light)]">
        <span className="text-sm text-[var(--agyn-text-subtle)]">Loading containers…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-[var(--agyn-bg-light)]">
        <div className="text-sm text-[var(--agyn-status-failed)]">{error.message}</div>
        {onRetry && (
          <button
            type="button"
            className="inline-flex items-center rounded-md bg-[var(--agyn-blue)] px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-[var(--agyn-blue-dark)]"
            onClick={onRetry}
          >
            Retry
          </button>
        )}
      </div>
    );
  }

  if (containers.length === 0) {
    return (
      <div className="flex h-full items-center justify-center bg-[var(--agyn-bg-light)]">
        <span className="text-sm text-[var(--agyn-text-subtle)]">No containers found</span>
      </div>
    );
  }

  return (
    <ContainersScreen
      containers={containers}
      onOpenTerminal={onOpenTerminal}
      onDeleteContainer={onDeleteContainer}
      onViewThread={onViewThread}
    />
  );
}
