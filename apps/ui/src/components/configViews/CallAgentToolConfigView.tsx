import { useEffect, useMemo, useState } from 'react';
import { Input } from '@hautech/ui';
import type { StaticConfigViewProps } from './types';

export default function CallAgentToolConfigView({ value, onChange, readOnly, disabled, onValidate }: StaticConfigViewProps) {
  const init = useMemo(() => ({ ...(value || {}) }), [value]);
  const [target_agent, setTargetAgent] = useState<string>((init.target_agent as string) || '');
  const isDisabled = !!readOnly || !!disabled;

  useEffect(() => {
    const errors: string[] = [];
    if (!target_agent) errors.push('target_agent is required');
    onValidate?.(errors);
  }, [target_agent, onValidate]);

  useEffect(() => {
    onChange({ ...value, target_agent });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target_agent]);

  return (
    <div className="space-y-3 text-sm">
      <div>
        <label className="block text-xs mb-1">Target agent</label>
        <Input value={target_agent} onChange={(e) => setTargetAgent(e.target.value)} disabled={isDisabled} placeholder="agent node id or ref" />
      </div>
    </div>
  );
}
