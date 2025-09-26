// Use relative import to avoid alias resolution issues in test environment
import { Switch } from '../../ui/switch';
import type { ReactNode } from 'react';

interface WidgetCommonProps { id: string; value: unknown; onChange: (val: unknown) => void; options?: Record<string, unknown>; placeholder?: string; required?: boolean; disabled?: boolean; readonly?: boolean; label?: string; }

export const widgets: Record<string, (p: WidgetCommonProps) => ReactNode> = {
  TextWidget: (p) => (
    <input
      id={p.id}
      value={typeof p.value === 'string' ? p.value : p.value == null ? '' : String(p.value)}
      onChange={(e) => p.onChange(e.target.value)}
      placeholder={p.placeholder || (p.options?.placeholder as string | undefined)}
      className="w-full rounded border bg-background px-2 py-1 text-xs"
    />
  ),
  TextareaWidget: (p) => (
    <textarea
      id={p.id}
      value={typeof p.value === 'string' ? p.value : p.value == null ? '' : String(p.value)}
      onChange={(e) => p.onChange(e.target.value)}
      rows={6}
      className="w-full font-mono rounded border bg-background px-2 py-1 text-[10px]"
    />
  ),
  NumberWidget: (p) => (
    <input
      id={p.id}
      type="number"
      value={typeof p.value === 'number' ? p.value : p.value == null ? '' : Number(p.value)}
      onChange={(e) => p.onChange(e.target.value === '' ? undefined : Number(e.target.value))}
      className="w-full rounded border bg-background px-2 py-1 text-xs"
    />
  ),
  CheckboxWidget: (p) => (
    <div className="flex items-center h-5">
      <Switch
        id={p.id}
        checked={Boolean(p.value)}
        onCheckedChange={(checked) => p.onChange(checked)}
        disabled={p.disabled || p.readonly}
      />
    </div>
  ),
};
