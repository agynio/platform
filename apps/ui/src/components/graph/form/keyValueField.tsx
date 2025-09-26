import { useState } from 'react';
import { Switch } from '../../ui/switch';

interface KeyValueFieldProps {
  formData?: Record<string, unknown>;
  onChange: (val: Record<string, unknown>) => void;
  disabled?: boolean;
  readonly?: boolean;
  // Explicit override. If omitted we attempt to infer from schema.additionalProperties.type
  valueKind?: 'string' | 'boolean';
  // rjsf supplies schema when used as a custom field
  schema?: Record<string, unknown> & {
    additionalProperties?: unknown;
  };
  uiSchema?: Record<string, unknown>; // keep for future optional flag support
}

export const KeyValueField = ({ formData, onChange, disabled, readonly, valueKind, schema }: KeyValueFieldProps) => {
  const entries = Object.entries(formData || {});
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');

  const update = (k: string, v: unknown) => {
    const next = { ...(formData || {}) } as Record<string, unknown>;
    next[k] = v;
    onChange(next);
  };
  const remove = (k: string) => {
    const next = { ...(formData || {}) } as Record<string, unknown>;
    delete next[k];
    onChange(next);
  };
  const add = () => {
    if (!newKey.trim()) return;
    if ((formData || {})[newKey]) return;
    const next = { ...(formData || {}) } as Record<string, unknown>;
    next[newKey] = newValue;
    onChange(next);
    setNewKey('');
    setNewValue('');
  };

  // Infer boolean map if not explicitly provided
  let inferredBoolean = false;
  if (!valueKind && schema?.additionalProperties && typeof schema.additionalProperties === 'object') {
    const ap = schema.additionalProperties as Record<string, unknown>;
    if (ap.type === 'boolean') inferredBoolean = true;
  }
  const isBoolean = valueKind === 'boolean' || inferredBoolean;

  return (
    <div className="space-y-2">
      <div className="space-y-1">
        {entries.length === 0 && <div className="text-[10px] text-muted-foreground">No entries</div>}
        {entries.map(([k, v]) => (
          <div key={k} className="flex items-center gap-2">
            <input
              className="w-40 rounded border bg-background px-2 py-1 text-[11px] font-mono"
              value={k}
              disabled
              readOnly
            />
            {isBoolean ? (
              <div className="flex items-center gap-2 pr-2">
                <Switch
                  checked={!!v}
                  onCheckedChange={(val) => update(k, val)}
                  disabled={disabled || readonly}
                />
                <span className="text-[10px] text-muted-foreground select-none">{v ? 'true' : 'false'}</span>
              </div>
            ) : (
              <input
                className="flex-1 rounded border bg-background px-2 py-1 text-[11px] font-mono"
                value={typeof v === 'string' || typeof v === 'number' ? String(v) : ''}
                onChange={(e) => update(k, e.target.value)}
                disabled={disabled || readonly}
              />
            )}
            {!isBoolean && (
              <button
                type="button"
                className="text-xs px-2 py-1 rounded border hover:bg-destructive/10 text-destructive"
                onClick={() => remove(k)}
                disabled={disabled || readonly}
                aria-label={`Remove ${k}`}
              >
                ×
              </button>
            )}
          </div>
        ))}
      </div>
      {!isBoolean && (
        <div className="flex items-center gap-2">
          <input
            className="w-40 rounded border bg-background px-2 py-1 text-[11px] font-mono"
            placeholder="key"
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            disabled={disabled || readonly}
          />
          <input
            className="flex-1 rounded border bg-background px-2 py-1 text-[11px] font-mono"
            placeholder="value"
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            disabled={disabled || readonly}
          />
          <button
            type="button"
            className="text-xs px-2 py-1 rounded border hover:bg-accent/50"
            onClick={add}
            disabled={disabled || readonly || !newKey.trim()}
          >
            Add
          </button>
        </div>
      )}
    </div>
  );
};

// (registry export removed to keep file hot-refresh friendly)
