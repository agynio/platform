import { useEffect, useMemo, useState } from 'react';
import { Input } from '@hautech/ui';
import type { StaticConfigViewProps } from './types';

export default function SendSlackMessageToolConfigView({ value, onChange, readOnly, disabled, onValidate }: StaticConfigViewProps) {
  const init = useMemo(() => ({ ...(value || {}) }), [value]);
  const [default_channel, setDefaultChannel] = useState<string>((init.default_channel as string) || '');
  const [bot_token, setBotToken] = useState<string>((init.bot_token as string) || '');
  const isDisabled = !!readOnly || !!disabled;

  useEffect(() => {
    const errors: string[] = [];
    if (!bot_token) errors.push('bot_token is required');
    onValidate?.(errors);
  }, [bot_token, onValidate]);

  useEffect(() => {
    onChange({ ...value, bot_token, default_channel });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bot_token, default_channel]);

  return (
    <div className="space-y-3 text-sm">
      <div>
        <label className="block text-xs mb-1">Bot token</label>
        <Input value={bot_token} onChange={(e) => setBotToken(e.target.value)} disabled={isDisabled} placeholder="xoxb-... or vault ref" />
      </div>
      <div>
        <label className="block text-xs mb-1">Default channel</label>
        <Input value={default_channel} onChange={(e) => setDefaultChannel(e.target.value)} disabled={isDisabled} placeholder="C123 or #general" />
      </div>
    </div>
  );
}
