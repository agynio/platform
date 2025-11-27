import { useCallback } from 'react';
import {
  Button,
  Input,
  Label,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from '@agyn/ui';
import { Brackets, Lock, X } from 'lucide-react';

import type { EnvVar } from '@/components/nodeProperties/types';
import { createEnvVar } from '@/components/nodeProperties/utils';

export interface ReferenceEnvFieldProps {
  label?: string;
  value: EnvVar[];
  onChange: (next: EnvVar[]) => void;
  readOnly?: boolean;
  disabled?: boolean;
  addLabel?: string;
  onValidate?: (errors: string[]) => void;
}

function isVaultRef(v: string) {
  // Expect mount/path/key
  return /^(?:[^/]+)\/(?:[^/]+)\/(?:[^/]+)$/.test(v || '');
}

export default function ReferenceEnvField({ label, value, onChange, readOnly, disabled, addLabel = 'Add env', onValidate }: ReferenceEnvFieldProps) {
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
    (idx: number, next: Partial<EnvVar>) => {
      commit(value.map((item, i) => (i === idx ? { ...item, ...next } : item)));
    },
    [value, commit],
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
              onChange={(e) => updateAt(idx, { name: e.target.value })}
              disabled={isDisabled}
              placeholder="VARIABLE_NAME"
              data-testid={`env-name-${idx}`}
            />
            <Input
              className="text-xs flex-1"
              value={it.value}
              onChange={(e) => updateAt(idx, { value: e.target.value })}
              disabled={isDisabled}
              placeholder={it.source === 'vault' ? 'mount/path/key' : 'value'}
              data-testid={`env-value-${idx}`}
            />
            <DropdownMenu>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      disabled={isDisabled}
                      aria-label={(it.source ?? 'static') === 'vault' ? 'Vault secret' : 'Static value'}
                      data-testid={`env-source-trigger-${idx}`}
                    >
                      {!it.source || it.source === 'static' ? <Brackets aria-hidden className="size-4" /> : <Lock aria-hidden className="size-4" />}
                    </Button>
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent>{(it.source ?? 'static') === 'vault' ? 'Vault secret' : 'Static value'}</TooltipContent>
              </Tooltip>
              <DropdownMenuContent align="end">
                <DropdownMenuRadioGroup
                  value={it.source || 'static'}
                  onValueChange={(v) => {
                    const s = v === 'vault' || v === 'static' ? v : 'static';
                    updateAt(idx, { source: s });
                  }}
                  data-testid={`env-source-menu-${idx}`}
                >
                  <DropdownMenuRadioItem value="static" data-testid={`env-source-option-static-${idx}`}>
                    <Brackets className="mr-2 size-4" /> Static
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="vault" data-testid={`env-source-option-vault-${idx}`}>
                    <Lock className="mr-2 size-4" /> Vault
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
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
