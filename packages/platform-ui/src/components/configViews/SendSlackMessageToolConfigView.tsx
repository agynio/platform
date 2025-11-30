import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { Input } from '@agyn/ui';
import { getCanonicalToolName } from '@/components/nodeProperties/toolCanonicalNames';
import { isValidToolName } from '@/components/nodeProperties/utils';
import type { StaticConfigViewProps } from './types';
import ReferenceField, { type ReferenceValue } from './shared/ReferenceField';
import { ToolNameLabel } from './shared/ToolNameLabel';

function isVaultRef(v: string) {
  // Expect mount/path/key
  return /^(?:[^/]+)\/(?:[^/]+)\/(?:[^/]+)$/.test(v || '');
}

export default function SendSlackMessageToolConfigView({ value, onChange, readOnly, disabled, onValidate }: StaticConfigViewProps) {
  const init = useMemo(() => ({ ...(value || {}) }), [value]);
  const [default_channel, setDefaultChannel] = useState<string>(() => {
    const dc = (init as Record<string, unknown>)['default_channel'];
    return typeof dc === 'string' ? dc : '';
  });
  const [bot_token, setBotToken] = useState<ReferenceValue | string>(() => {
    const t = (init as Record<string, unknown>)['bot_token'];
    if (!t) return '';
    if (typeof t === 'string') return t;
    if (t && typeof t === 'object' && 'value' in (t as Record<string, unknown>)) return t as ReferenceValue;
    return '';
  });
  const [errors, setErrors] = useState<string[]>([]);
  const [name, setName] = useState<string>((init.name as string) || '');
  const [nameError, setNameError] = useState<string | null>(null);
  const isDisabled = !!readOnly || !!disabled;
  const namePlaceholder = getCanonicalToolName('sendSlackMessageTool') || 'send_slack_message';

  useEffect(() => {
    const errors: string[] = [];
    const bt = typeof bot_token === 'string' ? { value: bot_token, source: 'static' as const } : (bot_token as ReferenceValue);
    if ((bt.value || '').length === 0) errors.push('bot_token is required');
    if ((bt.source || 'static') === 'static' && bt.value && !bt.value.startsWith('xoxb-')) errors.push('bot_token must start with xoxb-');
    if ((bt.source || 'static') === 'vault' && bt.value && !isVaultRef(bt.value)) errors.push('bot_token vault ref must be mount/path/key');
    if (name.trim().length > 0 && !isValidToolName(name.trim())) errors.push('Name must match ^[a-z0-9_]{1,64}$');
    setErrors(errors);
    onValidate?.(errors);
  }, [bot_token, name, onValidate]);

  useEffect(() => {
    const token = typeof bot_token === 'string' ? { value: bot_token, source: 'static' as const } : (bot_token as ReferenceValue);
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

    const next = { ...value, bot_token: token, default_channel, name: nextName };
    if (JSON.stringify(value || {}) !== JSON.stringify(next)) onChange(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bot_token, default_channel, name]);

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
      <ReferenceField
        label="Bot token"
        value={bot_token}
        onChange={(v: ReferenceValue | string) => setBotToken(v)}
        readOnly={readOnly}
        disabled={disabled}
        placeholder="xoxb-... or mount/path/key"
        helpText="Use source=vault to reference a secret as mount/path/key."
      />
      {errors.length > 0 && <div className="text-[10px] text-red-600">{errors.join(', ')}</div>}
      <div>
        <label className="block text-xs mb-1">Default channel</label>
        <Input value={default_channel} onChange={(e: ChangeEvent<HTMLInputElement>) => setDefaultChannel(e.target.value)} disabled={isDisabled} placeholder="C123 or #general" />
      </div>
    </div>
  );
}
