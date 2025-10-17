import { useEffect, useMemo, useState } from 'react';
import { Input } from '@hautech/ui';
import type { StaticConfigViewProps } from './types';

export default function FinishToolConfigView({ value, onChange, readOnly, disabled }: StaticConfigViewProps) {
  const init = useMemo(() => ({ ...(value || {}) }), [value]);
  const [note, setNote] = useState<string>((init.note as string) || '');
  const isDisabled = !!readOnly || !!disabled;

  useEffect(() => {
    onChange({ ...value, note });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note]);

  return (
    <div className="space-y-3 text-sm">
      <div>
        <label className="block text-xs mb-1">Note (optional)</label>
        <Input value={note} onChange={(e) => setNote(e.target.value)} disabled={isDisabled} />
      </div>
    </div>
  );
}
