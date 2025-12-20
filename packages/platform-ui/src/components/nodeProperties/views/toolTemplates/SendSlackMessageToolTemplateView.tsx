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

export function SendSlackMessageToolTemplateView(props: NodePropertiesViewProps<'Tool'>) {
  const { config, onConfigChange, secretSuggestions, variableSuggestions, ensureSecretKeys, ensureVariableKeys } = props;

  const configRecord = config as Record<string, unknown>;
  const nameField = useToolNameField(props);

  const botTokenReference = useMemo(() => readReferenceValue(configRecord.bot_token), [configRecord.bot_token]);
  const botTokenSourceType = useMemo<ReferenceSourceType>(
    () => inferReferenceSource(botTokenReference.raw),
    [botTokenReference.raw],
  );

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

  return (
    <>
      <ToolNameField {...nameField} />

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
