import { useEffect, useMemo, useState } from 'react';
import type { StaticConfigViewProps } from './types';
import ReferenceField, { type ReferenceValue } from './shared/ReferenceField';

function isVaultRef(v: string) {
  // Expect mount/path/key
  return /^(?:[^/]+)\/(?:[^/]+)\/(?:[^/]+)$/.test(v || '');
}

export default function SlackTriggerConfigView({ value, onChange, readOnly, disabled, onValidate }: StaticConfigViewProps) {
  const init = useMemo(() => ({ ...(value || {}) }), [value]);
  type Cfg = { app_token?: ReferenceValue | string };
  const [app_token, setAppToken] = useState<ReferenceValue | string>(((init as unknown as Cfg).app_token) || '');

  useEffect(() => {
    const errors: string[] = [];
    const at = typeof app_token === 'string' ? { value: app_token, source: 'static' as const } : (app_token as ReferenceValue);
    if ((at.value || '').length === 0) errors.push('app_token is required');
    if ((at.source || 'static') === 'static' && at.value && !at.value.startsWith('xapp-')) errors.push('app_token must start with xapp-');
    if ((at.source || 'static') === 'vault' && at.value && !isVaultRef(at.value)) errors.push('app_token vault ref must be mount/path/key');
    onValidate?.(errors);
  }, [app_token, onValidate]);

  useEffect(() => {
    const at = typeof app_token === 'string' ? { value: app_token, source: 'static' as const } : (app_token as ReferenceValue);
    const next = { ...value, app_token: at };
    if (JSON.stringify(value || {}) !== JSON.stringify(next)) onChange(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app_token]);

  return (
    <div className="space-y-3 text-sm">
      <ReferenceField
        label="App token"
        value={app_token}
        onChange={(v) => setAppToken(v)}
        readOnly={readOnly}
        disabled={disabled}
        placeholder="xapp-... or mount/path/key"
        helpText="Use source=vault to reference a secret as mount/path/key. Must start with xapp- for static."
      />
    </div>
  );
}
