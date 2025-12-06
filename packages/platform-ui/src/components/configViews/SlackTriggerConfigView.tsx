import { useEffect, useMemo, useState } from 'react';
import type { ReferenceConfigValue } from '@/components/nodeProperties/types';
import { deepEqual } from '@/lib/utils';
import type { StaticConfigViewProps } from './types';
import ReferenceField from './shared/ReferenceField';
import { normalizeReferenceValue, readReferenceDetails } from './shared/referenceUtils';
import { useSecretKeyOptions } from './shared/useSecretKeyOptions';
import { useVariableKeyOptions } from './shared/useVariableKeyOptions';

function isVaultRef(v: string) {
  // Expect mount/path/key
  return /^(?:[^/]+)\/(?:[^/]+)\/(?:[^/]+)$/.test(v || '');
}

export default function SlackTriggerConfigView({ value, onChange, readOnly, disabled, onValidate }: StaticConfigViewProps) {
  const appTokenRaw = value['app_token'];
  const botTokenRaw = value['bot_token'];
  const secretKeys = useSecretKeyOptions();
  const variableKeys = useVariableKeyOptions();

  const normalizedAppToken = useMemo(() => normalizeReferenceValue(appTokenRaw), [appTokenRaw]);
  const normalizedBotToken = useMemo(() => normalizeReferenceValue(botTokenRaw), [botTokenRaw]);

  const [appToken, setAppToken] = useState<ReferenceConfigValue>(normalizedAppToken);
  const [botToken, setBotToken] = useState<ReferenceConfigValue>(normalizedBotToken);

  useEffect(() => {
    setAppToken(normalizedAppToken);
  }, [normalizedAppToken]);

  useEffect(() => {
    setBotToken(normalizedBotToken);
  }, [normalizedBotToken]);

  const appDetails = useMemo(() => readReferenceDetails(appToken), [appToken]);
  const botDetails = useMemo(() => readReferenceDetails(botToken), [botToken]);

  useEffect(() => {
    const errors: string[] = [];
    const trimmedApp = appDetails.value.trim();
    const trimmedBot = botDetails.value.trim();

    if (!trimmedApp.length) errors.push('app_token is required');
    if (appDetails.sourceType === 'text' && trimmedApp && !trimmedApp.startsWith('xapp-')) errors.push('app_token must start with xapp-');
    if (appDetails.sourceType === 'secret' && trimmedApp && !isVaultRef(trimmedApp)) errors.push('app_token vault ref must be mount/path/key');
    if (appDetails.sourceType === 'variable' && !trimmedApp.length) errors.push('app_token variable name is required');

    if (!trimmedBot.length) errors.push('bot_token is required');
    if (botDetails.sourceType === 'text' && trimmedBot && !trimmedBot.startsWith('xoxb-')) errors.push('bot_token must start with xoxb-');
    if (botDetails.sourceType === 'secret' && trimmedBot && !isVaultRef(trimmedBot)) errors.push('bot_token vault ref must be mount/path/key');
    if (botDetails.sourceType === 'variable' && !trimmedBot.length) errors.push('bot_token variable name is required');
    onValidate?.(errors);
  }, [appDetails.value, appDetails.sourceType, botDetails.value, botDetails.sourceType, onValidate]);

  useEffect(() => {
    const currentApp = value['app_token'];
    const currentBot = value['bot_token'];
    if (deepEqual(currentApp, appToken) && deepEqual(currentBot, botToken)) return;
    onChange({ ...value, app_token: appToken, bot_token: botToken });
  }, [appToken, botToken, onChange, value]);

  return (
    <div className="space-y-3 text-sm">
      <ReferenceField
        label="App token"
        value={appToken}
        onChange={setAppToken}
        readOnly={readOnly}
        disabled={disabled}
        secretKeys={secretKeys}
        variableKeys={variableKeys}
        helpText="Use source=vault to reference a secret as mount/path/key. Must start with xapp- for static."
      />
      <ReferenceField
        label="Bot token"
        value={botToken}
        onChange={setBotToken}
        readOnly={readOnly}
        disabled={disabled}
        secretKeys={secretKeys}
        variableKeys={variableKeys}
        helpText="Use source=vault to reference a secret as mount/path/key. Must start with xoxb- for static."
      />
    </div>
  );
}
