import { ContainerEventType, ContainerStatus } from '@prisma/client';

export type ContainerTerminationReason =
  | 'OOMKilled'
  | 'SIGTERM'
  | 'SIGKILL'
  | 'SIGINT'
  | 'ExitedNormally'
  | 'ExitedWithError';

export interface ContainerReasonContext {
  eventType: ContainerEventType;
  exitCode?: number | null;
  signal?: string | null;
  hadRecentOom?: boolean;
}

const OOM_EXIT_CODE = 137;
const SIGTERM_EXIT_CODE = 143;
const SIGINT_EXIT_CODE = 130;

const SIGNAL_TO_REASON: Record<string, ContainerTerminationReason> = {
  SIGTERM: 'SIGTERM',
  TERM: 'SIGTERM',
  '15': 'SIGTERM',
  SIGKILL: 'SIGKILL',
  KILL: 'SIGKILL',
  '9': 'SIGKILL',
  SIGINT: 'SIGINT',
  INT: 'SIGINT',
  '2': 'SIGINT',
};

const normalizeSignal = (signal?: string | null): string | undefined => {
  if (!signal) return undefined;
  return signal.trim().toUpperCase();
};

export function mapContainerEventReason(context: ContainerReasonContext): ContainerTerminationReason {
  const { eventType, exitCode, signal, hadRecentOom } = context;

  if (eventType === 'oom') {
    return 'OOMKilled';
  }

  if (eventType === 'kill') {
    const normalized = normalizeSignal(signal);
    if (normalized && SIGNAL_TO_REASON[normalized]) {
      return SIGNAL_TO_REASON[normalized];
    }
    return 'ExitedWithError';
  }

  const code = typeof exitCode === 'number' ? exitCode : null;
  if (code === 0) return 'ExitedNormally';
  if (code === OOM_EXIT_CODE) {
    return hadRecentOom ? 'OOMKilled' : 'SIGKILL';
  }
  if (code === SIGTERM_EXIT_CODE) return 'SIGTERM';
  if (code === SIGINT_EXIT_CODE) return 'SIGINT';

  return 'ExitedWithError';
}

export function statusForEvent(
  eventType: ContainerEventType,
  reason: ContainerTerminationReason,
): ContainerStatus | undefined {
  switch (eventType) {
    case 'oom':
      return 'failed';
    case 'kill':
      return 'terminating';
    case 'die':
      if (reason === 'ExitedNormally' || reason === 'SIGTERM') {
        return 'stopped';
      }
      return 'failed';
    default:
      return undefined;
  }
}

