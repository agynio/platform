import { useCallback, useMemo } from 'react';

import { TriggerSection } from '../TriggerSection';
import type { NodePropertiesViewProps } from '../viewTypes';
import {
  encodeReferenceValue,
  inferReferenceSource,
  readReferenceValue,
  writeReferenceValue,
} from '../utils';
import type { ReferenceSourceType } from '../utils';

type TriggerNodeProps = NodePropertiesViewProps<'Trigger'>;

function TriggerNodeConfigContent({
  config,
  onConfigChange,
  secretSuggestions,
  variableSuggestions,
  ensureSecretKeys,
  ensureVariableKeys,
}: TriggerNodeProps) {
  const configRecord = config as Record<string, unknown>;
  const slackAppReference = useMemo(() => readReferenceValue(configRecord.app_token), [configRecord.app_token]);
  const slackAppSourceType = useMemo<ReferenceSourceType>(
    () => inferReferenceSource(slackAppReference.raw),
    [slackAppReference.raw],
  );
  const slackBotReference = useMemo(() => readReferenceValue(configRecord.bot_token), [configRecord.bot_token]);
  const slackBotSourceType = useMemo<ReferenceSourceType>(
    () => inferReferenceSource(slackBotReference.raw),
    [slackBotReference.raw],
  );

  const handleSlackAppValueChange = useCallback(
    (value: string) => {
      onConfigChange?.({ app_token: writeReferenceValue(slackAppReference.raw, value, slackAppSourceType) });
    },
    [onConfigChange, slackAppReference.raw, slackAppSourceType],
  );

  const handleSlackBotValueChange = useCallback(
    (value: string) => {
      onConfigChange?.({ bot_token: writeReferenceValue(slackBotReference.raw, value, slackBotSourceType) });
    },
    [onConfigChange, slackBotReference.raw, slackBotSourceType],
  );

  const handleSlackAppSourceChange = useCallback(
    (type: ReferenceSourceType) => {
      onConfigChange?.({ app_token: encodeReferenceValue(type, '', slackAppReference.raw) });
      if (type === 'secret') {
        void ensureSecretKeys?.();
      } else if (type === 'variable') {
        void ensureVariableKeys?.();
      }
    },
    [ensureSecretKeys, ensureVariableKeys, onConfigChange, slackAppReference.raw],
  );

  const handleSlackBotSourceChange = useCallback(
    (type: ReferenceSourceType) => {
      onConfigChange?.({ bot_token: encodeReferenceValue(type, '', slackBotReference.raw) });
      if (type === 'secret') {
        void ensureSecretKeys?.();
      } else if (type === 'variable') {
        void ensureVariableKeys?.();
      }
    },
    [ensureSecretKeys, ensureVariableKeys, onConfigChange, slackBotReference.raw],
  );

  const handleSlackAppFocus = useCallback(() => {
    if (slackAppSourceType === 'secret') {
      void ensureSecretKeys?.();
    } else if (slackAppSourceType === 'variable') {
      void ensureVariableKeys?.();
    }
  }, [ensureSecretKeys, ensureVariableKeys, slackAppSourceType]);

  const handleSlackBotFocus = useCallback(() => {
    if (slackBotSourceType === 'secret') {
      void ensureSecretKeys?.();
    } else if (slackBotSourceType === 'variable') {
      void ensureVariableKeys?.();
    }
  }, [ensureSecretKeys, ensureVariableKeys, slackBotSourceType]);

  return (
    <TriggerSection
      appToken={slackAppReference.value}
      appTokenSourceType={slackAppSourceType}
      botToken={slackBotReference.value}
      botTokenSourceType={slackBotSourceType}
      onAppTokenChange={handleSlackAppValueChange}
      onAppTokenSourceTypeChange={handleSlackAppSourceChange}
      onAppTokenFocus={handleSlackAppFocus}
      onBotTokenChange={handleSlackBotValueChange}
      onBotTokenSourceTypeChange={handleSlackBotSourceChange}
      onBotTokenFocus={handleSlackBotFocus}
      secretSuggestions={secretSuggestions}
      variableSuggestions={variableSuggestions}
    />
  );
}

export function TriggerNodeConfigView(props: NodePropertiesViewProps<'Trigger'>) {
  return <TriggerNodeConfigContent {...props} />;
}

export default TriggerNodeConfigView;
