import { useMemo, useState } from 'react';
import { ReferenceField, type ReferenceValue } from './referenceField';

type EnvItem = { key: string; value: string; source?: 'static' | 'vault' };

export function ReferenceEnvField({ formData, onChange }: { formData?: EnvItem[]; onChange?: (next: EnvItem[]) => void }) {
  const items = useMemo(() => Array.isArray(formData) ? [...formData] : [], [formData]);
  const [newKey, setNewKey] = useState('');
  const [newVal, setNewVal] = useState<ReferenceValue>({ value: '', source: 'static' });

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const it of items) c[it.key] = (c[it.key] || 0) + 1;
    return c;
  }, [items]);
  const isDup = (k: string) => !!k && (counts[k] || 0) > 1;

  function updateAt(idx: number, patch: Partial<EnvItem>) {
    const next = items.map((it, i) => (i === idx ? { ...it, ...patch } : it));
    onChange?.(next);
  }
  function removeAt(idx: number) {
    const next = items.filter((_, i) => i !== idx);
    onChange?.(next);
  }
  function add() {
    if (!newKey.trim() || isDup(newKey)) return;
    const next = [...items, { key: newKey.trim(), value: newVal.value || '', source: newVal.source || 'static' }];
    onChange?.(next);
    setNewKey('');
    setNewVal({ value: '', source: 'static' });
  }

  const vaultRefInvalid = (i: EnvItem) => i.source === 'vault' && !isValidVaultRef(i.value);

  return (
    <div className="space-y-2">
      {items.length === 0 && <div className="text-[10px] text-muted-foreground">No environment variables</div>}
      {items.map((it, idx) => (
        <div key={`${it.key}-${idx}`} className="flex items-center gap-2">
          <input className={`w-40 rounded border px-2 py-1 text-xs ${isDup(it.key) ? 'border-red-500' : ''}`} value={it.key} readOnly />
          <div className="flex-1">
            <ReferenceField
              formData={{ value: it.value, source: it.source || 'static' }}
              onChange={(r) => updateAt(idx, { value: r.value || '', source: r.source || 'static' })}
            />
          </div>
          <button
            type="button"
            className="text-xs px-2 py-1 rounded border hover:bg-destructive/10 text-destructive"
            onClick={() => removeAt(idx)}
          >
            ×
          </button>
          {vaultRefInvalid(it) && <span className="text-[10px] text-red-500">mount/path/key required</span>}
        </div>
      ))}
      <div className="flex items-center gap-2">
        <input
          className={`w-40 rounded border px-2 py-1 text-xs ${isDup(newKey) ? 'border-red-500' : ''}`}
          placeholder="key"
          value={newKey}
          onChange={(e) => setNewKey(e.target.value)}
        />
        <div className="flex-1">
          <ReferenceField formData={newVal} onChange={(r) => setNewVal(r)} />
        </div>
        <button type="button" className="text-xs px-2 py-1 rounded border hover:bg-accent/50" onClick={add} disabled={!newKey.trim() || isDup(newKey)}>
          Add
        </button>
      </div>
    </div>
  );
}

function isValidVaultRef(v?: string): boolean {
  if (!v) return true;
  if (v.startsWith('/')) return false;
  const parts = v.split('/').filter(Boolean);
  return parts.length >= 3;
}
