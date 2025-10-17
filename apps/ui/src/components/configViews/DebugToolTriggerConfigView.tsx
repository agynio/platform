import { useEffect, useMemo, useState } from 'react';
import { Input } from '@hautech/ui';
import type { StaticConfigViewProps } from './types';

export default function DebugToolTriggerConfigView({ value, onChange, readOnly, disabled, onValidate }: StaticConfigViewProps) {
  const init = useMemo(() => ({ ...(value || {}) }), [value]);
  const [path, setPath] = useState<string>((init.path as string) || '/debug/tool');
  const [method, setMethod] = useState<string>((init.method as string) || 'POST');
  const isDisabled = !!readOnly || !!disabled;

  useEffect(() => {
    const errors: string[] = [];
    if (!path || !path.startsWith('/')) errors.push('path must start with /');
    if (!method) errors.push('method is required');
    onValidate?.(errors);
  }, [path, method, onValidate]);

  useEffect(() => {
    onChange({ ...value, path, method });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, method]);

  return (
    <div className="space-y-3 text-sm">
      <div>
        <label className="block text-xs mb-1">Path</label>
        <Input value={path} onChange={(e) => setPath(e.target.value)} disabled={isDisabled} />
      </div>
      <div>
        <label className="block text-xs mb-1">Method</label>
        <select className="w-full border rounded px-2 py-1" value={method} onChange={(e) => setMethod(e.target.value)} disabled={isDisabled}>
          {['POST', 'GET'].map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
