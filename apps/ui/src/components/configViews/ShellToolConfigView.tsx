import { useEffect, useMemo, useState } from 'react';
import { Input } from '@hautech/ui';
import type { StaticConfigViewProps } from './types';
import KeyValueEditor from './shared/KeyValueEditor';

export default function ShellToolConfigView({ value, onChange, readOnly, disabled, onValidate }: StaticConfigViewProps) {
  const init = useMemo(() => ({ ...(value || {}) }), [value]);
  const [workingDir, setWorkingDir] = useState<string>((init.workingDir as string) || '/workspace');
  const [env, setEnv] = useState<Record<string, string>>((init.env as Record<string, string>) || {});

  const isDisabled = !!readOnly || !!disabled;

  useEffect(() => {
    const errors: string[] = [];
    if (!workingDir) errors.push('workingDir is required');
    onValidate?.(errors);
  }, [workingDir, onValidate]);

  useEffect(() => {
    onChange({ ...value, workingDir, env });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workingDir, JSON.stringify(env)]);

  return (
    <div className="space-y-3 text-sm">
      <div>
        <label className="block text-xs mb-1">Working directory</label>
        <Input value={workingDir} onChange={(e) => setWorkingDir(e.target.value)} disabled={isDisabled} />
      </div>
      <div>
        <div className="text-xs mb-1">Environment</div>
        <KeyValueEditor value={env} onChange={setEnv} readOnly={readOnly} disabled={disabled} addLabel="Add env" />
      </div>
    </div>
  );
}
