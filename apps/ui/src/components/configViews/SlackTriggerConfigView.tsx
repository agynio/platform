import { useEffect, useMemo, useState } from 'react';
import { Input } from '@hautech/ui';
import type { StaticConfigViewProps } from './types';

export default function SlackTriggerConfigView({ value, onChange, readOnly, disabled, onValidate }: StaticConfigViewProps) {
  const init = useMemo(() => ({ ...(value || {}) }), [value]);
  const [app_token, setAppToken] = useState<string>((init.app_token as string) || '');
  const [bot_token, setBotToken] = useState<string>((init.bot_token as string) || '');
  const [default_channel, setDefaultChannel] = useState<string>((init.default_channel as string) || '');
  const isDisabled = !!readOnly || !!disabled;

  useEffect(() => {
    const errors: string[] = [];
    if (!app_token) errors.push('app_token is required');
    if (!bot_token) errors.push('bot_token is required');
    onValidate?.(errors);
  }, [app_token, bot_token, onValidate]);

  useEffect(() => {
    onChange({ ...value, app_token, bot_token, default_channel });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app_token, bot_token, default_channel]);

  return (
    <div className="space-y-3 text-sm">
      <div>
        <label className="block text-xs mb-1">App token</label>
        <Input value={app_token} onChange={(e) => setAppToken(e.target.value)} disabled={isDisabled} placeholder="xapp-... or vault ref" />
      </div>
      <div>
        <label className="block text-xs mb-1">Bot token</label>
        <Input value={bot_token} onChange={(e) => setBotToken(e.target.value)} disabled={isDisabled} placeholder="xoxb-... or vault ref" />
      </div>
      <div>
        <label className="block text-xs mb-1">Default channel</label>
        <Input value={default_channel} onChange={(e) => setDefaultChannel(e.target.value)} disabled={isDisabled} placeholder="#general or C123" />
      </div>
    </div>
  );
}
