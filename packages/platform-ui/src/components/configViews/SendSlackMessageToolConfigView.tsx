import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { Input } from '@/components/ui/input';
import { getCanonicalToolName } from '@/components/nodeProperties/toolCanonicalNames';
import { isValidToolName } from '@/components/nodeProperties/utils';
import type { ReferenceConfigValue } from '@/components/nodeProperties/types';
import { deepEqual } from '@/lib/utils';
import type { StaticConfigViewProps } from './types';
import ReferenceField from './shared/ReferenceField';
import { ToolNameLabel } from './shared/ToolNameLabel';
import { normalizeReferenceValue, readReferenceDetails } from './shared/referenceUtils';
import { useSecretKeyOptions } from './shared/useSecretKeyOptions';
import { useVariableKeyOptions } from './shared/useVariableKeyOptions';

function isVaultRef(v: string) {
  // Expect mount/path/key
  return /^(?:[^/]+)\/(?:[^/]+)\/(?:[^/]+)$/.test(v || '');
}

export default function SendSlackMessageToolConfigView({ value, onChange, readOnly, disabled, onValidate }: StaticConfigViewProps) {
  const defaultChannelRaw = value['default_channel'];
  const botTokenRaw = value['bot_token'];
  const rawName = value['name'];
  const secretKeys = useSecretKeyOptions();
  const variableKeys = useVariableKeyOptions();
  const currentDefaultChannel = typeof defaultChannelRaw === 'string' ? defaultChannelRaw : '';
  const currentBotToken = botTokenRaw;
  const currentName = typeof rawName === 'string' ? rawName : undefined;

  const [default_channel, setDefaultChannel] = useState<string>(currentDefaultChannel);
  const normalizedBotToken = useMemo(() => normalizeReferenceValue(botTokenRaw), [botTokenRaw]);
  const [bot_token, setBotToken] = useState<ReferenceConfigValue>(normalizedBotToken);
  const [errors, setErrors] = useState<string[]>([]);
  const [name, setName] = useState<string>(currentName ?? '');
  const [nameError, setNameError] = useState<string | null>(null);
  const isDisabled = !!readOnly || !!disabled;
  const namePlaceholder = getCanonicalToolName('sendSlackMessageTool') || 'send_slack_message';

  useEffect(() => {
    setDefaultChannel(currentDefaultChannel);
  }, [currentDefaultChannel]);

  useEffect(() => {
    setBotToken(normalizedBotToken);
  }, [normalizedBotToken]);

  useEffect(() => {
    setName(currentName ?? '');
  }, [currentName]);

  const botDetails = useMemo(() => readReferenceDetails(bot_token), [bot_token]);

  useEffect(() => {
    const errors: string[] = [];
    const trimmedToken = botDetails.value.trim();
    if (!trimmedToken.length) errors.push('bot_token is required');
    if (botDetails.sourceType === 'text' && trimmedToken && !trimmedToken.startsWith('xoxb-')) errors.push('bot_token must start with xoxb-');
    if (botDetails.sourceType === 'secret' && trimmedToken && !isVaultRef(trimmedToken)) errors.push('bot_token vault ref must be mount/path/key');
    if (botDetails.sourceType === 'variable' && !trimmedToken.length) errors.push('bot_token variable name is required');
    if (name.trim().length > 0 && !isValidToolName(name.trim())) errors.push('Name must match ^[a-z0-9_]{1,64}$');
    setErrors(errors);
    onValidate?.(errors);
  }, [botDetails.value, botDetails.sourceType, name, onValidate]);

  useEffect(() => {
    const trimmed = name.trim();
    if (!trimmed.length) {
      setNameError(null);
      return;
    }
    setNameError(isValidToolName(trimmed) ? null : 'Name must match ^[a-z0-9_]{1,64}$');
  }, [name]);

  useEffect(() => {
    const trimmed = name.trim();
    let nextName: string | undefined;
    if (trimmed.length === 0) {
      nextName = undefined;
    } else if (isValidToolName(trimmed)) {
      nextName = trimmed;
    } else {
      nextName = currentName;
    }

    if (deepEqual(currentBotToken, bot_token) && currentDefaultChannel === default_channel && currentName === nextName) {
      return;
    }

    onChange({ ...value, bot_token, default_channel, name: nextName });
  }, [bot_token, currentBotToken, default_channel, currentDefaultChannel, name, currentName, onChange, value]);

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
        onChange={setBotToken}
        readOnly={readOnly}
        disabled={disabled}
        secretKeys={secretKeys}
        variableKeys={variableKeys}
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
