import { useEffect, useMemo, useState } from 'react';
import { Input } from '@hautech/ui';
import type { StaticConfigViewProps } from './types';

export default function MemoryServiceConfigView({ value, onChange, readOnly, disabled }: StaticConfigViewProps) {
  const init = useMemo(() => ({ ...(value || {}) }), [value]);
  const [scope, setScope] = useState<string>((init.scope as string) || 'global');
  const [collectionPrefix, setCollectionPrefix] = useState<string>((init.collectionPrefix as string) || '');
  const [title, setTitle] = useState<string>((init.title as string) || '');
  const isDisabled = !!readOnly || !!disabled;

  useEffect(() => {
    onChange({ ...value, scope, collectionPrefix: collectionPrefix || undefined, title: title || undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, collectionPrefix, title]);

  return (
    <div className="space-y-3 text-sm">
      <div>
        <label className="block text-xs mb-1">Scope</label>
        <select className="w-full border rounded px-2 py-1" value={scope} onChange={(e) => setScope(e.target.value)} disabled={isDisabled}>
          <option value="global">global</option>
          <option value="thread">thread</option>
        </select>
      </div>
      <div>
        <label className="block text-xs mb-1">Collection prefix (optional)</label>
        <Input value={collectionPrefix} onChange={(e) => setCollectionPrefix(e.target.value)} disabled={isDisabled} />
      </div>
      <div>
        <label className="block text-xs mb-1">Title (optional)</label>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} disabled={isDisabled} />
      </div>
    </div>
  );
}
