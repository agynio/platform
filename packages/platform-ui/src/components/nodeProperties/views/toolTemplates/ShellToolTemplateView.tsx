import { useCallback, useMemo, useState } from 'react';

import { ToolSection } from '../../ToolSection';
import type { NodeConfig } from '../../types';
import type { NodePropertiesViewProps } from '../../viewTypes';
import { useEnvEditorState } from '../../hooks/useEnvEditorState';
import { readNumber } from '../../utils';
import { FieldLabel } from '../../FieldLabel';
import { Textarea } from '../../../Textarea';

import ToolNameField from './ToolNameField';
import { useToolNameField } from './useToolNameField';

type ToolLimitKey =
  | 'executionTimeoutMs'
  | 'idleTimeoutMs'
  | 'outputLimitChars'
  | 'chunkCoalesceMs'
  | 'chunkSizeBytes'
  | 'clientBufferLimitBytes';

export function ShellToolTemplateView(props: NodePropertiesViewProps<'Tool'>) {
  const {
    config,
    onConfigChange,
    secretSuggestions,
    variableSuggestions,
    ensureSecretKeys,
    ensureVariableKeys,
  } = props;

  const configRecord = config as Record<string, unknown>;
  const nameField = useToolNameField(props);

  const [envOpen, setEnvOpen] = useState(true);
  const [limitsOpen, setLimitsOpen] = useState(false);

  const promptValue = typeof configRecord.prompt === 'string' ? (configRecord.prompt as string) : '';
  const promptTextareaValue = useMemo(() => promptValue, [promptValue]);

  const toolWorkdir =
    typeof configRecord.workdir === 'string'
      ? (configRecord.workdir as string)
      : typeof configRecord.workingDir === 'string'
      ? (configRecord.workingDir as string)
      : '';
  const toolExecutionTimeout = readNumber(configRecord.executionTimeoutMs);
  const toolIdleTimeout = readNumber(configRecord.idleTimeoutMs);
  const toolOutputLimit = readNumber(configRecord.outputLimitChars);
  const toolChunkCoalesce = readNumber(configRecord.chunkCoalesceMs);
  const toolChunkSize = readNumber(configRecord.chunkSizeBytes);
  const toolClientBufferLimit = readNumber(configRecord.clientBufferLimitBytes);
  const logToPid1Enabled = configRecord.logToPid1 !== false;

  const envEditorState = useEnvEditorState({
    configRecord,
    onConfigChange,
    ensureSecretKeys,
    ensureVariableKeys,
  });
  const {
    envVars,
    onAdd,
    onRemove,
    onNameChange,
    onValueChange,
    onValueFocus,
    onSourceTypeChange,
  } = envEditorState;

  const envEditorProps = useMemo(
    () => ({
      title: 'Environment Variables',
      isOpen: envOpen,
      onOpenChange: setEnvOpen,
      envVars,
      onAdd,
      onRemove,
      onNameChange,
      onValueChange,
      onValueFocus,
      onSourceTypeChange,
      secretSuggestions,
      variableSuggestions,
    }),
    [envOpen, envVars, onAdd, onNameChange, onRemove, onSourceTypeChange, onValueChange, onValueFocus, secretSuggestions, variableSuggestions],
  );

  const handleWorkdirChange = useCallback(
    (value: string) => {
      onConfigChange?.({ workdir: value });
    },
    [onConfigChange],
  );

  const handleLimitChange = useCallback(
    (key: ToolLimitKey, value: number | undefined) => {
      onConfigChange?.({ [key]: value } as Partial<NodeConfig>);
    },
    [onConfigChange],
  );

  const handleLogToPid1Change = useCallback(
    (checked: boolean) => {
      onConfigChange?.({ logToPid1: checked });
    },
    [onConfigChange],
  );

  const handlePromptChange = useCallback(
    (value: string) => {
      onConfigChange?.({ prompt: value.length > 0 ? value : undefined } as Partial<NodeConfig>);
    },
    [onConfigChange],
  );

  return (
    <>
      <ToolNameField {...nameField} />

      <section className="space-y-2">
        <FieldLabel label="Prompt" hint="Optional prompt metadata shared with the parent agent." />
        <Textarea
          value={promptTextareaValue}
          onChange={(event) => handlePromptChange(event.target.value)}
          className="min-h-[96px]"
          placeholder="Describe how shell access should be used..."
          maxLength={8192}
        />
      </section>

      <ToolSection
        workdir={toolWorkdir}
        onWorkdirChange={handleWorkdirChange}
        envEditorProps={envEditorProps}
        limits={{
          executionTimeoutMs: toolExecutionTimeout,
          idleTimeoutMs: toolIdleTimeout,
          outputLimitChars: toolOutputLimit,
          chunkCoalesceMs: toolChunkCoalesce,
          chunkSizeBytes: toolChunkSize,
          clientBufferLimitBytes: toolClientBufferLimit,
        }}
        onLimitChange={handleLimitChange}
        limitsOpen={limitsOpen}
        onLimitsOpenChange={setLimitsOpen}
        logToPid1={logToPid1Enabled}
        onLogToPid1Change={handleLogToPid1Change}
      />
    </>
  );
}

export default ShellToolTemplateView;
