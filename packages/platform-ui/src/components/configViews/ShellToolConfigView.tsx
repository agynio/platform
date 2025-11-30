import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { Input } from '@agyn/ui';
import type { EnvVar } from '@/components/nodeProperties/types';
import { getCanonicalToolName } from '@/components/nodeProperties/toolCanonicalNames';
import { isValidToolName, readEnvList, serializeEnvVars } from '@/components/nodeProperties/utils';
import type { StaticConfigViewProps } from './types';
import ReferenceEnvField from './shared/ReferenceEnvField';
import { ToolNameLabel } from './shared/ToolNameLabel';

export default function ShellToolConfigView({ value, onChange, readOnly, disabled, onValidate }: StaticConfigViewProps) {
  const init = useMemo<Record<string, unknown>>(() => ({ ...(value || {}) }), [value]);
  const [name, setName] = useState<string>((init.name as string) || '');
  const [workdir, setWorkdir] = useState<string>((init.workdir as string) || (init.workingDir as string) || '/workspace');
  const [env, setEnv] = useState<EnvVar[]>(() => readEnvList(init.env));
  const [executionTimeoutMs, setExecutionTimeoutMs] = useState<number>(
    typeof init.executionTimeoutMs === 'number' ? (init.executionTimeoutMs as number) : 60 * 60 * 1000,
  );
  const [idleTimeoutMs, setIdleTimeoutMs] = useState<number>(
    typeof init.idleTimeoutMs === 'number' ? (init.idleTimeoutMs as number) : 60 * 1000,
  );
  const [outputLimitChars, setOutputLimitChars] = useState<number>(() => {
    const v = init['outputLimitChars'];
    return typeof v === 'number' ? v : 50000;
  });
  const [nameError, setNameError] = useState<string | null>(null);

  const isDisabled = !!readOnly || !!disabled;
  const namePlaceholder = getCanonicalToolName('shellTool');

  useEffect(() => {
    const errors: string[] = [];
    const trimmedName = name.trim();
    const hasName = trimmedName.length > 0;
    const nameValid = !hasName || isValidToolName(trimmedName);
    const inRange = (v: number) => v === 0 || (Number.isInteger(v) && v >= 1000 && v <= 86400000);
    if (!inRange(executionTimeoutMs)) errors.push('executionTimeoutMs must be 0 or 1000-86400000');
    if (!inRange(idleTimeoutMs)) errors.push('idleTimeoutMs must be 0 or 1000-86400000');
    const outputLimitInRange = (v: number) => v === 0 || (Number.isInteger(v) && v > 0);
    if (!outputLimitInRange(outputLimitChars)) errors.push('outputLimitChars must be 0 or a positive integer');
    if (!nameValid) {
      errors.push('Name must match ^[a-z0-9_]{1,64}$');
      setNameError('Name must match ^[a-z0-9_]{1,64}$');
    } else {
      setNameError(null);
    }
    onValidate?.(errors);
  }, [workdir, executionTimeoutMs, idleTimeoutMs, outputLimitChars, name, onValidate]);

  useEffect(() => {
    setEnv(readEnvList(init.env));
  }, [init]);

  useEffect(() => {
    setName((init.name as string) || '');
  }, [init]);

  useEffect(() => {
    const trimmedName = name.trim();
    let nextName: string | undefined;
    if (trimmedName.length === 0) {
      nextName = undefined;
    } else if (isValidToolName(trimmedName)) {
      nextName = trimmedName;
    } else {
      nextName = typeof init.name === 'string' ? (init.name as string) : undefined;
    }

    const next = {
      ...value,
      name: nextName,
      workdir,
      env: serializeEnvVars(env),
      executionTimeoutMs,
      idleTimeoutMs,
      outputLimitChars,
    };
    if (JSON.stringify(value || {}) !== JSON.stringify(next)) onChange(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, workdir, JSON.stringify(env), executionTimeoutMs, idleTimeoutMs, outputLimitChars]);

  return (
    <div className="space-y-3 text-sm">
      <div>
        <ToolNameLabel />
        <Input value={name} onChange={(e: ChangeEvent<HTMLInputElement>) => setName(e.target.value)} disabled={isDisabled} placeholder={namePlaceholder || 'shell_command'} />
        {nameError && <div className="text-[10px] text-red-600 mt-1">{nameError}</div>}
      </div>
      <div>
        <label htmlFor="workdir" className="block text-xs mb-1">Working directory</label>
        <Input id="workdir" value={workdir} onChange={(e: ChangeEvent<HTMLInputElement>) => setWorkdir(e.target.value)} disabled={isDisabled} />
      </div>
      <div>
        <div className="text-xs mb-1">Environment</div>
        <ReferenceEnvField value={env} onChange={(next) => setEnv(next)} readOnly={readOnly} disabled={disabled} addLabel="Add env" onValidate={onValidate} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label htmlFor="executionTimeoutMs" className="block text-xs mb-1">Execution timeout (ms)</label>
          <Input id="executionTimeoutMs" type="number" min={0} value={executionTimeoutMs} onChange={(e: ChangeEvent<HTMLInputElement>) => setExecutionTimeoutMs(parseInt(e.target.value || '0', 10))} disabled={isDisabled} />
        </div>
        <div>
          <label htmlFor="idleTimeoutMs" className="block text-xs mb-1">Idle timeout (ms)</label>
          <Input id="idleTimeoutMs" type="number" min={0} value={idleTimeoutMs} onChange={(e: ChangeEvent<HTMLInputElement>) => setIdleTimeoutMs(parseInt(e.target.value || '0', 10))} disabled={isDisabled} />
        </div>
      </div>
      <div>
        <label htmlFor="outputLimitChars" className="block text-xs mb-1">Output limit (characters)</label>
        <Input
          id="outputLimitChars"
          type="number"
          min={0}
          value={outputLimitChars}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setOutputLimitChars(parseInt(e.target.value || '0', 10))}
          disabled={isDisabled}
        />
        <div className="text-[10px] text-muted-foreground mt-1">
          Maximum combined cleaned stdout+stderr length. If greater than 0 and exceeded, output is saved to /tmp/&lt;uuid&gt;.txt and a short error message is returned.
        </div>
      </div>
    </div>
  );
}
