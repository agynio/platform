import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { clearDraft, makeDraftKey, readDraft, writeDraft, THREAD_MESSAGE_MAX_LENGTH } from '@/utils/draftStorage';

const THREAD_ID = 'thread-123';
const USER_EMAIL = 'casey@example.com';

const originalDescriptor = Object.getOwnPropertyDescriptor(window, 'localStorage');

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  if (originalDescriptor) {
    Object.defineProperty(window, 'localStorage', originalDescriptor);
  }
  try {
    window.localStorage.clear();
  } catch (_error) {
    // ignore if storage unavailable
  }
});

describe('makeDraftKey', () => {
  it('builds a key without user when email absent', () => {
    expect(makeDraftKey('t-1')).toBe('ui.draft.threads.t-1');
  });

  it('includes user identifier when email provided', () => {
    expect(makeDraftKey('t-1', 'person@example.com')).toBe('ui.draft.threads.t-1::user::person@example.com');
  });
});

describe('writeDraft / readDraft', () => {
  it('round-trips stored drafts with metadata', () => {
    writeDraft(THREAD_ID, 'Hello draft', USER_EMAIL);

    const stored = readDraft(THREAD_ID, USER_EMAIL);

    expect(stored).not.toBeNull();
    expect(stored?.text).toBe('Hello draft');
    expect(stored?.userEmail).toBe(USER_EMAIL);
    expect(new Date(stored!.updatedAt).toString()).not.toBe('Invalid Date');
  });

  it('truncates drafts to the message max length', () => {
    const longText = 'x'.repeat(THREAD_MESSAGE_MAX_LENGTH + 100);
    writeDraft(THREAD_ID, longText, USER_EMAIL);

    const stored = readDraft(THREAD_ID, USER_EMAIL);

    expect(stored?.text.length).toBe(THREAD_MESSAGE_MAX_LENGTH);
  });

  it('clears storage when writing an empty draft', () => {
    writeDraft(THREAD_ID, 'Some text', USER_EMAIL);
    expect(readDraft(THREAD_ID, USER_EMAIL)).not.toBeNull();

    writeDraft(THREAD_ID, '   ', USER_EMAIL);

    expect(readDraft(THREAD_ID, USER_EMAIL)).toBeNull();
  });

  it('ignores invalid JSON payloads', () => {
    const key = makeDraftKey(THREAD_ID, USER_EMAIL);
    window.localStorage.setItem(key, '{not-json');

    expect(readDraft(THREAD_ID, USER_EMAIL)).toBeNull();
  });

  it('ignores mismatched versions', () => {
    const key = makeDraftKey(THREAD_ID, USER_EMAIL);
    window.localStorage.setItem(
      key,
      JSON.stringify({ version: 99, text: 'legacy', updatedAt: new Date().toISOString(), userEmail: USER_EMAIL }),
    );

    expect(readDraft(THREAD_ID, USER_EMAIL)).toBeNull();
  });
});

describe('clearDraft', () => {
  it('removes existing draft entry', () => {
    const key = makeDraftKey(THREAD_ID, USER_EMAIL);
    window.localStorage.setItem(key, JSON.stringify({
      version: 1,
      text: 'persisted',
      updatedAt: new Date().toISOString(),
      userEmail: USER_EMAIL,
    }));

    clearDraft(THREAD_ID, USER_EMAIL);

    expect(window.localStorage.getItem(key)).toBeNull();
  });
});

describe('storage guards', () => {
  it('silently handles storage access failures', () => {
    if (originalDescriptor) {
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        get() {
          throw new Error('blocked');
        },
      });
    }

    expect(() => writeDraft(THREAD_ID, 'value', USER_EMAIL)).not.toThrow();
    expect(readDraft(THREAD_ID, USER_EMAIL)).toBeNull();
    expect(() => clearDraft(THREAD_ID, USER_EMAIL)).not.toThrow();
  });
});
