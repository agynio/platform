import { useEffect, useMemo, useState } from 'react';
import { Input } from '@hautech/ui';
import type { StaticConfigViewProps } from './types';

export default function RemindMeToolConfigView({ value, onChange, readOnly, disabled }: StaticConfigViewProps) {
  const init = useMemo(() => ({ ...(value || {}) }), [value]);
  const [maxActive, setMaxActive] = useState<number>(typeof init.maxActive === 'number' ? (init.maxActive as number) : 3);
  const isDisabled = !!readOnly || !!disabled;

  useEffect(() => {
    onChange({ ...value, maxActive });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maxActive]);

  return (
    <div className="space-y-3 text-sm">
      <div>
        <label className="block text-xs mb-1">Max active reminders</label>
        <Input type="number" min={1} value={maxActive} onChange={(e) => setMaxActive(parseInt(e.target.value || '1', 10))} disabled={isDisabled} />
      </div>
    </div>
  );
}
