import { Button, Input } from '@hautech/ui';

export interface KeyValueEditorProps {
  value: Record<string, string> | undefined;
  onChange: (next: Record<string, string>) => void;
  readOnly?: boolean;
  disabled?: boolean;
  addLabel?: string;
}

export function KeyValueEditor({ value, onChange, readOnly, disabled, addLabel = 'Add' }: KeyValueEditorProps) {
  const entries = Object.entries(value || {});
  const isDisabled = !!readOnly || !!disabled;

  function updateAt(idx: number, k: string, v: string) {
    const next: Record<string, string> = {};
    entries.forEach(([ek, ev], i) => {
      if (i === idx) {
        next[k] = v;
      } else {
        next[ek] = ev;
      }
    });
    onChange(next);
  }

  function removeAt(idx: number) {
    const next: Record<string, string> = {};
    entries.forEach(([ek, ev], i) => {
      if (i !== idx) next[ek] = ev;
    });
    onChange(next);
  }

  function addRow() {
    const next: Record<string, string> = { ...(value || {}) };
    const base = 'KEY';
    let i = 1;
    while (`${base}_${i}` in next) i++;
    next[`${base}_${i}`] = '';
    onChange(next);
  }

  return (
    <div className="space-y-2">
      {entries.length === 0 && <div className="text-xs text-muted-foreground">No entries</div>}
      <div className="space-y-2">
        {entries.map(([k, v], idx) => (
          <div key={`${k}-${idx}`} className="flex items-center gap-2">
            <Input className="text-xs w-1/3" value={k} onChange={(e) => updateAt(idx, e.target.value, v)} disabled={isDisabled} placeholder="Key" />
            <Input className="text-xs flex-1" value={v} onChange={(e) => updateAt(idx, k, e.target.value)} disabled={isDisabled} placeholder="Value" />
            <Button type="button" size="sm" variant="outline" onClick={() => removeAt(idx)} disabled={isDisabled}>Remove</Button>
          </div>
        ))}
      </div>
      <Button type="button" size="sm" variant="outline" onClick={addRow} disabled={isDisabled}>
        {addLabel}
      </Button>
    </div>
  );
}

export default KeyValueEditor;
