import { useEffect, useMemo, useState } from 'react';
import type { StaticConfigViewProps } from './types';
import ReferenceField, { type ReferenceValue } from './shared/ReferenceField';

function isVaultRef(v: string) {
  return /^([^\/]+)\/([^\/]+)\/([^\/]+)$/.test(v || '');
}

export default function GithubCloneRepoToolConfigView({ value, onChange, readOnly, disabled }: StaticConfigViewProps) {
  const init = useMemo(() => ({ ...(value || {}) }), [value]);
  const [token, setToken] = useState<ReferenceValue | string>((init.token as any) || '');
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    const t = typeof token === 'string' ? { value: token, source: 'static' as const } : (token as ReferenceValue);
    const errs: string[] = [];
    if ((t.source || 'static') === 'vault' && t.value && !isVaultRef(t.value)) errs.push('token vault ref must be mount/path/key');
    setErrors(errs);
    onChange({ ...value, token: t });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <div className="space-y-3 text-sm">
      <ReferenceField
        label="GitHub token (optional)"
        value={token as any}
        onChange={(v) => setToken(v)}
        readOnly={readOnly}
        disabled={disabled}
        placeholder="token or mount/path/key"
        helpText="When using vault, value should be 'mount/path/key'."
      />
      {errors.length > 0 && <div className="text-[10px] text-red-600">{errors.join(', ')}</div>}
    </div>
  );
}
