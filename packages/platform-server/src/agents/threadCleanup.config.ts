export interface ThreadCleanupOptions {
  cascade: boolean;
  skipActive: boolean;
  force: boolean;
  graceSeconds: number;
  deleteEphemeral: boolean;
  deleteVolumes: boolean;
  keepVolumesForDebug: boolean;
  volumeRetentionHours: number;
  dryRun: boolean;
}

const DEFAULT_OPTIONS: ThreadCleanupOptions = Object.freeze({
  cascade: true,
  skipActive: false,
  force: true,
  graceSeconds: 10,
  deleteEphemeral: true,
  deleteVolumes: true,
  keepVolumesForDebug: false,
  volumeRetentionHours: 0,
  dryRun: false,
});

const BOOLEAN_TRUE = new Set(['1', 'true', 'yes', 'on']);
const BOOLEAN_FALSE = new Set(['0', 'false', 'no', 'off']);

const toBoolean = (value: string | undefined, fallback: boolean): boolean => {
  if (value === undefined) return fallback;
  const normalized = value.trim().toLowerCase();
  if (BOOLEAN_TRUE.has(normalized)) return true;
  if (BOOLEAN_FALSE.has(normalized)) return false;
  return fallback;
};

const toNumber = (value: string | undefined, fallback: number, opts?: { min?: number; max?: number }): number => {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const { min, max } = opts ?? {};
  if (min !== undefined && parsed < min) return min;
  if (max !== undefined && parsed > max) return max;
  return parsed;
};

export const readThreadCleanupOptions = (env: NodeJS.ProcessEnv = process.env): ThreadCleanupOptions => {
  const cascade = toBoolean(env.THREAD_CLEANUP_CASCADE, DEFAULT_OPTIONS.cascade);
  const skipActive = toBoolean(env.THREAD_CLEANUP_SKIP_ACTIVE, DEFAULT_OPTIONS.skipActive);
  const force = toBoolean(env.THREAD_CLEANUP_FORCE, DEFAULT_OPTIONS.force);
  const graceSeconds = toNumber(env.THREAD_CLEANUP_GRACE_SECONDS, DEFAULT_OPTIONS.graceSeconds, { min: 0, max: 300 });
  const deleteEphemeral = toBoolean(env.THREAD_CLEANUP_DELETE_EPHEMERAL, DEFAULT_OPTIONS.deleteEphemeral);
  const deleteVolumes = toBoolean(env.THREAD_CLEANUP_DELETE_VOLUMES, DEFAULT_OPTIONS.deleteVolumes);
  const keepVolumesForDebug = toBoolean(env.KEEP_VOLUMES_FOR_DEBUG, DEFAULT_OPTIONS.keepVolumesForDebug);
  const volumeRetentionHours = toNumber(env.VOLUME_RETENTION_HOURS, DEFAULT_OPTIONS.volumeRetentionHours, {
    min: 0,
    max: 8760,
  });
  const dryRun = toBoolean(env.DRY_RUN, DEFAULT_OPTIONS.dryRun);

  return {
    cascade,
    skipActive,
    force,
    graceSeconds,
    deleteEphemeral,
    deleteVolumes,
    keepVolumesForDebug,
    volumeRetentionHours,
    dryRun,
  } satisfies ThreadCleanupOptions;
};

export const THREAD_CLEANUP_OPTIONS = Symbol('THREAD_CLEANUP_OPTIONS');

export const defaultThreadCleanupOptions = (): ThreadCleanupOptions => ({ ...DEFAULT_OPTIONS });
