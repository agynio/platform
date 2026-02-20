import type { ProvisionState } from '@/api/types/graph';

export type ProvisionStatusColor = 'gray' | 'blue' | 'green' | 'red' | 'yellow';

const FAILED_STATES: ReadonlySet<ProvisionState | string> = new Set([
  'error',
  'provisioning_error',
  'deprovisioning_error',
]);

const PROVISION_STATE_TO_COLOR: Record<ProvisionState, ProvisionStatusColor> = {
  not_ready: 'gray',
  provisioning: 'blue',
  ready: 'green',
  error: 'red',
  deprovisioning: 'yellow',
  provisioning_error: 'red',
  deprovisioning_error: 'red',
};

const COLOR_TO_BADGE_VARIANT: Record<ProvisionStatusColor, 'neutral' | 'accent' | 'secondary' | 'destructive' | 'outline'> = {
  gray: 'neutral',
  blue: 'accent',
  green: 'secondary',
  red: 'destructive',
  yellow: 'outline',
};

export function badgeVariantForColor(color: ProvisionStatusColor) {
  return COLOR_TO_BADGE_VARIANT[color];
}

export function statusColorFor(state?: ProvisionState | string): ProvisionStatusColor {
  if (!state) return 'gray';
  if (state in PROVISION_STATE_TO_COLOR) {
    return PROVISION_STATE_TO_COLOR[state as ProvisionState];
  }
  return 'gray';
}

export function badgeVariantForState(state?: ProvisionState | string) {
  return badgeVariantForColor(statusColorFor(state));
}

export function isFailedProvisionState(state?: ProvisionState | string): boolean {
  if (!state) return false;
  return FAILED_STATES.has(state);
}

export function formatProvisionDetails(details: unknown): string | null {
  if (details === null || details === undefined) {
    return null;
  }
  if (typeof details === 'string') {
    const trimmed = details.trim();
    return trimmed.length > 0 ? trimmed : details;
  }
  try {
    return JSON.stringify(details);
  } catch (_error) {
    return String(details);
  }
}
