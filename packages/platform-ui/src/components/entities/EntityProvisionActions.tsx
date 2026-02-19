import type { ProvisionState } from '@/api/types/graph';
import { useNodeAction } from '@/features/graph/hooks/useNodeAction';

const PROVISIONABLE_STATES: ReadonlySet<ProvisionState | string> = new Set([
  'not_ready',
  'error',
  'provisioning_error',
  'deprovisioning_error',
]);

const DEPROVISIONABLE_STATES: ReadonlySet<ProvisionState | string> = new Set([
  'ready',
  'provisioning',
]);

interface EntityProvisionActionsProps {
  entityId: string;
  state?: ProvisionState | string;
}

export function EntityProvisionActions({ entityId, state }: EntityProvisionActionsProps) {
  const action = useNodeAction(entityId);
  const currentState = (state ?? 'not_ready') as ProvisionState | string;
  const canProvision = PROVISIONABLE_STATES.has(currentState);
  const canDeprovision = DEPROVISIONABLE_STATES.has(currentState);
  const isBusy = action.isPending;

  const runProvision = () => {
    if (isBusy || !canProvision) return;
    action.mutate('provision');
  };

  const runDeprovision = () => {
    if (isBusy || !canDeprovision) return;
    action.mutate('deprovision');
  };

  return (
    <div className="flex flex-wrap items-center justify-end gap-2" data-testid="entity-provision-actions">
      <button
        type="button"
        onClick={runProvision}
        disabled={!canProvision || isBusy}
        className="rounded-md border border-[var(--agyn-border-subtle)] px-3 py-1.5 text-xs text-[var(--agyn-dark)] transition-colors disabled:cursor-not-allowed disabled:opacity-50 hover:bg-[var(--agyn-bg-light)]"
        aria-label="Provision entity"
      >
        Provision
      </button>
      <button
        type="button"
        onClick={runDeprovision}
        disabled={!canDeprovision || isBusy}
        className="rounded-md border border-[var(--agyn-border-subtle)] px-3 py-1.5 text-xs text-[var(--agyn-dark)] transition-colors disabled:cursor-not-allowed disabled:opacity-50 hover:bg-[var(--agyn-bg-light)]"
        aria-label="Deprovision entity"
      >
        Deprovision
      </button>
    </div>
  );
}

export default EntityProvisionActions;
