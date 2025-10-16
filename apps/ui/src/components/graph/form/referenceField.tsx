import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../../lib/graph/api';
import { parseVaultRef, isValidVaultRef } from '@/lib/vault/parse';
import { useVaultKeyExistence } from '@/lib/vault/useVaultKeyExistence';
import { VaultWriteModal } from './VaultWriteModal';

export type ReferenceValue = { value?: string; source?: 'static' | 'vault' };

export function ReferenceField({ formData, onChange }: { formData?: ReferenceValue; onChange?: (next: ReferenceValue) => void }) {
  const [mode, setMode] = useState<'static' | 'vault'>((formData?.source as any) || 'static');
  const [val, setVal] = useState<string>(typeof formData?.value === 'string' ? formData?.value : '');

  // Vault metadata for suggestions
  const [mounts, setMounts] = useState<string[]>([]);
  const [paths, setPaths] = useState<string[]>([]);
  const [keys, setKeys] = useState<string[]>([]);

  useEffect(() => {
    onChange?.({ value: val, source: mode });
  }, [val, mode]);

  useEffect(() => {
    if (mode !== 'vault') return;
    api.listVaultMounts().then((r) => setMounts(r.items || [])).catch(() => setMounts([]));
  }, [mode]);

  // Minimal ref parsing to drive suggestions
  const ref = useMemo(() => parseVaultRef(val), [val]);
  const existence = useVaultKeyExistence(ref.mount, ref.path, ref.key);
  const [open, setOpen] = useState(false);
  const editBtnRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (mode !== 'vault') return;
    if (ref.mount) {
      api.listVaultPaths(ref.mount, ref.pathPrefix || '')
        .then((r) => setPaths(r.items || []))
        .catch(() => setPaths([]));
    }
  }, [mode, ref.mount, ref.pathPrefix]);
  useEffect(() => {
    if (mode !== 'vault') return;
    if (ref.mount && ref.path) {
      api.listVaultKeys(ref.mount, ref.path)
        .then((r) => setKeys(r.items || []))
        .catch(() => setKeys([]));
    }
  }, [mode, ref.mount, ref.path]);

  const invalidVault = mode === 'vault' && val && !isValidVaultRef(val);
  const status = mode === 'vault' && isValidVaultRef(val) ? existence.status : 'disabled';
  const borderByStatus = invalidVault
    ? 'border-red-500'
    : status === 'error'
      ? 'border-red-500'
      : status === 'missing'
        ? 'border-amber-400'
        : status === 'exists'
          ? 'border-emerald-400'
          : '';

  const uniqueId = useMemo(() => `rf-${Math.random().toString(36).slice(2)}`, []);

  return (
    <div className="flex items-center gap-2">
      <input
        className={`flex-1 rounded border px-2 py-1 text-xs ${borderByStatus}`}
        placeholder={mode === 'vault' ? 'mount/path/key' : 'value'}
        value={val}
        onChange={(e) => setVal(e.target.value)}
        list={mode === 'vault' ? `${uniqueId}-vault-suggestions` : undefined}
      />
      <div className="relative">
        <select
          aria-label="Reference source"
          className="rounded border px-2 py-1 text-xs"
          value={mode}
          onChange={(e) => setMode((e.target.value as 'static' | 'vault') || 'static')}
        >
          <option value="static">static</option>
          <option value="vault">vault</option>
        </select>
      </div>
      {mode === 'vault' && isValidVaultRef(val) && (
        <span
          aria-label={`Vault reference status: ${status}`}
          title={`Vault reference status: ${status}`}
          className={
            'inline-flex items-center rounded px-1.5 py-0.5 text-[10px] leading-none border ' +
            (status === 'exists'
              ? 'bg-emerald-100 text-emerald-700 border-emerald-300'
              : status === 'missing'
                ? 'bg-amber-100 text-amber-900 border-amber-300'
                : status === 'error'
                  ? 'bg-red-100 text-red-700 border-red-300'
                  : 'bg-muted text-muted-foreground border-muted-foreground/20')
          }
        >
          {status}
        </span>
      )}
      {mode === 'vault' && isValidVaultRef(val) && status !== 'disabled' && (
        <button
          type="button"
          aria-label="Edit vault value"
          className="text-xs px-2 py-1 rounded border hover:bg-accent/50"
          onClick={(e) => { editBtnRef.current = e.currentTarget; setOpen(true); }}
          ref={editBtnRef}
        >
          ✎
        </button>
      )}
      {/* datalists for simple suggestions */}
      {mode === 'vault' && (
        <>
          <datalist id={`${uniqueId}-vault-suggestions`}>
            {mounts.map((m) => (
              <option key={`m-${m}`} value={`${m}/`} />
            ))}
            {paths.map((p) => (
              <option key={`p-${p}`} value={`${ref.mount || 'secret'}/${p}`} />
            ))}
            {keys.map((k) => (
              <option key={`k-${k}`} value={`${ref.mount || 'secret'}/${ref.path || ''}/${k}`} />
            ))}
          </datalist>
        </>
      )}
      {open && ref.mount && ref.path && ref.key && (
        <VaultWriteModal
          mount={ref.mount}
          path={ref.path}
          secretKey={ref.key}
          onClose={(didWrite) => {
            setOpen(false);
            // Return focus to the trigger for accessibility
            setTimeout(() => editBtnRef.current?.focus(), 0);
            if (didWrite) {
              // Existence hook uses RQ cache; invalidation happens in modal, but ensure here too
              // no-op
            }
          }}
        />
      )}
    </div>
  );
}
