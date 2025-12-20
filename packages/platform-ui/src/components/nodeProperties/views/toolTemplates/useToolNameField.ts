import { useCallback, useEffect, useMemo, useState } from 'react';

import { getCanonicalToolName } from '../../toolCanonicalNames';
import { isValidToolName } from '../../utils';
import type { NodePropertiesViewProps } from '../../viewTypes';

type ToolNodeProps = NodePropertiesViewProps<'Tool'>;

export interface ToolNameFieldState {
  value: string;
  error: string | null;
  placeholder: string;
  onChange: (value: string) => void;
}

export function useToolNameField({ config, onConfigChange }: ToolNodeProps): ToolNameFieldState {
  const configRecord = config as Record<string, unknown>;
  const templateName = typeof config.template === 'string' ? config.template : undefined;
  const toolName = typeof configRecord.name === 'string' ? (configRecord.name as string) : '';

  const [inputValue, setInputValue] = useState(toolName);
  const [inputError, setInputError] = useState<string | null>(null);

  useEffect(() => {
    setInputValue(toolName);
    setInputError(null);
  }, [toolName]);

  const placeholder = useMemo(() => {
    const canonical = getCanonicalToolName(templateName);
    return canonical || 'tool_name';
  }, [templateName]);

  const handleChange = useCallback(
    (rawValue: string) => {
      setInputValue(rawValue);
      const normalized = rawValue.trim();

      if (normalized.length === 0) {
        setInputError(null);
        if (toolName !== '') {
          onConfigChange?.({ name: undefined });
        }
        return;
      }

      if (!isValidToolName(normalized)) {
        setInputError('Name must match ^[a-z0-9_]{1,64}$');
        return;
      }

      setInputError(null);
      if (normalized !== toolName) {
        onConfigChange?.({ name: normalized });
      }
    },
    [onConfigChange, toolName],
  );

  return {
    value: inputValue,
    error: inputError,
    placeholder,
    onChange: handleChange,
  } satisfies ToolNameFieldState;
}

