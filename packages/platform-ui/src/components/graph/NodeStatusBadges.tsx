import { Badge } from '@/components/Badge';
import type { ProvisionState } from '@/api/types/graph';
import { badgeVariantForColor, badgeVariantForState, isFailedProvisionState } from '../entities/provisionStatusDisplay';

export function NodeStatusBadges({ state, isPaused, detail }: { state: ProvisionState | string; isPaused: boolean; detail: unknown }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <Badge variant={badgeVariantForState(state)}>{state}</Badge>
      {isPaused && <Badge variant={badgeVariantForColor('yellow')}>paused</Badge>}
      {isFailedProvisionState(state) && detail ? (
        <span className="text-[10px] text-red-600" title={typeof detail === 'string' ? detail : JSON.stringify(detail)}>
          details
        </span>
      ) : null}
    </div>
  );
}

export default NodeStatusBadges;
