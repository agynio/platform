import { Badge } from '@/components/Badge';
import { IconButton } from '@/components/IconButton';
import type { ProvisionState } from '@/api/types/graph';
import { useNodeAction } from '@/features/graph/hooks/useNodeAction';
import { Play, Square } from 'lucide-react';
import { badgeVariantForState, formatProvisionDetails, isFailedProvisionState } from './provisionStatusDisplay';

interface EntityProvisionStatusCellProps {
  entityId: string;
  state?: ProvisionState | string;
  details?: unknown;
}

const PROVISIONABLE_STATES: ReadonlySet<ProvisionState | string> = new Set([
  'not_ready',
  'error',
  'provisioning_error',
  'deprovisioning_error',
  'provisioning',
]);

const DEPROVISIONABLE_STATES: ReadonlySet<ProvisionState | string> = new Set([
  'ready',
  'provisioning',
  'deprovisioning',
]);

export function EntityProvisionStatusCell({ entityId, state, details }: EntityProvisionStatusCellProps) {
  const currentState = (state ?? 'not_ready') as ProvisionState | string;
  const detailText = isFailedProvisionState(currentState) ? formatProvisionDetails(details) : null;
  const nodeAction = useNodeAction(entityId);
  const canProvision = PROVISIONABLE_STATES.has(currentState);
  const canDeprovision = DEPROVISIONABLE_STATES.has(currentState);
  const actionKind: 'provision' | 'deprovision' | null = canProvision ? 'provision' : canDeprovision ? 'deprovision' : null;
  const actionLabel = actionKind === 'provision' ? 'Provision' : actionKind === 'deprovision' ? 'Deprovision' : null;

  const handleAction = () => {
    if (!actionKind || nodeAction.isPending) return;
    nodeAction.mutate(actionKind);
  };

  const actionButton = actionKind ? (
    <IconButton
      icon={actionKind === 'provision' ? <Play className="h-4 w-4" /> : <Square className="h-4 w-4" />}
      size="xs"
      variant="ghost"
      aria-label={actionLabel ?? undefined}
      title={actionLabel ?? undefined}
      disabled={nodeAction.isPending}
      onClick={handleAction}
      className="text-[var(--agyn-gray)] hover:text-[var(--agyn-blue)]"
    />
  ) : null;

  return (
    <div className="flex flex-col gap-1 text-xs" data-testid="entity-status-cell">
      <div className="flex items-center gap-2">
        <Badge size="sm" variant={badgeVariantForState(currentState)}>
          {currentState}
        </Badge>
        {actionButton}
      </div>
      {detailText ? (
        <span
          className="truncate text-[11px] leading-tight text-red-600"
          title={detailText}
          data-testid="entity-status-error"
        >
          {detailText}
        </span>
      ) : null}
    </div>
  );
}

export default EntityProvisionStatusCell;
