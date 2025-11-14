import { useEffect, useMemo, useRef, useState } from 'react';
import type { RunTimelineEvent } from '@/api/types/agents';

type Props = {
  event: RunTimelineEvent;
  onClose: () => void;
};

export function RawEventModal({ event, onClose }: Props) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const [copied, setCopied] = useState(false);
  const json = useMemo(() => JSON.stringify(event, null, 2), [event]);
  const titleId = useMemo(() => `raw-event-modal-${event.id}`, [event.id]);

  useEffect(() => {
    previousFocusRef.current = (document.activeElement as HTMLElement | null) ?? null;
    closeRef.current?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => {
      window.removeEventListener('keydown', handler);
      previousFocusRef.current?.focus?.();
    };
  }, [onClose]);

  useEffect(() => {
    const root = dialogRef.current;
    if (!root) return;
    const trap = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const focusables = root.querySelectorAll<HTMLElement>(
        'a[href],button:not([disabled]),textarea,input,select,[tabindex]:not([tabindex="-1"])',
      );
      const list = Array.from(focusables).filter((el) => el.offsetParent !== null);
      if (list.length === 0) return;
      const first = list[0];
      const last = list[list.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey) {
        if (active === first || !root.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else if (active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    root.addEventListener('keydown', trap);
    return () => root.removeEventListener('keydown', trap);
  }, []);

  useEffect(() => {
    if (!copied) return;
    const timeout = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timeout);
  }, [copied]);

  async function handleCopy() {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(json);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = json;
        textarea.setAttribute('readonly', 'true');
        textarea.style.position = 'absolute';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopied(true);
    } catch (_err) {
      setCopied(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      role="presentation"
      onClick={() => {
        onClose();
        previousFocusRef.current?.focus?.();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative flex max-h-[85vh] w-[min(720px,90vw)] flex-col overflow-hidden rounded-lg bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-4 py-2">
          <h2 id={titleId} className="text-sm font-semibold text-gray-900">
            Raw event data
          </h2>
          <button
            ref={closeRef}
            type="button"
            className="rounded border px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
            onClick={() => {
              onClose();
              previousFocusRef.current?.focus?.();
            }}
          >
            Close
          </button>
        </div>
        <div className="flex items-center justify-between gap-2 border-b px-4 py-2 text-[11px] text-gray-600">
          <span className="truncate font-mono" title={event.id}>
            Event {event.id}
          </span>
          <div className="flex items-center gap-2">
            {copied && (
              <span className="text-emerald-600" role="status" aria-live="polite">
                Copied!
              </span>
            )}
            <button
              type="button"
              className="rounded border px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
              onClick={handleCopy}
            >
              Copy
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-auto bg-gray-50">
          <pre className="h-full w-full whitespace-pre-wrap px-4 py-3 text-xs text-gray-800">{json}</pre>
        </div>
      </div>
    </div>
  );
}
