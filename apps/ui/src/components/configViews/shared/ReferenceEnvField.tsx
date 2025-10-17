import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Input, Label } from '@hautech/ui';

export type EnvItem = { key: string; value: string; source?: 'static' | 'vault' };

export interface ReferenceEnvFieldProps {
  label?: string;
  value?: EnvItem[] | Record<string, string>;
  onChange: (next: EnvItem[]) => void;
  readOnly?: boolean;
  disabled?: boolean;
  addLabel?: string;
  onValidate?: (errors: string[]) => void;
}

function toArray(v?: EnvItem[] | Record<string, string>): EnvItem[] {
  if (!v) return [];
  if (Array.isArray(v)) return v.map((it) => ({ key: it.key, value: it.value, source: it.source || 'static' }));
  return Object.entries(v).map(([k, val]) => ({ key: k, value: val as string, source: 'static' as const }));
}

function isVaultRef(v: string) {
  return /^([^\/]+)\/([^\/]+)\/([^\/]+)$/.test(v || '');
}

export default function ReferenceEnvField({ label, value, onChange, readOnly, disabled, addLabel = 'Add env', onValidate }: ReferenceEnvFieldProps) {
  const [items, setItems] = useState<EnvItem[]>(toArray(value));

  const isDisabled = !!readOnly || !!disabled;

  const validate = useCallback((list: EnvItem[]) => {
    const errors: string[] = [];
    const seen = new Set<string>();
    for (const it of list) {
      const k = (it.key || '').trim();
      if (!k) errors.push('env key is required');
      if (seen.has(k)) errors.push(`duplicate env key: ${k}`);
      if (k) seen.add(k);
      const src = (it.source || 'static');
      if (src === 'vault' && it.value && !isVaultRef(it.value)) errors.push(`env ${k || '(blank)'} vault ref must be mount/path/key`);
    }
    onValidate?.(errors);
  }, [onValidate]);

  const commit = useCallback(
    (list: EnvItem[]) => {
      setItems(list);
      validate(list);
      onChange(list.map((i) => ({ key: i.key, value: i.value, source: i.source || 'static' })));
    },
    [onChange, validate],
  );

  const addRow = useCallback(() => {
    const base = 'KEY';
    let i = 1;
    const existing = new Set(items.map((x) => x.key));
    while (existing.has(`${base}_${i}`)) i++;
    commit([...items, { key: `${base}_${i}`, value: '', source: 'static' }]);
  }, [items, commit]);

  const removeAt = useCallback(
    (idx: number) => {
      commit(items.filter((_, i) => i !== idx));
    },
    [items, commit],
  );

  const updateAt = useCallback(
    (idx: number, next: Partial<EnvItem>) => {
      const list = items.slice();
      list[idx] = { ...list[idx], ...next } as EnvItem;
      commit(list);
    },
    [items, commit],
  );

  return (
    <div className="space-y-2">
      {label ? <Label className="text-xs">{label}</Label> : null}
      {items.length === 0 && <div className="text-xs text-muted-foreground">No env set</div>}
      <div className="space-y-2">
        {items.map((it, idx) => (
          <div key={`${it.key}-${idx}`} className="flex items-center gap-2">
            <Input
              className="text-xs w-1/3"
              value={it.key}
              onChange={(e) => updateAt(idx, { key: e.target.value })}
              disabled={isDisabled}
              placeholder="KEY"
              data-testid={`env-key-${idx}`}
            />
            <select
              className="border rounded px-2 py-1 text-xs bg-background"
              value={it.source || 'static'}
              onChange={(e) => updateAt(idx, { source: (e.target.value as 'static' | 'vault') || 'static' })}
              disabled={isDisabled}
              data-testid={`env-source-${idx}`}
            >
              <option value="static">static</option>
              <option value="vault">vault</option>
            </select>
            <Input
              className="text-xs flex-1"
              value={it.value}
              onChange={(e) => updateAt(idx, { value: e.target.value })}
              disabled={isDisabled}
              placeholder={it.source === 'vault' ? 'mount/path/key' : 'value'}
              data-testid={`env-value-${idx}`}
            />
            <Button type="button" size="sm" variant="outline" onClick={() => removeAt(idx)} disabled={isDisabled}>
              Remove
            </Button>
          </div>
        ))}
      </div>
      <Button type="button" size="sm" variant="outline" onClick={addRow} disabled={isDisabled} data-testid="env-add">
        {addLabel}
      </Button>
    </div>
  );
}
