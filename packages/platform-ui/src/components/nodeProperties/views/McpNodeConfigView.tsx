import { useCallback, useEffect, useMemo, useState } from 'react';

import { McpSection } from '../McpSection';
import type { NodeConfig } from '../types';
import type { NodePropertiesViewProps } from '../viewTypes';
import { useEnvEditorState } from '../hooks/useEnvEditorState';
import { isRecord, mergeWithDefined, readNumber } from '../utils';

type RestartPartial = Partial<{ maxAttempts: number | undefined; backoffMs: number | undefined }>;
type McpLimitKey =
  | 'requestTimeoutMs'
  | 'startupTimeoutMs'
  | 'heartbeatIntervalMs'
  | 'staleTimeoutMs'
  | 'restartMaxAttempts'
  | 'restartBackoffMs';

type McpNodeProps = NodePropertiesViewProps<'MCP'>;

function McpNodeConfigContent({
  config,
  onConfigChange,
  tools,
  toolsUpdatedAt,
  onDiscoverTools,
  toolsLoading,
  secretSuggestions,
  variableSuggestions,
  ensureSecretKeys,
  ensureVariableKeys,
}: McpNodeProps) {
  const configRecord = config as Record<string, unknown>;
  const namespace = typeof configRecord.namespace === 'string' ? (configRecord.namespace as string) : '';
  const command = typeof configRecord.command === 'string' ? (configRecord.command as string) : '';
  const workdir = typeof configRecord.workdir === 'string' ? (configRecord.workdir as string) : '';

  const mcpRequestTimeout = readNumber(configRecord.requestTimeoutMs);
  const mcpStartupTimeout = readNumber(configRecord.startupTimeoutMs);
  const mcpHeartbeatInterval = readNumber(configRecord.heartbeatIntervalMs);
  const mcpStaleTimeout = readNumber(configRecord.staleTimeoutMs);
  const restartConfig = useMemo(
    () => (isRecord(configRecord.restart) ? (configRecord.restart as Record<string, unknown>) : {}),
    [configRecord.restart],
  );
  const toolFilterConfig = useMemo(
    () => (isRecord(configRecord.toolFilter) ? (configRecord.toolFilter as Record<string, unknown>) : undefined),
    [configRecord.toolFilter],
  );
  const mcpRestartMaxAttempts = readNumber(restartConfig.maxAttempts);
  const mcpRestartBackoff = readNumber(restartConfig.backoffMs);

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

  const [envOpen, setEnvOpen] = useState(true);
  const [limitsOpen, setLimitsOpen] = useState(false);

  const derivedToolFilterMode = toolFilterConfig?.mode === 'deny' ? 'deny' : 'allow';
  const toolFilterMatchers = useMemo(() => {
    const rawMatchers = toolFilterConfig?.matchers;
    if (!Array.isArray(rawMatchers)) return [];
    return rawMatchers
      .map((matcher) => (typeof matcher === 'string' ? matcher.trim() : ''))
      .filter((matcher) => matcher.length > 0);
  }, [toolFilterConfig?.matchers]);
  const [toolFilterMode, setToolFilterMode] = useState<'allow' | 'deny'>(derivedToolFilterMode);

  useEffect(() => {
    setToolFilterMode(derivedToolFilterMode);
  }, [derivedToolFilterMode]);

  const toolFilterText = useMemo(() => toolFilterMatchers.join('\n'), [toolFilterMatchers]);
  const toolList = useMemo(() => (Array.isArray(tools) ? tools : []), [tools]);

  const handleRestartChange = useCallback(
    (partial: RestartPartial) => {
      const merged = mergeWithDefined(restartConfig, partial as Record<string, unknown>);
      onConfigChange?.({ restart: merged });
    },
    [onConfigChange, restartConfig],
  );

  const handleLimitChange = useCallback(
    (key: McpLimitKey, value: number | undefined) => {
      if (key === 'restartMaxAttempts') {
        handleRestartChange({ maxAttempts: value });
        return;
      }
      if (key === 'restartBackoffMs') {
        handleRestartChange({ backoffMs: value });
        return;
      }
      onConfigChange?.({ [key]: value } as Partial<NodeConfig>);
    },
    [handleRestartChange, onConfigChange],
  );

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

  const handleToolFilterModeChange = useCallback(
    (value: string) => {
      const nextMode = value === 'deny' ? 'deny' : 'allow';
      setToolFilterMode(nextMode);
      if (toolFilterMatchers.length === 0) {
        return;
      }
      onConfigChange?.({ toolFilter: { mode: nextMode, matchers: toolFilterMatchers } });
    },
    [onConfigChange, toolFilterMatchers],
  );

  const handleToolFilterMatchersChange = useCallback(
    (value: string) => {
      const matchers = value
        .split('\n')
        .map((matcher) => matcher.trim())
        .filter((matcher) => matcher.length > 0);
      if (matchers.length === 0) {
        onConfigChange?.({ toolFilter: undefined });
        return;
      }
      onConfigChange?.({ toolFilter: { mode: toolFilterMode, matchers } });
    },
    [onConfigChange, toolFilterMode],
  );

  return (
    <McpSection
      namespace={namespace}
      command={command}
      workdir={workdir}
      onNamespaceChange={(value) => onConfigChange?.({ namespace: value })}
      onCommandChange={(value) => onConfigChange?.({ command: value })}
      onWorkdirChange={(value) => onConfigChange?.({ workdir: value })}
      envEditorProps={envEditorProps}
      limitsOpen={limitsOpen}
      onLimitsOpenChange={setLimitsOpen}
      limits={{
        requestTimeoutMs: mcpRequestTimeout,
        startupTimeoutMs: mcpStartupTimeout,
        heartbeatIntervalMs: mcpHeartbeatInterval,
        staleTimeoutMs: mcpStaleTimeout,
        restartMaxAttempts: mcpRestartMaxAttempts,
        restartBackoffMs: mcpRestartBackoff,
      }}
      onLimitChange={handleLimitChange}
      toolFilter={{
        mode: toolFilterMode,
        matchers: toolFilterText,
        onModeChange: handleToolFilterModeChange,
        onMatchersChange: handleToolFilterMatchersChange,
      }}
      tools={{
        items: toolList,
        loading: Boolean(toolsLoading),
        updatedAt: toolsUpdatedAt,
        onDiscover: onDiscoverTools,
      }}
    />
  );
}

export function McpNodeConfigView(props: NodePropertiesViewProps<'MCP'>) {
  return <McpNodeConfigContent {...props} />;
}

export default McpNodeConfigView;
