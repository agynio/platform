import { useEffect, useMemo, useState } from 'react';
import { Input } from '@hautech/ui';
import type { StaticConfigViewProps } from './types';
import ReferenceEnvField, { type EnvItem } from './shared/ReferenceEnvField';

export default function ShellToolConfigView({ value, onChange, readOnly, disabled, onValidate }: StaticConfigViewProps) {
  const init = useMemo(() => ({ ...(value || {}) }), [value]);
  const [workdir, setWorkdir] = useState<string>((init.workdir as string) || (init.workingDir as string) || '/workspace');
  const [env, setEnv] = useState<EnvItem[]>((init.env as EnvItem[]) || []);
  const [executionTimeoutMs, setExecutionTimeoutMs] = useState<number>(
    typeof init.executionTimeoutMs === 'number' ? (init.executionTimeoutMs as number) : 60 * 60 * 1000,
  );
  const [idleTimeoutMs, setIdleTimeoutMs] = useState<number>(
    typeof init.idleTimeoutMs === 'number' ? (init.idleTimeoutMs as number) : 60 * 1000,
  );

  const isDisabled = !!readOnly || !!disabled;

  useEffect(() => {
    const errors: string[] = [];
    const inRange = (v: number) => v === 0 || (Number.isInteger(v) && v >= 1000 && v <= 86400000);
    if (!inRange(executionTimeoutMs)) errors.push('executionTimeoutMs must be 0 or 1000-86400000');
    if (!inRange(idleTimeoutMs)) errors.push('idleTimeoutMs must be 0 or 1000-86400000');
    onValidate?.(errors);
  }, [workdir, executionTimeoutMs, idleTimeoutMs, onValidate]);

  useEffect(() => {
    const next = { ...value, workdir, env, executionTimeoutMs, idleTimeoutMs };
    if (JSON.stringify(value || {}) !== JSON.stringify(next)) onChange(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workdir, JSON.stringify(env), executionTimeoutMs, idleTimeoutMs]);

  return (
    <div className="space-y-3 text-sm">
      <div>
        <label htmlFor="workdir" className="block text-xs mb-1">Working directory</label>
        <Input id="workdir" value={workdir} onChange={(e) => setWorkdir(e.target.value)} disabled={isDisabled} />
      </div>
      <div>
        <div className="text-xs mb-1">Environment</div>
        <ReferenceEnvField value={env} onChange={setEnv} readOnly={readOnly} disabled={disabled} addLabel="Add env" onValidate={onValidate} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label htmlFor="executionTimeoutMs" className="block text-xs mb-1">Execution timeout (ms)</label>
          <Input id="executionTimeoutMs" type="number" min={0} value={executionTimeoutMs} onChange={(e) => setExecutionTimeoutMs(parseInt(e.target.value || '0', 10))} disabled={isDisabled} />
        </div>
        <div>
          <label htmlFor="idleTimeoutMs" className="block text-xs mb-1">Idle timeout (ms)</label>
          <Input id="idleTimeoutMs" type="number" min={0} value={idleTimeoutMs} onChange={(e) => setIdleTimeoutMs(parseInt(e.target.value || '0', 10))} disabled={isDisabled} />
        </div>
      </div>
    </div>
  );
}
