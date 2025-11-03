import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
<<<<<<< HEAD
import { api } from '@/lib/graph/api';
=======
import { api } from '@/api/graph';
>>>>>>> e30249f6 (test(platform-ui): standardize imports to '@/api/graph' and '@/api/tracing' across graph tests/hooks; wrap NodeObsSidebar filtering test in ObsUiProvider with serverUrl to satisfy context; adjust dynamic import paths to alias for consistency)
import { notifyError, notifySuccess } from '@/lib/notify';

// Avoid reserved React prop name "key" in component props
export function VaultWriteModal({ mount, path, secretKey, onClose }: { mount: string; path: string; secretKey: string; onClose: (didWrite?: boolean) => void }) {
  const [value, setValue] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const qc = useQueryClient();
  const titleId = useMemo(() => `vault-modal-title-${Math.random().toString(36).slice(2)}`, []);

  useEffect(() => {
    // Focus textarea on mount
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Basic focus trap within the dialog
  useEffect(() => {
    const root = dialogRef.current;
    if (!root) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const focusables = root.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),textarea,input,select,[tabindex]:not([tabindex="-1"])');
      const list = Array.from(focusables).filter((el) => el.offsetParent !== null);
      if (list.length === 0) return;
      const first = list[0];
      const last = list[list.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey) {
        if (active === first || !root.contains(active)) {
          last.focus();
          e.preventDefault();
        }
      } else {
        if (active === last) {
          first.focus();
          e.preventDefault();
        }
      }
    };
    root.addEventListener('keydown', onKey);
    return () => root.removeEventListener('keydown', onKey);
  }, []);

  async function submit() {
    setSubmitting(true);
    try {
      await api.writeVaultKey(mount, { path, key: secretKey, value });
      await qc.invalidateQueries({ queryKey: ['vault', 'keys', mount, path] });
      notifySuccess('Secret updated');
      onClose(true);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Write failed';
      notifyError(msg);
      setSubmitting(false);
    }
  }

  return (
    <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div ref={dialogRef} className="bg-white rounded shadow-lg w-[520px] max-w-[90vw] p-4">
        <div className="flex items-center justify-between mb-2">
          <h2 id={titleId} className="text-sm font-semibold">Edit Vault secret</h2>
          <button aria-label="Close" className="text-xs" onClick={() => onClose(false)}>
            ×
          </button>
        </div>
        <div className="text-[11px] text-muted-foreground mb-2">
          <div>
            <span className="font-mono">mount:</span> <span className="font-mono">{mount}</span>
          </div>
          <div>
            <span className="font-mono">path:</span> <span className="font-mono">{path}</span>
          </div>
          <div>
            <span className="font-mono">key:</span> <span className="font-mono">{secretKey}</span>
          </div>
        </div>
        <label className="block text-[11px] mb-1" htmlFor="vault-value">
          Value (write-only; not read back)
        </label>
        <textarea
          id="vault-value"
          ref={ref}
          className="w-full h-32 border rounded p-2 text-xs"
          placeholder="Enter secret value"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <div className="flex items-center justify-end gap-2 mt-3">
          <button className="text-xs px-3 py-1 rounded border" onClick={() => onClose(false)} disabled={submitting}>
            Cancel
          </button>
          <button
            className="text-xs px-3 py-1 rounded bg-blue-600 text-white disabled:bg-blue-300"
            onClick={submit}
            disabled={submitting}
          >
            {submitting ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
