import { FieldLabel } from './FieldLabel';
import { ReferenceInput } from '../ReferenceInput';

interface TriggerSectionProps {
  appToken: string;
  botToken: string;
  onAppTokenChange: (value: string) => void;
  onAppTokenFocus: () => void;
  onBotTokenChange: (value: string) => void;
  onBotTokenFocus: () => void;
  secretSuggestions: string[];
}

export function TriggerSection({
  appToken,
  botToken,
  onAppTokenChange,
  onAppTokenFocus,
  onBotTokenChange,
  onBotTokenFocus,
  secretSuggestions,
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
            sourceType="secret"
            secretKeys={secretSuggestions}
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
            sourceType="secret"
            secretKeys={secretSuggestions}
            placeholder="Select or enter bot token..."
            size="sm"
          />
        </div>
      </div>
    </section>
  );
}
