import { useCallback, useMemo } from 'react';

import { Input } from '../../../Input';
import { Dropdown } from '../../../Dropdown';
import { ReferenceInput } from '../../../ReferenceInput';
import { FieldLabel } from '../../FieldLabel';
import type { NodePropertiesViewProps } from '../../viewTypes';
import {
  encodeReferenceValue,
  inferReferenceSource,
  readReferenceValue,
  writeReferenceValue,
} from '../../utils';
import type { ReferenceSourceType } from '../../utils';

import ToolNameField from './ToolNameField';
import { useToolNameField } from './useToolNameField';

type AuthSource = 'none' | 'env' | 'vault';

export function GithubCloneRepoToolTemplateView(props: NodePropertiesViewProps<'Tool'>) {
  const { config, onConfigChange, secretSuggestions, variableSuggestions, ensureSecretKeys, ensureVariableKeys } = props;

  const configRecord = config as Record<string, unknown>;
  const nameField = useToolNameField(props);

  const tokenReference = useMemo(() => readReferenceValue(configRecord.token), [configRecord.token]);
  const tokenSourceType = useMemo<ReferenceSourceType>(
    () => inferReferenceSource(tokenReference.raw),
    [tokenReference.raw],
  );

  const authRefRecord = (configRecord.authRef ?? null) as Record<string, unknown> | null;
  const inferredAuthSource: AuthSource = useMemo(() => {
    if (!authRefRecord) return 'none';
    const rawSource = typeof authRefRecord.source === 'string' ? authRefRecord.source : undefined;
    if (rawSource === 'vault') return 'vault';
    if (rawSource === 'env') return 'env';
    if (typeof authRefRecord.envVar === 'string' && authRefRecord.envVar.trim().length > 0) return 'env';
    if (
      typeof authRefRecord.mount === 'string' ||
      typeof authRefRecord.path === 'string' ||
      typeof authRefRecord.key === 'string'
    )
      return 'vault';
    return 'none';
  }, [authRefRecord]);

  const authEnvVar = typeof authRefRecord?.envVar === 'string' ? (authRefRecord.envVar as string) : '';
  const authMount = typeof authRefRecord?.mount === 'string' ? (authRefRecord.mount as string) : '';
  const authPath = typeof authRefRecord?.path === 'string' ? (authRefRecord.path as string) : '';
  const authKey = typeof authRefRecord?.key === 'string' ? (authRefRecord.key as string) : '';

  const handleTokenChange = useCallback(
    (value: string) => {
      onConfigChange?.({ token: writeReferenceValue(tokenReference.raw, value, tokenSourceType) });
    },
    [onConfigChange, tokenReference.raw, tokenSourceType],
  );

  const handleTokenSourceChange = useCallback(
    (type: ReferenceSourceType) => {
      onConfigChange?.({ token: encodeReferenceValue(type, '', tokenReference.raw) });
      if (type === 'secret') {
        void ensureSecretKeys?.();
      } else if (type === 'variable') {
        void ensureVariableKeys?.();
      }
    },
    [ensureSecretKeys, ensureVariableKeys, onConfigChange, tokenReference.raw],
  );

  const handleTokenFocus = useCallback(() => {
    if (tokenSourceType === 'secret') {
      void ensureSecretKeys?.();
    } else if (tokenSourceType === 'variable') {
      void ensureVariableKeys?.();
    }
  }, [ensureSecretKeys, ensureVariableKeys, tokenSourceType]);

  const setAuthRef = useCallback(
    (source: AuthSource, updates: { envVar?: string; mount?: string; path?: string; key?: string } = {}) => {
      if (source === 'none') {
        onConfigChange?.({ authRef: undefined });
        return;
      }

      if (source === 'env') {
        const nextEnv = Object.prototype.hasOwnProperty.call(updates, 'envVar') ? updates.envVar ?? '' : authEnvVar;
        const trimmed = (nextEnv ?? '').trim();
        const next: Record<string, unknown> = { source: 'env' };
        if (trimmed.length > 0) next.envVar = trimmed;
        onConfigChange?.({ authRef: next });
        return;
      }

      const nextMount = Object.prototype.hasOwnProperty.call(updates, 'mount') ? updates.mount ?? '' : authMount;
      const nextPath = Object.prototype.hasOwnProperty.call(updates, 'path') ? updates.path ?? '' : authPath;
      const nextKey = Object.prototype.hasOwnProperty.call(updates, 'key') ? updates.key ?? '' : authKey;

      const trimmedMount = nextMount.trim();
      const trimmedPath = nextPath.trim();
      const trimmedKey = nextKey.trim();

      const next: Record<string, unknown> = { source: 'vault' };
      if (trimmedMount.length > 0) next.mount = trimmedMount;
      if (trimmedPath.length > 0) next.path = trimmedPath;
      if (trimmedKey.length > 0) next.key = trimmedKey;
      onConfigChange?.({ authRef: next });
    },
    [authEnvVar, authKey, authMount, authPath, onConfigChange],
  );

  const handleAuthSourceChange = useCallback(
    (value: AuthSource) => {
      setAuthRef(value, {});
    },
    [setAuthRef],
  );

  const handleAuthEnvVarChange = useCallback(
    (value: string) => {
      setAuthRef('env', { envVar: value });
    },
    [setAuthRef],
  );

  const handleAuthMountChange = useCallback(
    (value: string) => {
      setAuthRef('vault', { mount: value });
    },
    [setAuthRef],
  );

  const handleAuthPathChange = useCallback(
    (value: string) => {
      setAuthRef('vault', { path: value });
    },
    [setAuthRef],
  );

  const handleAuthKeyChange = useCallback(
    (value: string) => {
      setAuthRef('vault', { key: value });
    },
    [setAuthRef],
  );

  return (
    <>
      <ToolNameField {...nameField} />

      <section className="space-y-2">
        <FieldLabel label="GitHub Token" hint="Provide a token or reference for cloning private repositories." />
        <ReferenceInput
          size="sm"
          value={tokenReference.value}
          onChange={(event) => handleTokenChange(event.target.value)}
          sourceType={tokenSourceType}
          onSourceTypeChange={(type) => handleTokenSourceChange(type as ReferenceSourceType)}
          onFocus={handleTokenFocus}
          secretKeys={secretSuggestions}
          variableKeys={variableSuggestions}
          placeholder="ghp_..."
        />
      </section>

      <section className="space-y-4">
        <div>
          <FieldLabel label="Authentication Source Override" hint="Optionally override how the tool resolves credentials." />
          <Dropdown
            size="sm"
            value={inferredAuthSource}
            onValueChange={(value) => handleAuthSourceChange(value as AuthSource)}
            options={[
              { value: 'none', label: 'Default (workspace secrets)' },
              { value: 'env', label: 'Environment variable' },
              { value: 'vault', label: 'Vault secret' },
            ]}
          />
        </div>

        {inferredAuthSource === 'env' && (
          <div>
            <FieldLabel label="Environment variable" hint="Name of the environment variable containing the token." />
            <Input
              size="sm"
              placeholder="GH_TOKEN"
              value={authEnvVar}
              onChange={(event) => handleAuthEnvVarChange(event.target.value)}
            />
          </div>
        )}

        {inferredAuthSource === 'vault' && (
          <div className="space-y-3">
            <div>
              <FieldLabel label="Vault mount" hint="KV mount (default secret)." />
              <Input
                size="sm"
                placeholder="secret"
                value={authMount}
                onChange={(event) => handleAuthMountChange(event.target.value)}
              />
            </div>
            <div>
              <FieldLabel label="Vault path" hint="Path within the mount." />
              <Input
                size="sm"
                placeholder="github/token"
                value={authPath}
                onChange={(event) => handleAuthPathChange(event.target.value)}
              />
            </div>
            <div>
              <FieldLabel label="Secret key" hint="Key within the secret (default GH_TOKEN)." />
              <Input
                size="sm"
                placeholder="GH_TOKEN"
                value={authKey}
                onChange={(event) => handleAuthKeyChange(event.target.value)}
              />
            </div>
          </div>
        )}
      </section>
    </>
  );
}

export default GithubCloneRepoToolTemplateView;
