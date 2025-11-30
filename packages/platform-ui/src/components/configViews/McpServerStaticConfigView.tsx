import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { Input } from '@agyn/ui';
import type { EnvVar } from '@/components/nodeProperties/types';
import { readEnvList, serializeEnvVars } from '@/components/nodeProperties/utils';
import type { StaticConfigViewProps } from './types';
import ReferenceEnvField from './shared/ReferenceEnvField';

export default function McpServerStaticConfigView({ value, onChange, readOnly, disabled, onValidate }: StaticConfigViewProps) {
  const init = useMemo(() => ({ ...(value || {}) }), [value]);
  const [title, setTitle] = useState<string>((init.title as string) || '');
  const [namespace, setNamespace] = useState<string>((init.namespace as string) || 'mcp');
  const [command, setCommand] = useState<string>((init.command as string) || '');
  const [workdir, setWorkdir] = useState<string>((init.workdir as string) || '');
  const [env, setEnv] = useState<EnvVar[]>(() => readEnvList(init.env));
  const [requestTimeoutMs, setRequestTimeoutMs] = useState<number>(typeof init.requestTimeoutMs === 'number' ? (init.requestTimeoutMs as number) : 15000);
  const [startupTimeoutMs, setStartupTimeoutMs] = useState<number>(typeof init.startupTimeoutMs === 'number' ? (init.startupTimeoutMs as number) : 15000);
  const [heartbeatIntervalMs, setHeartbeatIntervalMs] = useState<number>(typeof init.heartbeatIntervalMs === 'number' ? (init.heartbeatIntervalMs as number) : 300000);
  const [staleTimeoutMs, setStaleTimeoutMs] = useState<number>(typeof init.staleTimeoutMs === 'number' ? (init.staleTimeoutMs as number) : 0);
  // Safely read optional restart config without using 'any'
  const restartInitUnknown = (init as Record<string, unknown>)['restart'];
  const restartInit =
    restartInitUnknown && typeof restartInitUnknown === 'object'
      ? (restartInitUnknown as Record<string, unknown>)
      : undefined;
  const restartInitMax = typeof restartInit?.['maxAttempts'] === 'number' ? (restartInit['maxAttempts'] as number) : undefined;
  const restartInitBackoff = typeof restartInit?.['backoffMs'] === 'number' ? (restartInit['backoffMs'] as number) : undefined;
  const [restartMaxAttempts, setRestartMaxAttempts] = useState<number>(restartInitMax ?? 5);
  const [restartBackoffMs, setRestartBackoffMs] = useState<number>(restartInitBackoff ?? 2000);
  const isDisabled = !!readOnly || !!disabled;

  useEffect(() => {
    const errors: string[] = [];
    if (!namespace) errors.push('namespace is required');
    onValidate?.(errors);
  }, [namespace, onValidate]);

  useEffect(() => {
    setEnv(readEnvList(init.env));
  }, [init]);

  useEffect(() => {
    const restart = { maxAttempts: restartMaxAttempts, backoffMs: restartBackoffMs };
    onChange({
      ...value,
      title: title || undefined,
      namespace,
      command: command || undefined,
      workdir: workdir || undefined,
      env: serializeEnvVars(env),
      requestTimeoutMs,
      startupTimeoutMs,
      heartbeatIntervalMs,
      staleTimeoutMs,
      restart,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, namespace, command, workdir, JSON.stringify(env), requestTimeoutMs, startupTimeoutMs, heartbeatIntervalMs, staleTimeoutMs, restartMaxAttempts, restartBackoffMs]);

  return (
    <div className="space-y-3 text-sm">
      <div>
        <label className="block text-xs mb-1">Title (optional)</label>
        <Input value={title} onChange={(e: ChangeEvent<HTMLInputElement>) => setTitle(e.target.value)} disabled={isDisabled} />
      </div>
      <div>
        <label className="block text-xs mb-1">Namespace</label>
        <Input value={namespace} onChange={(e: ChangeEvent<HTMLInputElement>) => setNamespace(e.target.value)} disabled={isDisabled} />
      </div>
      <div>
        <label className="block text-xs mb-1">Command (optional)</label>
        <Input value={command} onChange={(e: ChangeEvent<HTMLInputElement>) => setCommand(e.target.value)} disabled={isDisabled} placeholder="mcp start --stdio" />
      </div>
      <div>
        <label className="block text-xs mb-1">Workdir (optional)</label>
        <Input value={workdir} onChange={(e: ChangeEvent<HTMLInputElement>) => setWorkdir(e.target.value)} disabled={isDisabled} />
      </div>
      <div>
        <div className="text-xs mb-1">Environment</div>
        <ReferenceEnvField value={env} onChange={(next) => setEnv(next)} readOnly={readOnly} disabled={disabled} addLabel="Add env" onValidate={onValidate} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs mb-1">Request timeout (ms)</label>
          <Input type="number" min={1} value={requestTimeoutMs} onChange={(e: ChangeEvent<HTMLInputElement>) => setRequestTimeoutMs(parseInt(e.target.value || '1', 10))} disabled={isDisabled} />
        </div>
        <div>
          <label className="block text-xs mb-1">Startup timeout (ms)</label>
          <Input type="number" min={1} value={startupTimeoutMs} onChange={(e: ChangeEvent<HTMLInputElement>) => setStartupTimeoutMs(parseInt(e.target.value || '1', 10))} disabled={isDisabled} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs mb-1">Heartbeat interval (ms)</label>
          <Input type="number" min={1} value={heartbeatIntervalMs} onChange={(e: ChangeEvent<HTMLInputElement>) => setHeartbeatIntervalMs(parseInt(e.target.value || '1', 10))} disabled={isDisabled} />
        </div>
        <div>
          <label className="block text-xs mb-1">Stale timeout (ms)</label>
          <Input type="number" min={0} value={staleTimeoutMs} onChange={(e: ChangeEvent<HTMLInputElement>) => setStaleTimeoutMs(parseInt(e.target.value || '0', 10))} disabled={isDisabled} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs mb-1">Restart max attempts</label>
          <Input type="number" min={1} value={restartMaxAttempts} onChange={(e: ChangeEvent<HTMLInputElement>) => setRestartMaxAttempts(parseInt(e.target.value || '1', 10))} disabled={isDisabled} />
        </div>
        <div>
          <label className="block text-xs mb-1">Restart backoff (ms)</label>
          <Input type="number" min={1} value={restartBackoffMs} onChange={(e: ChangeEvent<HTMLInputElement>) => setRestartBackoffMs(parseInt(e.target.value || '1', 10))} disabled={isDisabled} />
        </div>
      </div>
    </div>
  );
}
