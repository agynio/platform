import { FieldLabel } from './FieldLabel';
import { ReferenceInput } from '../ReferenceInput';
import type { ReferenceSourceType } from './utils';

interface TriggerSectionProps {
  appToken: string;
  appTokenSourceType: ReferenceSourceType;
  botToken: string;
  botTokenSourceType: ReferenceSourceType;
  onAppTokenChange: (value: string) => void;
  onAppTokenSourceTypeChange: (type: ReferenceSourceType) => void;
  onAppTokenFocus: () => void;
  onBotTokenChange: (value: string) => void;
  onBotTokenSourceTypeChange: (type: ReferenceSourceType) => void;
  onBotTokenFocus: () => void;
  secretSuggestions: string[];
  variableSuggestions: string[];
}

export function TriggerSection({
  appToken,
  appTokenSourceType,
  botToken,
  botTokenSourceType,
  onAppTokenChange,
  onAppTokenSourceTypeChange,
  onAppTokenFocus,
  onBotTokenChange,
  onBotTokenSourceTypeChange,
  onBotTokenFocus,
  secretSuggestions,
  variableSuggestions,
}: TriggerSectionProps) {
  return (
    <section>
      <h3 className="text-[var(--agyn-dark)] mb-4 font-semibold">Slack Configuration</h3>
      <div className="space-y-4">
        <div>
          <FieldLabel label="App Token" hint="Slack App-Level token for connecting to the Events API" required />
          <ReferenceInput
            value={appToken}
            onChange={(event) => onAppTokenChange(event.target.value)}
            onFocus={onAppTokenFocus}
            sourceType={appTokenSourceType}
            onSourceTypeChange={onAppTokenSourceTypeChange}
            secretKeys={secretSuggestions}
            variableKeys={variableSuggestions}
            placeholder="Select or enter app token..."
            size="sm"
          />
        </div>
        <div>
          <FieldLabel label="Bot Token" hint="Slack Bot User OAuth token for authentication" required />
          <ReferenceInput
            value={botToken}
            onChange={(event) => onBotTokenChange(event.target.value)}
            onFocus={onBotTokenFocus}
            sourceType={botTokenSourceType}
            onSourceTypeChange={onBotTokenSourceTypeChange}
            secretKeys={secretSuggestions}
            variableKeys={variableSuggestions}
            placeholder="Select or enter bot token..."
            size="sm"
          />
        </div>
      </div>
    </section>
  );
}
