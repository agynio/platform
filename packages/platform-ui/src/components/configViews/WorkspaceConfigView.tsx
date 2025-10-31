import { useEffect, useMemo, useState } from 'react';
import { Input } from '@agyn/ui';
import type { StaticConfigViewProps } from './types';
import ReferenceEnvField, { type EnvItem } from './shared/ReferenceEnvField';

export default function WorkspaceConfigView({ value, onChange, readOnly, disabled, onValidate }: StaticConfigViewProps) {
  const init = useMemo(() => ({ ...(value || {}) }), [value]);
  const [image, setImage] = useState<string>((init.image as string) || '');
  const [env, setEnv] = useState<EnvItem[]>((init.env as EnvItem[]) || []);
  const [initialScript, setInitialScript] = useState<string>((init.initialScript as string) || '');
  const [platform, setPlatform] = useState<string>((init.platform as string) || '');
  const [enableDinD, setEnableDinD] = useState<boolean>(!!init.enableDinD);
  const [ttlSeconds, setTtlSeconds] = useState<number>(typeof init.ttlSeconds === 'number' ? (init.ttlSeconds as number) : 86400);

  const isDisabled = !!readOnly || !!disabled;

  useEffect(() => {
    const errors: string[] = [];
    onValidate?.(errors);
  }, [image, onValidate]);

  useEffect(() => {
    const next = {
      ...value,
      image: image || undefined,
      env,
      initialScript: initialScript || undefined,
      platform: platform || undefined,
      enableDinD,
      ttlSeconds,
    };
    if (JSON.stringify(value || {}) !== JSON.stringify(next)) onChange(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [image, JSON.stringify(env), initialScript, platform, enableDinD, ttlSeconds]);

  return (
    <div className="space-y-3 text-sm">
      <div>
        <label htmlFor="image" className="block text-xs mb-1">Image</label>
        <Input id="image" value={image} onChange={(e) => setImage(e.target.value)} disabled={isDisabled} placeholder="e.g., alpine:3" />
      </div>
      <div>
        <div className="text-xs mb-1">Environment</div>
        <ReferenceEnvField value={env} onChange={setEnv} readOnly={readOnly} disabled={disabled} addLabel="Add env" onValidate={onValidate} />
      </div>
      <div>
        <label htmlFor="initialScript" className="block text-xs mb-1">Initial script (optional)</label>
        <textarea id="initialScript" className="w-full border rounded px-2 py-1 text-xs bg-background" rows={4} value={initialScript} onChange={(e) => setInitialScript(e.target.value)} disabled={isDisabled} />
      </div>
      <div>
        <label htmlFor="platform" className="block text-xs mb-1">Platform</label>
        <select id="platform" className="w-full border rounded px-2 py-1 text-xs bg-background" value={platform} onChange={(e) => setPlatform(e.target.value)} disabled={isDisabled}>
          <option value=""></option>
          <option value="linux/amd64">linux/amd64</option>
          <option value="linux/arm64">linux/arm64</option>
        </select>
      </div>
      <div className="flex items-center gap-2">
        <input id="enableDinD" type="checkbox" className="h-4 w-4" checked={enableDinD} onChange={(e) => setEnableDinD(e.target.checked)} disabled={isDisabled} />
        <label htmlFor="enableDinD" className="text-xs">Enable Docker-in-Docker sidecar</label>
      </div>
      <div>
        <label htmlFor="ttlSeconds" className="block text-xs mb-1">Workspace TTL (seconds)</label>
        <Input id="ttlSeconds" type="number" min={-1} value={ttlSeconds} onChange={(e) => setTtlSeconds(parseInt(e.target.value || '86400', 10))} disabled={isDisabled} />
      </div>
    </div>
  );
}
