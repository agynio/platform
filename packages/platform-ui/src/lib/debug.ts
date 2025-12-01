const coerceBoolean = (value: unknown): boolean => {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on';
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) && value !== 0;
  }
  return false;
};

const resolveEnvFlag = (): unknown => {
  try {
    const meta = import.meta as unknown as { env?: Record<string, unknown> };
    const env = meta.env ?? {};
    if ('AGYN_DEBUG_CONVERSATIONS' in env) return env.AGYN_DEBUG_CONVERSATIONS;
    if ('VITE_AGYN_DEBUG_CONVERSATIONS' in env) return env.VITE_AGYN_DEBUG_CONVERSATIONS;
  } catch (_error) {
    // ignore; env not available in this runtime
  }
  if (typeof process !== 'undefined') {
    const env = (process as unknown as { env?: Record<string, unknown> }).env ?? {};
    if ('AGYN_DEBUG_CONVERSATIONS' in env) return env.AGYN_DEBUG_CONVERSATIONS;
    if ('VITE_AGYN_DEBUG_CONVERSATIONS' in env) return env.VITE_AGYN_DEBUG_CONVERSATIONS;
  }
  return undefined;
};

const resolveGlobalFlag = (): unknown => {
  try {
    return (globalThis as { AGYN_DEBUG_CONVERSATIONS?: unknown }).AGYN_DEBUG_CONVERSATIONS;
  } catch (_error) {
    return undefined;
  }
};

const rawFlag = resolveGlobalFlag() ?? resolveEnvFlag();

export const AGYN_DEBUG_CONVERSATIONS = coerceBoolean(rawFlag);

type DebugPayload = unknown | (() => unknown);

export const debugConversation = (label: string, ...payload: DebugPayload[]): void => {
  if (!AGYN_DEBUG_CONVERSATIONS) return;
  const rendered: unknown[] = [];
  for (const entry of payload) {
    if (typeof entry === 'function') {
      try {
        rendered.push((entry as () => unknown)());
      } catch (error) {
        rendered.push({ error });
      }
    } else if (entry !== undefined) {
      rendered.push(entry);
    }
  }
  if (rendered.length === 0) {
    rendered.push('');
  }
  console.debug(`[threads:${label}]`, ...rendered);
};
