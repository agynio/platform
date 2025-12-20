import { useCallback, useMemo } from 'react';

import type { EnvVar, NodeConfig } from '../types';
import {
  createEnvVar,
  fromReferenceSourceType,
  readEnvList,
  serializeEnvVars,
} from '../utils';

interface UseEnvEditorStateOptions {
  configRecord: Record<string, unknown>;
  onConfigChange?: (updates: Partial<NodeConfig>) => void;
  ensureSecretKeys?: () => Promise<unknown>;
  ensureVariableKeys?: () => Promise<unknown>;
}

interface EnvEditorState {
  envVars: EnvVar[];
  onAdd: () => void;
  onRemove: (index: number) => void;
  onNameChange: (index: number, value: string) => void;
  onValueChange: (index: number, value: string) => void;
  onValueFocus: (index: number) => void;
  onSourceTypeChange: (index: number, type: 'text' | 'secret' | 'variable') => void;
}

export function useEnvEditorState({
  configRecord,
  onConfigChange,
  ensureSecretKeys,
  ensureVariableKeys,
}: UseEnvEditorStateOptions): EnvEditorState {
  const envVars = useMemo(() => readEnvList(configRecord.env), [configRecord.env]);

  const handleAdd = useCallback(() => {
    const next = [...envVars, createEnvVar()];
    onConfigChange?.({ env: serializeEnvVars(next) });
  }, [envVars, onConfigChange]);

  const handleRemove = useCallback(
    (index: number) => {
      const next = envVars.filter((_, idx) => idx !== index);
      onConfigChange?.({ env: serializeEnvVars(next) });
    },
    [envVars, onConfigChange],
  );

  const handleNameChange = useCallback(
    (index: number, value: string) => {
      const next = envVars.map((item, idx) => (idx === index ? { ...item, name: value } : item));
      onConfigChange?.({ env: serializeEnvVars(next) });
    },
    [envVars, onConfigChange],
  );

  const handleValueChange = useCallback(
    (index: number, value: string) => {
      const next = envVars.map((item, idx) => (idx === index ? { ...item, value } : item));
      onConfigChange?.({ env: serializeEnvVars(next) });
    },
    [envVars, onConfigChange],
  );

  const handleValueFocus = useCallback(
    (index: number) => {
      const current = envVars[index];
      if (!current) return;
      if (current.source === 'vault') {
        void ensureSecretKeys?.();
      } else if (current.source === 'variable') {
        void ensureVariableKeys?.();
      }
    },
    [envVars, ensureSecretKeys, ensureVariableKeys],
  );

  const handleSourceChange = useCallback(
    (index: number, type: 'text' | 'secret' | 'variable') => {
      const source = fromReferenceSourceType(type);
      const next = envVars.map((item, idx) => (idx === index ? { ...item, source } : item));
      onConfigChange?.({ env: serializeEnvVars(next) });

      if (source === 'vault') {
        void ensureSecretKeys?.();
      } else if (source === 'variable') {
        void ensureVariableKeys?.();
      }
    },
    [envVars, ensureSecretKeys, ensureVariableKeys, onConfigChange],
  );

  return {
    envVars,
    onAdd: handleAdd,
    onRemove: handleRemove,
    onNameChange: handleNameChange,
    onValueChange: handleValueChange,
    onValueFocus: handleValueFocus,
    onSourceTypeChange: handleSourceChange,
  } satisfies EnvEditorState;
}
