const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);

function resolveFlag(envValue?: string): boolean {
  if (!envValue) return false;
  return TRUE_VALUES.has(envValue.toLowerCase());
}

export const uiNewFlags = {
  threads: resolveFlag(import.meta.env.VITE_UI_NEW_THREADS),
  runs: resolveFlag(import.meta.env.VITE_UI_NEW_RUNS),
  reminders: resolveFlag(import.meta.env.VITE_UI_NEW_REMINDERS),
  containers: resolveFlag(import.meta.env.VITE_UI_NEW_CONTAINERS),
  secrets: resolveFlag(import.meta.env.VITE_UI_NEW_SECRETS),
  variables: resolveFlag(import.meta.env.VITE_UI_NEW_VARIABLES),
} as const;

export const isUiNewThreadsEnabled = uiNewFlags.threads;
export const isUiNewRunsEnabled = uiNewFlags.runs;
export const isUiNewRemindersEnabled = uiNewFlags.reminders;
export const isUiNewContainersEnabled = uiNewFlags.containers;
export const isUiNewSecretsEnabled = uiNewFlags.secrets;
export const isUiNewVariablesEnabled = uiNewFlags.variables;
