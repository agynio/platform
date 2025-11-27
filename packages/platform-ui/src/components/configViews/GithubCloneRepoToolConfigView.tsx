import { useEffect, useMemo, useState } from 'react';
import { Input } from '@agyn/ui';
import { getCanonicalToolName } from '@/components/nodeProperties/toolCanonicalNames';
import { isValidToolName } from '@/components/nodeProperties/utils';
import type { StaticConfigViewProps } from './types';
import ReferenceField, { type ReferenceValue } from './shared/ReferenceField';
import { ToolNameLabel } from './shared/ToolNameLabel';

function isVaultRef(v: string) {
  // Expect mount/path/key with no leading slash
  return /^(?:[^/]+)\/(?:[^/]+)\/(?:[^/]+)$/.test(v || '');
}

export default function GithubCloneRepoToolConfigView({ value, onChange, readOnly, disabled }: StaticConfigViewProps) {
  const init = useMemo(() => ({ ...(value || {}) }), [value]);
  const initialToken: ReferenceValue | string = (() => {
    const t = (init as Record<string, unknown>)['token'];
    if (!t) return '';
    if (typeof t === 'string') return t;
    if (t && typeof t === 'object' && 'value' in (t as Record<string, unknown>)) return t as ReferenceValue;
    return '';
  })();
  const [token, setToken] = useState<ReferenceValue | string>(initialToken);
  const [errors, setErrors] = useState<string[]>([]);
  const [name, setName] = useState<string>((init.name as string) || '');
  const [nameError, setNameError] = useState<string | null>(null);
  const namePlaceholder = getCanonicalToolName('githubCloneRepoTool') || 'github_clone_repo';

  useEffect(() => {
    const t = typeof token === 'string' ? { value: token, source: 'static' as const } : (token as ReferenceValue);
    const errs: string[] = [];
    if ((t.source || 'static') === 'vault' && t.value && !isVaultRef(t.value)) errs.push('token vault ref must be mount/path/key');
    setErrors(errs);

    const trimmedName = name.trim();
    let nextName: string | undefined;
    if (trimmedName.length === 0) {
      setNameError(null);
      nextName = undefined;
    } else if (isValidToolName(trimmedName)) {
      setNameError(null);
      nextName = trimmedName;
    } else {
      setNameError('Name must match ^[a-z0-9_]{1,64}$');
      nextName = typeof init.name === 'string' ? (init.name as string) : undefined;
    }

    const next = { ...value, token: t, name: nextName };
    if (JSON.stringify(value || {}) !== JSON.stringify(next)) onChange(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, name]);

  useEffect(() => {
    setName((init.name as string) || '');
  }, [init]);

  return (
    <div className="space-y-3 text-sm">
      <div>
        <ToolNameLabel />
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={readOnly || disabled}
          placeholder={namePlaceholder}
        />
        {nameError && <div className="text-[10px] text-red-600 mt-1">{nameError}</div>}
      </div>
      <ReferenceField
        label="GitHub token (optional)"
        value={token}
        onChange={(v) => setToken(v)}
        readOnly={readOnly}
        disabled={disabled}
        placeholder="token or mount/path/key"
        helpText="When using vault, value should be 'mount/path/key'."
      />
      {errors.length > 0 && <div className="text-[10px] text-red-600">{errors.join(', ')}</div>}
    </div>
  );
}
