import { useEffect, useMemo, useState } from 'react';
import { Input } from '@agyn/ui';
import { getCanonicalToolName } from '@/components/nodeProperties/toolCanonicalNames';
import { isValidToolName } from '@/components/nodeProperties/utils';
import type { StaticConfigViewProps } from './types';
import { ToolNameLabel } from './shared/ToolNameLabel';

export default function CallAgentToolConfigView({ value, onChange, readOnly, disabled, onValidate }: StaticConfigViewProps) {
  const init = useMemo(() => ({ ...(value || {}) }), [value]);
  const [description, setDescription] = useState<string>((init.description as string) || '');
  const [name, setName] = useState<string>((init.name as string) || '');
  const [response, setResponse] = useState<string>((init.response as string) || 'sync');
  const [nameError, setNameError] = useState<string | null>(null);
  const isDisabled = !!readOnly || !!disabled;
  const namePlaceholder = getCanonicalToolName('callAgentTool') || 'call_agent';

  useEffect(() => {
    const errors: string[] = [];
    if (name && !isValidToolName(name)) {
      errors.push('Name must match ^[a-z0-9_]{1,64}$');
      setNameError('Name must match ^[a-z0-9_]{1,64}$');
    } else {
      setNameError(null);
    }
    if (response && !['sync', 'async', 'ignore'].includes(response)) errors.push('response must be sync|async|ignore');
    onValidate?.(errors);
  }, [name, response, onValidate]);

  useEffect(() => {
    const trimmedName = name.trim();
    let nextName: string | undefined;
    if (trimmedName.length === 0) {
      nextName = undefined;
    } else if (isValidToolName(trimmedName)) {
      nextName = trimmedName;
    } else {
      nextName = typeof init.name === 'string' ? (init.name as string) : undefined;
    }

    const next = {
      ...value,
      description: description || undefined,
      name: nextName,
      response: response || undefined,
    };
    if (JSON.stringify(value || {}) !== JSON.stringify(next)) onChange(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [description, name, response]);

  useEffect(() => {
    setName((init.name as string) || '');
  }, [init]);

  return (
    <div className="space-y-3 text-sm">
      <div>
        <label className="block text-xs mb-1">Description (optional)</label>
        <Input value={description} onChange={(e) => setDescription(e.target.value)} disabled={isDisabled} placeholder="Tool description" />
      </div>
      <div>
        <ToolNameLabel />
        <Input value={name} onChange={(e) => setName(e.target.value)} disabled={isDisabled} placeholder={namePlaceholder} />
        {nameError && <div className="text-[10px] text-red-600 mt-1">{nameError}</div>}
      </div>
      <div>
        <label className="block text-xs mb-1">Response mode</label>
        <select className="w-full border rounded px-2 py-1 text-xs bg-background" value={response} onChange={(e) => setResponse(e.target.value)} disabled={isDisabled}>
          <option value="sync">sync</option>
          <option value="async">async</option>
          <option value="ignore">ignore</option>
        </select>
      </div>
    </div>
  );
}
