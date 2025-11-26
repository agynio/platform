import type { NodeStatus, SimpleOption } from './types';

export const QUEUE_WHEN_BUSY_OPTIONS: SimpleOption[] = [
  { value: 'wait', label: 'Wait' },
  { value: 'injectAfterTools', label: 'Inject After Tools' },
];

export const QUEUE_PROCESS_BUFFER_OPTIONS: SimpleOption[] = [
  { value: 'allTogether', label: 'All Together' },
  { value: 'oneByOne', label: 'One By One' },
];

export const WORKSPACE_PLATFORM_OPTIONS: SimpleOption[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'linux/amd64', label: 'Linux AMD64' },
  { value: 'linux/arm64', label: 'Linux ARM64' },
];

export const statusConfig: Record<NodeStatus, { label: string; color: string; bgColor: string }> = {
  not_ready: { label: 'Not Ready', color: 'var(--agyn-gray)', bgColor: 'var(--agyn-bg-light)' },
  provisioning: {
    label: 'Provisioning',
    color: 'var(--agyn-status-running)',
    bgColor: 'var(--agyn-status-running-bg)',
  },
  ready: {
    label: 'Ready',
    color: 'var(--agyn-status-finished)',
    bgColor: 'var(--agyn-status-finished-bg)',
  },
  deprovisioning: {
    label: 'Deprovisioning',
    color: 'var(--agyn-status-pending)',
    bgColor: 'var(--agyn-status-pending-bg)',
  },
  provisioning_error: {
    label: 'Provisioning Error',
    color: 'var(--agyn-status-failed)',
    bgColor: 'var(--agyn-status-failed-bg)',
  },
  deprovisioning_error: {
    label: 'Deprovisioning Error',
    color: 'var(--agyn-status-failed)',
    bgColor: 'var(--agyn-status-failed-bg)',
  },
};
