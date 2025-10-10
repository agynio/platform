import { useEffect, useMemo, useState } from 'react';
import { api } from '../../../lib/graph/api';

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
  const ref = useMemo(() => parseRef(val), [val]);
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

  const uniqueId = useMemo(() => `rf-${Math.random().toString(36).slice(2)}`, []);

  return (
    <div className="flex items-center gap-2">
      <input
        className={`flex-1 rounded border px-2 py-1 text-xs ${invalidVault ? 'border-red-500' : ''}`}
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
    </div>
  );
}

function parseRef(v?: string): { mount?: string; path?: string; key?: string; pathPrefix?: string } {
  if (!v) return {};
  if (v.startsWith('/')) return {};
  const parts = v.split('/').filter(Boolean);
  if (parts.length === 0) return {};
  if (parts.length === 1) return { mount: parts[0] };
  if (parts.length === 2) return { mount: parts[0], pathPrefix: parts[1] };
  const mount = parts[0];
  const key = parts[parts.length - 1];
  const path = parts.slice(1, parts.length - 1).join('/');
  return { mount, path, key };
}

function isValidVaultRef(v?: string): boolean {
  if (!v) return true;
  if (v.startsWith('/')) return false;
  const parts = v.split('/').filter(Boolean);
  return parts.length >= 3;
}
