import { useEffect, useMemo, useState } from 'react';
import { Input } from '@hautech/ui';
import type { StaticConfigViewProps } from './types';

export default function CallAgentToolConfigView({ value, onChange, readOnly, disabled, onValidate }: StaticConfigViewProps) {
  const init = useMemo(() => ({ ...(value || {}) }), [value]);
  const [description, setDescription] = useState<string>((init.description as string) || '');
  const [name, setName] = useState<string>((init.name as string) || '');
  const [response, setResponse] = useState<string>((init.response as string) || 'sync');
  const isDisabled = !!readOnly || !!disabled;

  useEffect(() => {
    const errors: string[] = [];
    if (name && !/^[a-z0-9_]{1,64}$/.test(name)) errors.push('name must match ^[a-z0-9_]{1,64}$');
    if (response && !['sync', 'async', 'ignore'].includes(response)) errors.push('response must be sync|async|ignore');
    onValidate?.(errors);
  }, [name, response, onValidate]);

  useEffect(() => {
    const next = { ...value, description: description || undefined, name: name || undefined, response: response || undefined };
    if (JSON.stringify(value || {}) !== JSON.stringify(next)) onChange(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [description, name, response]);

  return (
    <div className="space-y-3 text-sm">
      <div>
        <label className="block text-xs mb-1">Description (optional)</label>
        <Input value={description} onChange={(e) => setDescription(e.target.value)} disabled={isDisabled} placeholder="Tool description" />
      </div>
      <div>
        <label className="block text-xs mb-1">Name (optional)</label>
        <Input value={name} onChange={(e) => setName(e.target.value)} disabled={isDisabled} placeholder="call_agent or custom_name" />
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
