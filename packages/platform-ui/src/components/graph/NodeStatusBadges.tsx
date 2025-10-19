import { Badge } from '@hautech/ui';
import type { ProvisionState } from '../../lib/graph/types';

// Map status color to Badge variant locally; do not centralize
function badgeVariantFor(color: 'gray' | 'blue' | 'green' | 'red' | 'yellow') {
  switch (color) {
    case 'green':
      return 'secondary' as const; // success-like
    case 'red':
      return 'destructive' as const;
    case 'blue':
      return 'accent' as const;
    case 'yellow':
      return 'outline' as const;
    case 'gray':
    default:
      return 'neutral' as const;
  }
}

function statusColor(state: ProvisionState | undefined): 'gray' | 'blue' | 'green' | 'red' | 'yellow' {
  switch (state) {
    case 'provisioning':
      return 'blue';
    case 'ready':
      return 'green';
    case 'error':
      return 'red';
    case 'deprovisioning':
      return 'yellow';
    case 'not_ready':
    default:
      return 'gray';
  }
}

export function NodeStatusBadges({ state, isPaused, detail }: { state: ProvisionState | string; isPaused: boolean; detail: unknown }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <Badge variant={badgeVariantFor(statusColor(state as ProvisionState))}>{state}</Badge>
      {isPaused && <Badge variant={badgeVariantFor('yellow')}>paused</Badge>}
      {state === 'error' && detail ? (
        <span className="text-[10px] text-red-600" title={typeof detail === 'string' ? detail : JSON.stringify(detail)}>
          details
        </span>
      ) : null}
    </div>
  );
}

export default NodeStatusBadges;
