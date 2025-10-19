import { useEffect, useMemo, useState } from 'react';
import { Input, Label } from '@hautech/ui';

export type ReferenceValue = { value: string; source?: 'static' | 'vault' };

export interface ReferenceFieldProps {
  label?: string;
  value?: ReferenceValue | string;
  onChange: (next: ReferenceValue) => void;
  readOnly?: boolean;
  disabled?: boolean;
  placeholder?: string;
  helpText?: string;
}

/**
 * ReferenceField allows choosing between static value and vault reference.
 * Emits normalized shape { value, source } with default source 'static'.
 */
export default function ReferenceField({ label, value, onChange, readOnly, disabled, placeholder, helpText }: ReferenceFieldProps) {
  const init = useMemo<ReferenceValue>(() => {
    if (!value) return { value: '', source: 'static' };
    if (typeof value === 'string') return { value, source: 'static' };
    return { value: value.value || '', source: value.source || 'static' };
  }, [value]);

  const [val, setVal] = useState<string>(init.value);
  const [source, setSource] = useState<'static' | 'vault'>(init.source || 'static');

  const isDisabled = !!readOnly || !!disabled;

  useEffect(() => {
    onChange({ value: val, source });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [val, source]);

  return (
    <div className="space-y-1">
      {label ? <Label className="text-xs">{label}</Label> : null}
      <div className="flex items-center gap-2">
        <select
          className="border rounded px-2 py-1 text-xs bg-background"
          value={source}
          onChange={(e) => setSource((e.target.value as 'static' | 'vault') || 'static')}
          disabled={isDisabled}
          data-testid="ref-source"
        >
          <option value="static">static</option>
          <option value="vault">vault</option>
        </select>
        <Input
          className="text-xs flex-1"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          disabled={isDisabled}
          placeholder={placeholder || (source === 'vault' ? 'mount/path/key' : '')}
          data-testid="ref-value"
        />
      </div>
      {helpText ? <div className="text-[10px] text-muted-foreground">{helpText}</div> : null}
    </div>
  );
}

