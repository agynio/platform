import { useCallback, type ChangeEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ReferenceInput } from '@/components/ReferenceInput';
import { X } from 'lucide-react';

import type { EnvVar } from '@/components/nodeProperties/types';
import {
  createEnvVar,
  encodeReferenceValue,
  fromReferenceSourceType,
  toReferenceSourceType,
  writeReferenceValue,
  type ReferenceSourceType,
} from '@/components/nodeProperties/utils';

export interface ReferenceEnvFieldProps {
  label?: string;
  value: EnvVar[];
  onChange: (next: EnvVar[]) => void;
  readOnly?: boolean;
  disabled?: boolean;
  addLabel?: string;
  onValidate?: (errors: string[]) => void;
  secretKeys?: string[];
  variableKeys?: string[];
  onValueFocus?: (index: number) => void;
}

function isVaultRef(v: string) {
  return /^(?:[^/]+)\/(?:[^/]+)\/(?:[^/]+)$/.test(v || '');
}

export default function ReferenceEnvField({
  label,
  value,
  onChange,
  readOnly,
  disabled,
  addLabel = 'Add env',
  onValidate,
  secretKeys = [],
  variableKeys = [],
  onValueFocus,
}: ReferenceEnvFieldProps) {
  const isDisabled = !!readOnly || !!disabled;

  const validate = useCallback(
    (list: EnvVar[]) => {
      const errors: string[] = [];
      const seen = new Set<string>();
      for (const it of list) {
        const name = (it.name || '').trim();
        if (!name) errors.push('env name is required');
        if (seen.has(name)) errors.push(`duplicate env name: ${name}`);
        if (name) seen.add(name);
        const src = it.source || 'static';
        if (src === 'vault' && it.value && !isVaultRef(it.value)) errors.push(`env ${name || '(blank)'} vault ref must be mount/path/key`);
        if (src === 'variable' && !(it.value || '').trim()) errors.push(`env ${name || '(blank)'} variable name is required`);
      }
      onValidate?.(errors);
    },
    [onValidate],
  );

  const commit = useCallback(
    (list: EnvVar[]) => {
      validate(list);
      onChange(list);
    },
    [onChange, validate],
  );

  const addRow = useCallback(() => {
    const base = 'NAME';
    let i = 1;
    const existing = new Set(value.map((x) => x.name));
    while (existing.has(`${base}_${i}`)) i++;
    commit([...value, createEnvVar({ name: `${base}_${i}` })]);
  }, [value, commit]);

  const removeAt = useCallback(
    (idx: number) => {
      commit(value.filter((_, i) => i !== idx));
    },
    [value, commit],
  );

  const updateAt = useCallback(
    (idx: number, updater: (current: EnvVar) => EnvVar) => {
      commit(value.map((item, i) => (i === idx ? updater(item) : item)));
    },
    [value, commit],
  );

  const handleValueChange = useCallback(
    (idx: number, nextValue: string) => {
      updateAt(idx, (current) => {
        const sourceType = toReferenceSourceType(current.source);
        const nextShape = writeReferenceValue(current.meta.valueShape, nextValue, sourceType);
        return {
          ...current,
          value: nextValue,
          meta: { ...current.meta, valueShape: nextShape },
        } satisfies EnvVar;
      });
    },
    [updateAt],
  );

  const handleSourceTypeChange = useCallback(
    (idx: number, nextType: ReferenceSourceType) => {
      updateAt(idx, (current) => {
        const nextSource = fromReferenceSourceType(nextType);
        const nextShape = encodeReferenceValue(nextType, '', current.meta.valueShape);
        return {
          ...current,
          source: nextSource,
          value: '',
          meta: { ...current.meta, valueShape: nextShape },
        } satisfies EnvVar;
      });
    },
    [updateAt],
  );

  return (
    <div className="space-y-2">
      {label ? <Label className="text-xs">{label}</Label> : null}
      {value.length === 0 && <div className="text-xs text-muted-foreground">No env set</div>}
      <div className="space-y-2">
        {value.map((it, idx) => (
          <div key={it.id} className="flex items-center gap-2">
            <Input
              className="text-xs w-1/3"
              value={it.name}
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                updateAt(idx, (current) => ({ ...current, name: e.target.value }))
              }
              disabled={isDisabled}
              placeholder="VARIABLE_NAME"
              data-testid={`env-name-${idx}`}
            />
            <ReferenceInput
              value={it.value}
              onChange={(event) => handleValueChange(idx, event.target.value)}
              sourceType={toReferenceSourceType(it.source)}
              onSourceTypeChange={(type) => handleSourceTypeChange(idx, type)}
              disabled={isDisabled}
              placeholder="Value or reference..."
              secretKeys={secretKeys}
              variableKeys={variableKeys}
              size="sm"
              className="text-xs"
              onFocus={() => onValueFocus?.(idx)}
              data-testid={`env-value-${idx}`}
            />
            <Button
              type="button"
              size="icon"
              variant="outline"
              onClick={() => removeAt(idx)}
              disabled={isDisabled}
              aria-label="Remove variable"
              data-testid={`env-remove-${idx}`}
            >
              <X className="size-4" />
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
