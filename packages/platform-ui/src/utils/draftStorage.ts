const STORAGE_PREFIX = 'ui.draft.threads';
const STORAGE_VERSION = 1;
export const THREAD_MESSAGE_MAX_LENGTH = 8000;

type DraftRecord = {
  version: number;
  text: string;
  updatedAt: string;
  userEmail: string | null;
};

function resolveStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch (_error) {
    return null;
  }
}

export function makeDraftKey(threadId: string, userEmail?: string | null): string {
  const normalizedId = threadId ?? '';
  const normalizedEmail = typeof userEmail === 'string' && userEmail.trim().length > 0 ? userEmail : null;
  const base = `${STORAGE_PREFIX}.${normalizedId}`;
  return normalizedEmail ? `${base}::user::${normalizedEmail}` : base;
}

export function readDraft(threadId: string, userEmail?: string | null): { text: string; updatedAt: string; userEmail: string | null } | null {
  if (!threadId) return null;
  const storage = resolveStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(makeDraftKey(threadId, userEmail));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DraftRecord | null;
    if (!parsed || typeof parsed !== 'object') return null;
    if (parsed.version !== STORAGE_VERSION) return null;
    if (typeof parsed.text !== 'string') return null;
    const text = parsed.text.slice(0, THREAD_MESSAGE_MAX_LENGTH);
    return {
      text,
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date(0).toISOString(),
      userEmail: typeof parsed.userEmail === 'string' && parsed.userEmail.length > 0 ? parsed.userEmail : null,
    };
  } catch (_error) {
    return null;
  }
}

export function writeDraft(threadId: string, text: string, userEmail?: string | null): void {
  if (!threadId) return;
  const storage = resolveStorage();
  if (!storage) return;
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    clearDraft(threadId, userEmail);
    return;
  }
  const limited = text.slice(0, THREAD_MESSAGE_MAX_LENGTH);
  const payload: DraftRecord = {
    version: STORAGE_VERSION,
    text: limited,
    updatedAt: new Date().toISOString(),
    userEmail: typeof userEmail === 'string' && userEmail.trim().length > 0 ? userEmail : null,
  };
  try {
    storage.setItem(makeDraftKey(threadId, userEmail), JSON.stringify(payload));
  } catch (_error) {
    // Swallow storage errors (quota, permissions, etc.)
  }
}

export function clearDraft(threadId: string, userEmail?: string | null): void {
  if (!threadId) return;
  const storage = resolveStorage();
  if (!storage) return;
  try {
    storage.removeItem(makeDraftKey(threadId, userEmail));
  } catch (_error) {
    // Ignore storage errors
  }
}
