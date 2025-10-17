import { useEffect, useMemo, useState } from 'react';
import { Input } from '@hautech/ui';
import type { StaticConfigViewProps } from './types';

export default function MemoryServiceConfigView({ value, onChange, readOnly, disabled }: StaticConfigViewProps) {
  const init = useMemo(() => ({ ...(value || {}) }), [value]);
  const [connection, setConnection] = useState<string>((init.connection as string) || 'mongodb://localhost:27017/agents');
  const isDisabled = !!readOnly || !!disabled;

  useEffect(() => {
    onChange({ ...value, connection });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection]);

  return (
    <div className="space-y-3 text-sm">
      <div>
        <label className="block text-xs mb-1">Connection URI</label>
        <Input value={connection} onChange={(e) => setConnection(e.target.value)} disabled={isDisabled} />
      </div>
    </div>
  );
}
