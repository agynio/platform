import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { Input } from '@agyn/ui';
import { getCanonicalToolName } from '@/components/nodeProperties/toolCanonicalNames';
import { isValidToolName } from '@/components/nodeProperties/utils';
import type { StaticConfigViewProps } from './types';
import { ToolNameLabel } from './shared/ToolNameLabel';

export default function RemindMeToolConfigView({ value, onChange, readOnly, disabled }: StaticConfigViewProps) {
  const init = useMemo(() => ({ ...(value || {}) }), [value]);
  const [maxActive, setMaxActive] = useState<number>(typeof init.maxActive === 'number' ? (init.maxActive as number) : 3);
  const [name, setName] = useState<string>((init.name as string) || '');
  const [nameError, setNameError] = useState<string | null>(null);
  const isDisabled = !!readOnly || !!disabled;
  const namePlaceholder = getCanonicalToolName('remindMeTool') || 'remind_me';

  useEffect(() => {
    const trimmedName = name.trim();
    let nextName: string | undefined;
    if (trimmedName.length === 0) {
      setNameError(null);
      nextName = undefined;
    } else if (isValidToolName(trimmedName)) {
      setNameError(null);
      nextName = trimmedName;
    } else {
      setNameError('Name must match ^[a-z0-9_]{1,64}$');
      nextName = typeof init.name === 'string' ? (init.name as string) : undefined;
    }

    const next = { ...value, maxActive, name: nextName };
    if (JSON.stringify(value || {}) !== JSON.stringify(next)) onChange(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maxActive, name]);

  useEffect(() => {
    setName((init.name as string) || '');
  }, [init]);

  return (
    <div className="space-y-3 text-sm">
      <div>
        <ToolNameLabel />
        <Input
          value={name}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
          disabled={isDisabled}
          placeholder={namePlaceholder}
        />
        {nameError && <div className="text-[10px] text-red-600 mt-1">{nameError}</div>}
      </div>
      <div>
        <label className="block text-xs mb-1">Max active reminders</label>
        <Input type="number" min={1} value={maxActive} onChange={(e: ChangeEvent<HTMLInputElement>) => setMaxActive(parseInt(e.target.value || '1', 10))} disabled={isDisabled} />
      </div>
    </div>
  );
}
