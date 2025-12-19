import { useCallback, useEffect, useMemo, useState } from 'react';

import { Input } from '../../Input';
import { Dropdown } from '../../Dropdown';

import { ToolSection } from '../ToolSection';
import { TOOL_NAME_HINT } from '../toolNameHint';
import { getCanonicalToolName } from '../toolCanonicalNames';
import { FieldLabel } from '../FieldLabel';
import type { NodeConfig } from '../types';
import type { NodePropertiesViewProps } from '../viewTypes';
import { useEnvEditorState } from '../hooks/useEnvEditorState';
import { isValidToolName, readNumber, toNumberOrUndefined } from '../utils';

type ToolLimitKey =
  | 'executionTimeoutMs'
  | 'idleTimeoutMs'
  | 'outputLimitChars'
  | 'chunkCoalesceMs'
  | 'chunkSizeBytes'
  | 'clientBufferLimitBytes';

type ToolNodeProps = NodePropertiesViewProps<'Tool'>;

function ToolNodeConfigContent({
  config,
  onConfigChange,
  secretSuggestions,
  variableSuggestions,
  ensureSecretKeys,
  ensureVariableKeys,
}: ToolNodeProps) {
  const configRecord = config as Record<string, unknown>;
  const configTemplate = typeof config.template === 'string' ? config.template : undefined;
  const recordTemplate = typeof configRecord.template === 'string' ? (configRecord.template as string) : undefined;
  const nodeTemplate = configTemplate ?? recordTemplate;
  const isShellTool = nodeTemplate === 'shellTool';
  const isManageTool = nodeTemplate === 'manageTool';

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
  const manageModeValue = configRecord.mode === 'async' ? 'async' : 'sync';
  const manageTimeoutMs = readNumber(configRecord.timeoutMs);

  const toolName = typeof configRecord.name === 'string' ? (configRecord.name as string) : '';
  const [toolNameInput, setToolNameInput] = useState(toolName);
  const [toolNameError, setToolNameError] = useState<string | null>(null);
  const [toolEnvOpen, setToolEnvOpen] = useState(true);
  const [toolLimitsOpen, setToolLimitsOpen] = useState(false);

  useEffect(() => {
    setToolNameInput(toolName);
    setToolNameError(null);
  }, [toolName]);

  const envState = useEnvEditorState({
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
  } = envState;

  const canonicalToolName = useMemo(() => getCanonicalToolName(nodeTemplate), [nodeTemplate]);
  const toolNamePlaceholder = canonicalToolName || 'tool_name';

  const handleToolNameChange = useCallback(
    (value: string) => {
      setToolNameInput(value);
      const normalized = value.trim();

      if (normalized.length === 0) {
        setToolNameError(null);
        if (toolName !== '') {
          onConfigChange?.({ name: undefined });
        }
        return;
      }

      if (!isValidToolName(normalized)) {
        setToolNameError('Name must match ^[a-z0-9_]{1,64}$');
        return;
      }

      setToolNameError(null);
      if (normalized !== toolName) {
        onConfigChange?.({ name: normalized });
      }
    },
    [onConfigChange, toolName],
  );

  const handleToolWorkdirChange = useCallback(
    (value: string) => {
      onConfigChange?.({ workdir: value });
    },
    [onConfigChange],
  );

  const handleToolLimitChange = useCallback(
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

  const envEditorProps = useMemo(
    () => ({
      title: 'Environment Variables',
      isOpen: toolEnvOpen,
      onOpenChange: setToolEnvOpen,
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
    [envVars, onAdd, onNameChange, onRemove, onSourceTypeChange, onValueChange, onValueFocus, secretSuggestions, toolEnvOpen, variableSuggestions],
  );

  return (
    <>
      <section>
        <FieldLabel label="Name" hint={TOOL_NAME_HINT} />
        <Input
          value={toolNameInput}
          onChange={(event) => handleToolNameChange(event.target.value)}
          placeholder={toolNamePlaceholder}
          size="sm"
          aria-invalid={toolNameError ? 'true' : 'false'}
        />
        {toolNameError && <p className="mt-1 text-xs text-[var(--agyn-status-failed)]">{toolNameError}</p>}
      </section>

      {isManageTool && (
        <section className="space-y-4">
          <div>
            <FieldLabel label="Mode" hint="sync waits for child responses; async sends without waiting" />
            <Dropdown
              size="sm"
              value={manageModeValue}
              onValueChange={(value) => onConfigChange?.({ mode: value })}
              options={[
                { value: 'sync', label: 'Sync' },
                { value: 'async', label: 'Async' },
              ]}
            />
          </div>
          <div>
            <FieldLabel label="Timeout (ms)" hint="0 disables timeout (sync mode only)" />
            <Input
              size="sm"
              placeholder="0"
              value={manageTimeoutMs !== undefined ? String(manageTimeoutMs) : ''}
              onChange={(event) => onConfigChange?.({ timeoutMs: toNumberOrUndefined(event.target.value) })}
            />
          </div>
        </section>
      )}

      {isShellTool && (
        <ToolSection
          workdir={toolWorkdir}
          onWorkdirChange={handleToolWorkdirChange}
          envEditorProps={envEditorProps}
          limits={{
            executionTimeoutMs: toolExecutionTimeout,
            idleTimeoutMs: toolIdleTimeout,
            outputLimitChars: toolOutputLimit,
            chunkCoalesceMs: toolChunkCoalesce,
            chunkSizeBytes: toolChunkSize,
            clientBufferLimitBytes: toolClientBufferLimit,
          }}
          onLimitChange={handleToolLimitChange}
          limitsOpen={toolLimitsOpen}
          onLimitsOpenChange={setToolLimitsOpen}
          logToPid1={logToPid1Enabled}
          onLogToPid1Change={handleLogToPid1Change}
        />
      )}
    </>
  );
}

export function ToolNodeConfigView(props: NodePropertiesViewProps<'Tool'>) {
  return <ToolNodeConfigContent {...props} />;
}

export default ToolNodeConfigView;
