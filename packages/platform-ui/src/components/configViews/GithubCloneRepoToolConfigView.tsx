import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { Input } from '@/components/ui/input';
import { getCanonicalToolName } from '@/components/nodeProperties/toolCanonicalNames';
import { isValidToolName } from '@/components/nodeProperties/utils';
import type { ReferenceConfigValue } from '@/components/nodeProperties/types';
import { deepEqual } from '@/lib/utils';
import type { StaticConfigViewProps } from './types';
import ReferenceField from './shared/ReferenceField';
import { ToolNameLabel } from './shared/ToolNameLabel';
import { normalizeReferenceValue, readReferenceDetails } from './shared/referenceUtils';
import { useSecretKeyOptions } from './shared/useSecretKeyOptions';
import { useVariableKeyOptions } from './shared/useVariableKeyOptions';

function isVaultRef(v: string) {
  // Expect mount/path/key with no leading slash
  return /^(?:[^/]+)\/(?:[^/]+)\/(?:[^/]+)$/.test(v || '');
}

export default function GithubCloneRepoToolConfigView({ value, onChange, readOnly, disabled }: StaticConfigViewProps) {
  const tokenRaw = value['token'];
  const nameRaw = value['name'];
  const secretKeys = useSecretKeyOptions();
  const variableKeys = useVariableKeyOptions();

  const normalizedToken = useMemo(() => normalizeReferenceValue(tokenRaw), [tokenRaw]);
  const [token, setToken] = useState<ReferenceConfigValue>(normalizedToken);
  const [errors, setErrors] = useState<string[]>([]);
  const [name, setName] = useState<string>(typeof nameRaw === 'string' ? nameRaw : '');
  const [nameError, setNameError] = useState<string | null>(null);
  const namePlaceholder = getCanonicalToolName('githubCloneRepoTool') || 'github_clone_repo';

  useEffect(() => {
    setToken(normalizedToken);
  }, [normalizedToken]);

  useEffect(() => {
    setName(typeof nameRaw === 'string' ? nameRaw : '');
  }, [nameRaw]);

  const tokenDetails = useMemo(() => readReferenceDetails(token), [token]);

  useEffect(() => {
    const errs: string[] = [];
    if (tokenDetails.sourceType === 'secret' && tokenDetails.value && !isVaultRef(tokenDetails.value)) errs.push('token vault ref must be mount/path/key');
    setErrors(errs);
  }, [tokenDetails]);

  useEffect(() => {
    const trimmedName = name.trim();
    if (!trimmedName.length) {
      setNameError(null);
      return;
    }
    setNameError(isValidToolName(trimmedName) ? null : 'Name must match ^[a-z0-9_]{1,64}$');
  }, [name]);

  useEffect(() => {
    const trimmedName = name.trim();
    let nextName: string | undefined;
    if (!trimmedName.length) {
      nextName = undefined;
    } else if (isValidToolName(trimmedName)) {
      nextName = trimmedName;
    } else {
      nextName = typeof nameRaw === 'string' ? (nameRaw as string) : undefined;
    }

    if (deepEqual(tokenRaw, token) && (typeof nameRaw === 'string' ? nameRaw : undefined) === nextName) {
      return;
    }

    onChange({ ...value, token, name: nextName });
  }, [token, tokenRaw, name, nameRaw, onChange, value]);

  return (
    <div className="space-y-3 text-sm">
      <div>
        <ToolNameLabel />
        <Input
          value={name}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
          disabled={readOnly || disabled}
          placeholder={namePlaceholder}
        />
        {nameError && <div className="text-[10px] text-red-600 mt-1">{nameError}</div>}
      </div>
      <ReferenceField
        label="GitHub token (optional)"
        value={token}
        onChange={setToken}
        readOnly={readOnly}
        disabled={disabled}
        secretKeys={secretKeys}
        variableKeys={variableKeys}
        helpText="When using vault, value should be 'mount/path/key'."
      />
      {errors.length > 0 && <div className="text-[10px] text-red-600">{errors.join(', ')}</div>}
    </div>
  );
}
