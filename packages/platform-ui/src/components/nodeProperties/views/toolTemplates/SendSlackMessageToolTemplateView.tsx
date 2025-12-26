import { useCallback, useMemo } from 'react';

import { ReferenceInput } from '../../../ReferenceInput';
import { FieldLabel } from '../../FieldLabel';
import type { NodePropertiesViewProps } from '../../viewTypes';
import {
  encodeReferenceValue,
  inferReferenceSource,
  readReferenceValue,
  writeReferenceValue,
} from '../../utils';
import type { ReferenceSourceType } from '../../utils';

import ToolNameField from './ToolNameField';
import { useToolNameField } from './useToolNameField';
import { Textarea } from '../../../Textarea';

export function SendSlackMessageToolTemplateView(props: NodePropertiesViewProps<'Tool'>) {
  const { config, onConfigChange, secretSuggestions, variableSuggestions, ensureSecretKeys, ensureVariableKeys } = props;

  const configRecord = config as Record<string, unknown>;
  const nameField = useToolNameField(props);

  const botTokenReference = useMemo(() => readReferenceValue(configRecord.bot_token), [configRecord.bot_token]);
  const botTokenSourceType = useMemo<ReferenceSourceType>(
    () => inferReferenceSource(botTokenReference.raw),
    [botTokenReference.raw],
  );

  const promptValue = typeof configRecord.prompt === 'string' ? (configRecord.prompt as string) : '';

  const handleBotTokenChange = useCallback(
    (value: string) => {
      onConfigChange?.({ bot_token: writeReferenceValue(botTokenReference.raw, value, botTokenSourceType) });
    },
    [botTokenReference.raw, botTokenSourceType, onConfigChange],
  );

  const handleBotTokenSourceChange = useCallback(
    (type: ReferenceSourceType) => {
      onConfigChange?.({ bot_token: encodeReferenceValue(type, '', botTokenReference.raw) });
      if (type === 'secret') {
        void ensureSecretKeys?.();
      } else if (type === 'variable') {
        void ensureVariableKeys?.();
      }
    },
    [botTokenReference.raw, ensureSecretKeys, ensureVariableKeys, onConfigChange],
  );

  const handleBotTokenFocus = useCallback(() => {
    if (botTokenSourceType === 'secret') {
      void ensureSecretKeys?.();
    } else if (botTokenSourceType === 'variable') {
      void ensureVariableKeys?.();
    }
  }, [botTokenSourceType, ensureSecretKeys, ensureVariableKeys]);

  const handlePromptChange = useCallback(
    (value: string) => {
      const trimmed = value.trim();
      onConfigChange?.({ prompt: trimmed.length > 0 ? trimmed : undefined });
    },
    [onConfigChange],
  );

  return (
    <>
      <ToolNameField {...nameField} />

      <section className="space-y-2">
        <FieldLabel label="Prompt" hint="Optional prompt metadata shared with the parent agent." />
        <Textarea
          rows={3}
          placeholder="Describe when to use this Slack tool..."
          value={promptValue}
          onChange={(event) => handlePromptChange(event.target.value)}
          maxLength={8192}
          className="min-h-[96px]"
        />
      </section>

      <section className="space-y-2">
        <FieldLabel label="Slack Bot Token" hint="Provide a bot token or reference (must start with xoxb-)." />
        <ReferenceInput
          size="sm"
          value={botTokenReference.value}
          onChange={(event) => handleBotTokenChange(event.target.value)}
          sourceType={botTokenSourceType}
          onSourceTypeChange={(type) => handleBotTokenSourceChange(type as ReferenceSourceType)}
          onFocus={handleBotTokenFocus}
          secretKeys={secretSuggestions}
          variableKeys={variableSuggestions}
          placeholder="xoxb-..."
        />
      </section>
    </>
  );
}

export default SendSlackMessageToolTemplateView;
