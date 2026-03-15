import { Badge } from '@/components/Badge';
import type { ProvisionState } from '@/api/types/graph';
import { badgeVariantForState, isFailedProvisionState } from '../entities/provisionStatusDisplay';

export function NodeStatusBadges({ state, detail }: { state: ProvisionState | string; detail: unknown }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <Badge variant={badgeVariantForState(state)}>{state}</Badge>
      {isFailedProvisionState(state) && detail ? (
        <span className="text-[10px] text-red-600" title={typeof detail === 'string' ? detail : JSON.stringify(detail)}>
          details
        </span>
      ) : null}
    </div>
  );
}

export default NodeStatusBadges;
