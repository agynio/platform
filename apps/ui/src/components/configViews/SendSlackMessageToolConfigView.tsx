import { useEffect, useMemo, useState } from 'react';
import { Input } from '@hautech/ui';
import type { StaticConfigViewProps } from './types';
import ReferenceField, { type ReferenceValue } from './shared/ReferenceField';

function isVaultRef(v: string) {
  // Expect mount/path/key
  return /^(?:[^/]+)\/(?:[^/]+)\/(?:[^/]+)$/.test(v || '');
}

export default function SendSlackMessageToolConfigView({ value, onChange, readOnly, disabled, onValidate }: StaticConfigViewProps) {
  const init = useMemo(() => ({ ...(value || {}) }), [value]);
  const [default_channel, setDefaultChannel] = useState<string>((init.default_channel as string) || '');
  type Cfg = { bot_token?: ReferenceValue | string; default_channel?: string };
  const initCfg = init as unknown as Cfg;
  const [bot_token, setBotToken] = useState<ReferenceValue | string>(initCfg.bot_token || '');
  const [errors, setErrors] = useState<string[]>([]);
  const isDisabled = !!readOnly || !!disabled;

  useEffect(() => {
    const errors: string[] = [];
    const bt = typeof bot_token === 'string' ? { value: bot_token, source: 'static' as const } : (bot_token as ReferenceValue);
    if ((bt.value || '').length === 0) errors.push('bot_token is required');
    if ((bt.source || 'static') === 'static' && bt.value && !bt.value.startsWith('xoxb-')) errors.push('bot_token must start with xoxb-');
    if ((bt.source || 'static') === 'vault' && bt.value && !isVaultRef(bt.value)) errors.push('bot_token vault ref must be mount/path/key');
    setErrors(errors);
    onValidate?.(errors);
  }, [bot_token, onValidate]);

  useEffect(() => {
    const token = typeof bot_token === 'string' ? { value: bot_token, source: 'static' as const } : (bot_token as ReferenceValue);
    const next = { ...value, bot_token: token, default_channel };
    if (JSON.stringify(value || {}) !== JSON.stringify(next)) onChange(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bot_token, default_channel]);

  return (
    <div className="space-y-3 text-sm">
      <ReferenceField
        label="Bot token"
        value={bot_token}
        onChange={(v) => setBotToken(v)}
        readOnly={readOnly}
        disabled={disabled}
        placeholder="xoxb-... or mount/path/key"
        helpText="Use source=vault to reference a secret as mount/path/key."
      />
      {errors.length > 0 && <div className="text-[10px] text-red-600">{errors.join(', ')}</div>}
      <div>
        <label className="block text-xs mb-1">Default channel</label>
        <Input value={default_channel} onChange={(e) => setDefaultChannel(e.target.value)} disabled={isDisabled} placeholder="C123 or #general" />
      </div>
    </div>
  );
}
