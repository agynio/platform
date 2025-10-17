import { useEffect, useMemo, useState } from 'react';
import { Input } from '@hautech/ui';
import type { StaticConfigViewProps } from './types';

export default function McpServerStaticConfigView({ value, onChange, readOnly, disabled, onValidate }: StaticConfigViewProps) {
  const init = useMemo(() => ({ ...(value || {}) }), [value]);
  const [image, setImage] = useState<string>((init.image as string) || '');
  const [toolDiscoveryTimeoutMs, setToolDiscoveryTimeoutMs] = useState<number>(typeof init.toolDiscoveryTimeoutMs === 'number' ? (init.toolDiscoveryTimeoutMs as number) : 5000);
  const isDisabled = !!readOnly || !!disabled;

  useEffect(() => {
    const errors: string[] = [];
    if (!image) errors.push('image is required');
    onValidate?.(errors);
  }, [image, onValidate]);

  useEffect(() => {
    onChange({ ...value, image, toolDiscoveryTimeoutMs });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [image, toolDiscoveryTimeoutMs]);

  return (
    <div className="space-y-3 text-sm">
      <div>
        <label className="block text-xs mb-1">Image</label>
        <Input value={image} onChange={(e) => setImage(e.target.value)} disabled={isDisabled} />
      </div>
      <div>
        <label className="block text-xs mb-1">Tool discovery timeout (ms)</label>
        <Input type="number" min={1000} value={toolDiscoveryTimeoutMs} onChange={(e) => setToolDiscoveryTimeoutMs(parseInt(e.target.value || '1000', 10))} disabled={isDisabled} />
      </div>
    </div>
  );
}
