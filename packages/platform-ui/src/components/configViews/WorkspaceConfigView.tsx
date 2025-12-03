import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { Input } from '@agyn/ui';
import type { EnvVar } from '@/components/nodeProperties/types';
import { readEnvList, serializeEnvVars } from '@/components/nodeProperties/utils';
import type { StaticConfigViewProps } from './types';
import ReferenceEnvField from './shared/ReferenceEnvField';

type VolumesFormState = {
  enabled: boolean;
  mountPath: string;
};

const DEFAULT_VOLUMES: VolumesFormState = { enabled: false, mountPath: '/workspace' };

const parseVolumesConfig = (raw: unknown): VolumesFormState => {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_VOLUMES };
  const candidate = raw as { enabled?: unknown; mountPath?: unknown };
  const enabled = typeof candidate.enabled === 'boolean' ? candidate.enabled : DEFAULT_VOLUMES.enabled;
  const mountPathCandidate =
    typeof candidate.mountPath === 'string' && candidate.mountPath.trim().length > 0
      ? candidate.mountPath
      : DEFAULT_VOLUMES.mountPath;
  return { enabled, mountPath: mountPathCandidate };
};

export default function WorkspaceConfigView({ value, onChange, readOnly, disabled, onValidate }: StaticConfigViewProps) {
  const init = useMemo<Record<string, unknown>>(() => ({ ...(value || {}) }), [value]);
  const [image, setImage] = useState<string>((init.image as string) || '');
  const [env, setEnv] = useState<EnvVar[]>(() => readEnvList(init.env));
  const [initialScript, setInitialScript] = useState<string>((init.initialScript as string) || '');
  const [cpuLimit, setCpuLimit] = useState<string>(() => {
    const raw = init.cpu_limit as unknown;
    return typeof raw === 'number' || typeof raw === 'string' ? String(raw) : '';
  });
  const [memoryLimit, setMemoryLimit] = useState<string>(() => {
    const raw = init.memory_limit as unknown;
    return typeof raw === 'number' || typeof raw === 'string' ? String(raw) : '';
  });
  const [platform, setPlatform] = useState<string>((init.platform as string) || '');
  const [enableDinD, setEnableDinD] = useState<boolean>(!!init.enableDinD);
  const [ttlSeconds, setTtlSeconds] = useState<number>(typeof init.ttlSeconds === 'number' ? (init.ttlSeconds as number) : 86400);
  const initialVolumes = parseVolumesConfig(init.volumes);
  const [volumesEnabled, setVolumesEnabled] = useState<boolean>(initialVolumes.enabled);
  const [mountPath, setMountPath] = useState<string>(initialVolumes.mountPath);

  const mountPathError = useMemo(() => {
    if (!volumesEnabled) return '';
    const trimmed = mountPath.trim();
    if (!trimmed) return 'Mount path is required when volumes are enabled.';
    if (!trimmed.startsWith('/')) return 'Mount path must be absolute.';
    return '';
  }, [volumesEnabled, mountPath]);

  const isDisabled = !!readOnly || !!disabled;

  useEffect(() => {
    const errors: string[] = [];
    if (mountPathError) errors.push(mountPathError);
    onValidate?.(errors);
  }, [image, mountPathError, onValidate]);

  useEffect(() => {
    setEnv(readEnvList(init.env));
  }, [init]);

  useEffect(() => {
    const normalizedMountPath = mountPath.trim() || '/workspace';
    const nextVolumes = { enabled: volumesEnabled, mountPath: normalizedMountPath };
    const parseLimitValue = (raw: string): number | string | undefined => {
      const trimmed = raw.trim();
      if (!trimmed) return undefined;
      return /^-?\d+(?:\.\d+)?$/.test(trimmed) ? Number(trimmed) : trimmed;
    };
    const cpuParsed = parseLimitValue(cpuLimit);
    const memoryParsed = parseLimitValue(memoryLimit);
    const next = {
      ...value,
      image: image || undefined,
      env: serializeEnvVars(env),
      initialScript: initialScript || undefined,
      cpu_limit: cpuParsed ?? undefined,
      memory_limit: memoryParsed ?? undefined,
      platform: platform || undefined,
      enableDinD,
      ttlSeconds,
      volumes: nextVolumes,
    };
    if (JSON.stringify(value || {}) !== JSON.stringify(next)) onChange(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [image, JSON.stringify(env), initialScript, cpuLimit, memoryLimit, platform, enableDinD, ttlSeconds, volumesEnabled, mountPath]);

  return (
    <div className="space-y-3 text-sm">
      <div>
        <label htmlFor="image" className="block text-xs mb-1">Image</label>
        <Input id="image" value={image} onChange={(e: ChangeEvent<HTMLInputElement>) => setImage(e.target.value)} disabled={isDisabled} placeholder="e.g., alpine:3" />
      </div>
      <div>
        <div className="text-xs mb-1">Environment</div>
        <ReferenceEnvField value={env} onChange={(next) => setEnv(next)} readOnly={readOnly} disabled={disabled} addLabel="Add env" onValidate={onValidate} />
      </div>
      <div>
        <label htmlFor="initialScript" className="block text-xs mb-1">Initial script (optional)</label>
        <textarea id="initialScript" className="w-full border rounded px-2 py-1 text-xs bg-background" rows={4} value={initialScript} onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setInitialScript(e.target.value)} disabled={isDisabled} />
      </div>
      <div>
        <label htmlFor="platform" className="block text-xs mb-1">Platform</label>
        <select id="platform" className="w-full border rounded px-2 py-1 text-xs bg-background" value={platform} onChange={(e: ChangeEvent<HTMLSelectElement>) => setPlatform(e.target.value)} disabled={isDisabled}>
          <option value=""></option>
          <option value="linux/amd64">linux/amd64</option>
          <option value="linux/arm64">linux/arm64</option>
        </select>
      </div>
      <div>
        <label htmlFor="cpuLimit" className="block text-xs mb-1">CPU limit</label>
        <Input id="cpuLimit" value={cpuLimit} onChange={(e: ChangeEvent<HTMLInputElement>) => setCpuLimit(e.target.value)} disabled={isDisabled} placeholder="0.5 or 500m" />
      </div>
      <div>
        <label htmlFor="memoryLimit" className="block text-xs mb-1">Memory limit</label>
        <Input id="memoryLimit" value={memoryLimit} onChange={(e: ChangeEvent<HTMLInputElement>) => setMemoryLimit(e.target.value)} disabled={isDisabled} placeholder="512Mi or 1Gi" />
      </div>
      <div className="flex items-center gap-2">
        <input id="enableDinD" type="checkbox" className="h-4 w-4" checked={enableDinD} onChange={(e: ChangeEvent<HTMLInputElement>) => setEnableDinD(e.target.checked)} disabled={isDisabled} />
        <label htmlFor="enableDinD" className="text-xs">Enable Docker-in-Docker sidecar</label>
      </div>
      <div className="space-y-2 rounded border px-3 py-2">
        <div className="flex items-center gap-2">
          <input
            id="enableVolumes"
            type="checkbox"
            className="h-4 w-4"
            checked={volumesEnabled}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setVolumesEnabled(e.target.checked)}
            disabled={isDisabled}
          />
          <label htmlFor="enableVolumes" className="text-xs">Enable persistent workspace volume</label>
        </div>
        <div>
          <label htmlFor="mountPath" className="block text-xs mb-1">Mount path</label>
          <Input
            id="mountPath"
            value={mountPath}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setMountPath(e.target.value)}
            disabled={isDisabled || !volumesEnabled}
            aria-invalid={volumesEnabled && !!mountPathError}
            placeholder="/workspace"
          />
          {volumesEnabled && mountPathError && (
            <p className="text-xs text-red-600 mt-1" role="alert">{mountPathError}</p>
          )}
        </div>
      </div>
      <div>
        <label htmlFor="ttlSeconds" className="block text-xs mb-1">Workspace TTL (seconds)</label>
        <Input id="ttlSeconds" type="number" min={-1} value={ttlSeconds} onChange={(e: ChangeEvent<HTMLInputElement>) => setTtlSeconds(parseInt(e.target.value || '86400', 10))} disabled={isDisabled} />
      </div>
    </div>
  );
}
