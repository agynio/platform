import { useEffect, useMemo, useState } from 'react';
import { Input } from '@hautech/ui';
import type { StaticConfigViewProps } from './types';

export default function DebugToolTriggerConfigView({ value, onChange, readOnly, disabled, onValidate }: StaticConfigViewProps) {
  const init = useMemo(() => ({ ...(value || {}) }), [value]);
  const [path, setPath] = useState<string>((init.path as string) || '/debug/tool');
  const [method] = useState<string>('POST');
  const [authToken, setAuthToken] = useState<string>((init.authToken as string) || '');
  const isDisabled = !!readOnly || !!disabled;

  useEffect(() => {
    const errors: string[] = [];
    if (!path || !path.startsWith('/')) errors.push('path must start with /');
    if (!method || method !== 'POST') errors.push('method must be POST');
    onValidate?.(errors);
  }, [path, method, onValidate]);

  useEffect(() => {
    onChange({ ...value, path, method: 'POST', authToken: authToken || undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, method, authToken]);

  return (
    <div className="space-y-3 text-sm">
      <div>
        <label className="block text-xs mb-1">Path</label>
        <Input value={path} onChange={(e) => setPath(e.target.value)} disabled={isDisabled} />
      </div>
      <div>
        <label className="block text-xs mb-1">Auth token (optional)</label>
        <Input value={authToken} onChange={(e) => setAuthToken(e.target.value)} disabled={isDisabled} placeholder="Provide to require X-Debug-Token header" />
      </div>
    </div>
  );
}
