import React from 'react';
import type { ProvisionState } from '../../lib/graph/types';

function Chip({ color, children }: { color: 'gray' | 'blue' | 'green' | 'red' | 'yellow'; children: React.ReactNode }) {
  const colorMap: Record<string, string> = {
    gray: 'bg-gray-200 text-gray-800',
    blue: 'bg-blue-200 text-blue-800',
    green: 'bg-green-200 text-green-800',
    red: 'bg-red-200 text-red-800',
    yellow: 'bg-yellow-200 text-yellow-800',
  };
  return <span className={`px-2 py-1 rounded text-xs ${colorMap[color]}`}>{children}</span>;
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
      <Chip color={statusColor(state as ProvisionState)}>{state}</Chip>
      {isPaused && <Chip color="yellow">paused</Chip>}
      {state === 'error' && detail ? (
        <span className="text-[10px] text-red-600" title={typeof detail === 'string' ? detail : JSON.stringify(detail)}>
          details
        </span>
      ) : null}
    </div>
  );
}

export default NodeStatusBadges;
