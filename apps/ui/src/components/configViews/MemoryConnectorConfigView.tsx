import { useEffect, useMemo, useState } from 'react';
import { Input } from '@hautech/ui';
import type { StaticConfigViewProps } from './types';

export default function MemoryConnectorConfigView({ value, onChange, readOnly, disabled }: StaticConfigViewProps) {
  const init = useMemo(() => ({ ...(value || {}) }), [value]);
  const [placement, setPlacement] = useState<string>((init.placement as string) || 'after_system');
  const [content, setContent] = useState<string>((init.content as string) || 'tree');
  const [maxChars, setMaxChars] = useState<number>(typeof init.maxChars === 'number' ? (init.maxChars as number) : 4000);
  const isDisabled = !!readOnly || !!disabled;

  useEffect(() => {
    onChange({ ...value, placement, content, maxChars });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placement, content, maxChars]);

  return (
    <div className="space-y-3 text-sm">
      <div>
        <label className="block text-xs mb-1">Placement</label>
        <select className="w-full border rounded px-2 py-1" value={placement} onChange={(e) => setPlacement(e.target.value)} disabled={isDisabled}>
          {['after_system', 'last_message'].map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs mb-1">Content</label>
        <select className="w-full border rounded px-2 py-1" value={content} onChange={(e) => setContent(e.target.value)} disabled={isDisabled}>
          {['full', 'tree'].map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs mb-1">Max chars</label>
        <Input type="number" min={1} max={20000} value={maxChars} onChange={(e) => setMaxChars(parseInt(e.target.value || '1', 10))} disabled={isDisabled} />
      </div>
    </div>
  );
}
