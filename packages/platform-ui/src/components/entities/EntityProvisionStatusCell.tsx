import { Badge } from '@/components/Badge';
import type { ProvisionState } from '@/api/types/graph';
import { badgeVariantForState, formatProvisionDetails, isFailedProvisionState } from './provisionStatusDisplay';

interface EntityProvisionStatusCellProps {
  state?: ProvisionState | string;
  details?: unknown;
}

export function EntityProvisionStatusCell({ state, details }: EntityProvisionStatusCellProps) {
  const currentState = (state ?? 'not_ready') as ProvisionState | string;
  const detailText = isFailedProvisionState(currentState) ? formatProvisionDetails(details) : null;

  return (
    <div className="flex flex-col gap-1 text-xs" data-testid="entity-status-cell">
      <Badge size="sm" variant={badgeVariantForState(currentState)}>
        {currentState}
      </Badge>
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
