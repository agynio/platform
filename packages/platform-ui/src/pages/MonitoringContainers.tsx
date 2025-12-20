import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ContainerItem } from '@/api/modules/containers';
import { ContainerTerminalDialog } from '@/components/monitoring/ContainerTerminalDialog';
import { ContainersPageContent } from '@/components/monitoring/ContainersPageContent';
import { useMonitoringContainers } from '@/features/monitoring/containers/hooks';

export function MonitoringContainers() {
  const navigate = useNavigate();
  const { containers, itemById, status, setStatus, counts, isLoading, error, refetch } = useMonitoringContainers();
  const [terminalContainer, setTerminalContainer] = useState<ContainerItem | null>(null);

  const loading = isLoading && containers.length === 0;
  const displayError = error && containers.length === 0 ? error : null;

  const pageContainers = useMemo(() => {
    if (loading || displayError) return [];
    return containers;
  }, [containers, loading, displayError]);

  const handleOpenTerminal = useCallback(
    (containerId: string) => {
      const next = itemById.get(containerId);
      if (!next) return;
      setTerminalContainer(next);
    },
    [itemById],
  );

  const handleCloseTerminal = useCallback(() => {
    setTerminalContainer(null);
  }, []);

  const handleViewThread = useCallback(
    (threadId: string) => {
      navigate(`/agents/threads/${threadId}`);
    },
    [navigate],
  );

  const handleDeleteContainer = useCallback((containerId: string) => {
    console.warn('Delete container not implemented', containerId);
  }, []);

  useEffect(() => {
    if (!terminalContainer) return;
    const latest = itemById.get(terminalContainer.containerId) ?? null;
    if (!latest) {
      setTerminalContainer(null);
      return;
    }
    if (latest !== terminalContainer) {
      setTerminalContainer(latest);
    }
  }, [itemById, terminalContainer]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[var(--agyn-bg-light)]">
      <ContainersPageContent
        containers={pageContainers}
        status={status}
        counts={counts}
        onStatusChange={setStatus}
        isLoading={loading}
        error={displayError}
        onRetry={refetch}
        onOpenTerminal={handleOpenTerminal}
        onDeleteContainer={handleDeleteContainer}
        onViewThread={handleViewThread}
      />
      <ContainerTerminalDialog
        container={terminalContainer}
        open={terminalContainer != null}
        onClose={handleCloseTerminal}
      />
    </div>
  );
}
