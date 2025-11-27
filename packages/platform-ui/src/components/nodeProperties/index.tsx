import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Input } from '../Input';
import type { AutocompleteOption } from '../AutocompleteInput';

import { Header } from './Header';
import { FieldLabel } from './FieldLabel';
import { AgentSection } from './AgentSection';
import { TriggerSection } from './TriggerSection';
import { McpSection } from './McpSection';
import { WorkspaceSection } from './WorkspaceSection';
import {
  applyNixUpdate,
  applyQueueUpdate,
  applySummarizationUpdate,
  applyVolumesUpdate,
  createEnvVar,
  fromReferenceSourceType,
  isRecord,
  mergeWithDefined,
  readEnvList,
  readNixPackages,
  readNumber,
  readQueueConfig,
  readReferenceValue,
  readSummarizationConfig,
  serializeEnvVars,
  writeReferenceValue,
} from './utils';
import type {
  AgentQueueConfig,
  AgentSummarizationConfig,
  NodeConfig,
  NodePropertiesSidebarProps,
  NodeState,
  WorkspaceNixPackage,
} from './types';

type SuggestionFetcher = {
  suggestions: string[];
  fetchNow: (query: string) => void;
  scheduleFetch: (query: string) => void;
};

function useSuggestionFetcher(
  provider?: (query: string) => Promise<string[]>,
  debounceMs = 250,
): SuggestionFetcher {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestQueryRef = useRef('');
  const providerRef = useRef(provider);

  useEffect(() => {
    providerRef.current = provider;
  }, [provider]);

  const fetchNow = useCallback(
    async (query: string) => {
      const normalized = query.trim();
      latestQueryRef.current = normalized;
      if (!normalized || !providerRef.current) {
        setSuggestions([]);
        return;
      }
      try {
        const result = await providerRef.current(normalized);
        if (latestQueryRef.current !== normalized) return;
        setSuggestions(Array.isArray(result) ? result : []);
      } catch {
        if (latestQueryRef.current !== normalized) return;
        setSuggestions([]);
      }
    },
    [],
  );

  const scheduleFetch = useCallback(
    (query: string) => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      timerRef.current = setTimeout(() => {
        void fetchNow(query);
      }, debounceMs);
    },
    [debounceMs, fetchNow],
  );

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  return { suggestions, fetchNow, scheduleFetch };
}

function NodePropertiesSidebar({
  config,
  state,
  onConfigChange,
  onProvision,
  onDeprovision,
  canProvision = false,
  canDeprovision = false,
  isActionPending = false,
  tools,
  enabledTools,
  onToggleTool,
  toolsLoading = false,
  nixPackageSearch,
  fetchNixPackageVersions,
  resolveNixPackageSelection,
  secretSuggestionProvider,
  variableSuggestionProvider,
  providerDebounceMs = 250,
}: NodePropertiesSidebarProps) {
  const { kind: nodeKind, title: nodeTitle } = config;
  const { status } = state;
  const configRecord = config as Record<string, unknown>;

  const [workspaceEnvOpen, setWorkspaceEnvOpen] = useState(true);
  const [mcpEnvOpen, setMcpEnvOpen] = useState(true);
  const [nixPackagesOpen, setNixPackagesOpen] = useState(true);
  const [mcpLimitsOpen, setMcpLimitsOpen] = useState(false);
  const [nixPackageQuery, setNixPackageQuery] = useState('');
  const [nixVersionOptions, setNixVersionOptions] = useState<Record<string, string[]>>({});
  const [nixVersionLoading, setNixVersionLoading] = useState<Set<string>>(() => new Set());
  const [nixResolutionLoading, setNixResolutionLoading] = useState<Set<string>>(() => new Set());
  const [nixErrors, setNixErrors] = useState<Record<string, string | null>>({});

  const secretFetcher = useSuggestionFetcher(secretSuggestionProvider, providerDebounceMs);
  const variableFetcher = useSuggestionFetcher(variableSuggestionProvider, providerDebounceMs);

  const { suggestions: secretSuggestions, fetchNow: fetchSecretNow, scheduleFetch: scheduleSecretFetch } = secretFetcher;
  const {
    suggestions: variableSuggestions,
    fetchNow: fetchVariableNow,
    scheduleFetch: scheduleVariableFetch,
  } = variableFetcher;

  const envVars = useMemo(() => readEnvList(configRecord.env), [configRecord.env]);
  const agentModel = typeof configRecord.model === 'string' ? (configRecord.model as string) : '';
  const agentSystemPrompt = typeof configRecord.systemPrompt === 'string' ? (configRecord.systemPrompt as string) : '';
  const restrictOutput = configRecord.restrictOutput === true;
  const restrictionMessage = typeof configRecord.restrictionMessage === 'string' ? (configRecord.restrictionMessage as string) : '';
  const restrictionMaxInjections = readNumber(configRecord.restrictionMaxInjections);
  const queueConfig = useMemo(() => readQueueConfig(config), [config]);
  const summarizationConfig = useMemo(() => readSummarizationConfig(config), [config]);

  const slackAppReference = useMemo(() => readReferenceValue(configRecord.app_token), [configRecord.app_token]);
  const slackBotReference = useMemo(() => readReferenceValue(configRecord.bot_token), [configRecord.bot_token]);

  const mcpRequestTimeout = readNumber(configRecord.requestTimeoutMs);
  const mcpStartupTimeout = readNumber(configRecord.startupTimeoutMs);
  const mcpHeartbeatInterval = readNumber(configRecord.heartbeatIntervalMs);
  const mcpStaleTimeout = readNumber(configRecord.staleTimeoutMs);
  const restartConfig = useMemo(
    () => (isRecord(configRecord.restart) ? (configRecord.restart as Record<string, unknown>) : {}),
    [configRecord.restart],
  );
  const mcpRestartMaxAttempts = readNumber(restartConfig.maxAttempts);
  const mcpRestartBackoff = readNumber(restartConfig.backoffMs);

  const workspaceImage = typeof configRecord.image === 'string' ? (configRecord.image as string) : '';
  const workspacePlatform = typeof configRecord.platform === 'string' ? (configRecord.platform as string) : '';
  const workspaceInitialScript =
    typeof configRecord.initialScript === 'string' ? (configRecord.initialScript as string) : '';
  const workspaceEnableDinD = configRecord.enableDinD === true;
  const workspaceTtlSeconds = readNumber(configRecord.ttlSeconds);
  const volumesConfig = isRecord(configRecord.volumes) ? (configRecord.volumes as Record<string, unknown>) : {};
  const volumesEnabled = volumesConfig.enabled === true;
  const volumesMountPath =
    typeof volumesConfig.mountPath === 'string' ? (volumesConfig.mountPath as string) : '/workspace';
  const workspaceNixPackages = useMemo(() => readNixPackages(configRecord.nix), [configRecord.nix]);

  const setVersionLoading = useCallback((name: string, loading: boolean) => {
    setNixVersionLoading((prev) => {
      const next = new Set(prev);
      if (loading) {
        next.add(name);
      } else {
        next.delete(name);
      }
      return next;
    });
  }, []);

  const setPackageResolving = useCallback((name: string, loading: boolean) => {
    setNixResolutionLoading((prev) => {
      const next = new Set(prev);
      if (loading) {
        next.add(name);
      } else {
        next.delete(name);
      }
      return next;
    });
  }, []);

  const fetchNixPackageOptions = useMemo(() => {
    if (!nixPackageSearch) {
      return async (_query: string): Promise<AutocompleteOption[]> => [];
    }
    return async (query: string): Promise<AutocompleteOption[]> => {
      try {
        const result = await nixPackageSearch(query);
        return Array.isArray(result) ? result : [];
      } catch {
        return [];
      }
    };
  }, [nixPackageSearch]);

  const clearPackageState = useCallback((name: string) => {
    setNixVersionOptions((prev) => {
      if (!(name in prev)) return prev;
      const { [name]: _removed, ...rest } = prev;
      return rest;
    });
    setNixErrors((prev) => {
      if (!(name in prev)) return prev;
      const { [name]: _removed, ...rest } = prev;
      return rest;
    });
  }, []);

  const loadPackageVersions = useCallback(
    async (name: string) => {
      if (!fetchNixPackageVersions) {
        return;
      }
      if (nixVersionLoading.has(name)) return;
      setVersionLoading(name, true);
      try {
        const versions = await fetchNixPackageVersions(name);
        setNixVersionOptions((prev) => ({ ...prev, [name]: Array.isArray(versions) ? versions : [] }));
        setNixErrors((prev) => ({ ...prev, [name]: null }));
      } catch {
        setNixErrors((prev) => ({ ...prev, [name]: 'Failed to load versions' }));
      } finally {
        setVersionLoading(name, false);
      }
    },
    [fetchNixPackageVersions, nixVersionLoading, setVersionLoading],
  );

  useEffect(() => {
    if (!fetchNixPackageVersions) return;
    workspaceNixPackages.forEach((pkg) => {
      if (!nixVersionOptions[pkg.name]) {
        void loadPackageVersions(pkg.name);
      }
    });
  }, [workspaceNixPackages, fetchNixPackageVersions, loadPackageVersions, nixVersionOptions]);

  const enabledToolSet = useMemo(() => new Set(enabledTools ?? []), [enabledTools]);
  const toolList = useMemo(() => (Array.isArray(tools) ? tools : []), [tools]);

  const handleEnvAdd = useCallback(() => {
    const next = [...envVars, createEnvVar()];
    onConfigChange?.({ env: serializeEnvVars(next) });
  }, [envVars, onConfigChange]);

  const handleEnvRemove = useCallback(
    (index: number) => {
      const next = envVars.filter((_, idx) => idx !== index);
      onConfigChange?.({ env: serializeEnvVars(next) });
    },
    [envVars, onConfigChange],
  );

  const handleEnvNameChange = useCallback(
    (index: number, value: string) => {
      const next = envVars.map((item, idx) => (idx === index ? { ...item, name: value } : item));
      onConfigChange?.({ env: serializeEnvVars(next) });
    },
    [envVars, onConfigChange],
  );

  const handleEnvValueChange = useCallback(
    (index: number, value: string) => {
      const next = envVars.map((item, idx) => (idx === index ? { ...item, value } : item));
      onConfigChange?.({ env: serializeEnvVars(next) });
      const source = next[index]?.source;
      if (source === 'vault') {
        scheduleSecretFetch(value);
      } else if (source === 'variable') {
        scheduleVariableFetch(value);
      }
    },
    [envVars, onConfigChange, scheduleSecretFetch, scheduleVariableFetch],
  );

  const handleEnvValueFocus = useCallback(
    (index: number) => {
      const current = envVars[index];
      if (!current) return;
      if (current.source === 'vault') {
        fetchSecretNow(current.value);
      } else if (current.source === 'variable') {
        fetchVariableNow(current.value);
      }
    },
    [envVars, fetchSecretNow, fetchVariableNow],
  );

  const handleEnvSourceChange = useCallback(
    (index: number, type: 'text' | 'secret' | 'variable') => {
      const source = fromReferenceSourceType(type);
      const next = envVars.map((item, idx) => (idx === index ? { ...item, source } : item));
      onConfigChange?.({ env: serializeEnvVars(next) });
      const value = next[index]?.value ?? '';
      if (source === 'vault') {
        fetchSecretNow(value);
      } else if (source === 'variable') {
        fetchVariableNow(value);
      }
    },
    [envVars, onConfigChange, fetchSecretNow, fetchVariableNow],
  );

  const handleQueueUpdate = useCallback(
    (partial: Partial<AgentQueueConfig>) => {
      onConfigChange?.(applyQueueUpdate(config, partial));
    },
    [config, onConfigChange],
  );

  const handleSummarizationUpdate = useCallback(
    (partial: Partial<AgentSummarizationConfig>) => {
      onConfigChange?.(applySummarizationUpdate(config, partial));
    },
    [config, onConfigChange],
  );

  const handleNixSelect = useCallback(
    async (option: AutocompleteOption) => {
      if (workspaceNixPackages.some((pkg) => pkg.name === option.value)) {
        setNixPackageQuery('');
        return;
      }
      const nextPackages: WorkspaceNixPackage[] = [
        ...workspaceNixPackages,
        { name: option.value, version: '', commitHash: '', attributePath: '' },
      ];
      onConfigChange?.(applyNixUpdate(config, nextPackages));
      setNixErrors((prev) => ({ ...prev, [option.value]: null }));
      setNixPackageQuery('');
      await loadPackageVersions(option.value);
    },
    [workspaceNixPackages, onConfigChange, config, loadPackageVersions],
  );

  const handleNixRemove = useCallback(
    (index: number) => {
      const pkg = workspaceNixPackages[index];
      if (!pkg) return;
      const next = workspaceNixPackages.filter((_, idx) => idx !== index);
      onConfigChange?.(applyNixUpdate(config, next));
      clearPackageState(pkg.name);
    },
    [workspaceNixPackages, onConfigChange, config, clearPackageState],
  );

  const handleNixVersionChange = useCallback(
    async (index: number, value: string) => {
      const pkg = workspaceNixPackages[index];
      if (!pkg) return;
      const staged = workspaceNixPackages.map((entry, idx) =>
        idx === index ? { ...entry, version: value, commitHash: '', attributePath: '' } : entry,
      );
      onConfigChange?.(applyNixUpdate(config, staged));

      if (!resolveNixPackageSelection) {
        return;
      }

      setPackageResolving(pkg.name, true);
      try {
        const resolved = await resolveNixPackageSelection(pkg.name, value);
        setNixErrors((prev) => ({ ...prev, [pkg.name]: null }));
        const nextResolved = staged.map((entry, idx) =>
          idx === index
            ? {
                name: entry.name,
                version: resolved.version,
                commitHash: resolved.commitHash,
                attributePath: resolved.attributePath,
              }
            : entry,
        );
        onConfigChange?.(applyNixUpdate(config, nextResolved));
      } catch {
        setNixErrors((prev) => ({ ...prev, [pkg.name]: 'Failed to resolve package' }));
      } finally {
        setPackageResolving(pkg.name, false);
      }
    },
    [workspaceNixPackages, onConfigChange, config, resolveNixPackageSelection, setPackageResolving],
  );

  const handleRestartChange = useCallback(
    (partial: Partial<{ maxAttempts: number | undefined; backoffMs: number | undefined }>) => {
      const merged = mergeWithDefined(restartConfig, partial as Record<string, unknown>);
      onConfigChange?.({ restart: merged });
    },
    [restartConfig, onConfigChange],
  );

  const handleVolumesEnabledChange = useCallback(
    (enabled: boolean) => {
      onConfigChange?.(applyVolumesUpdate(config, { enabled }));
    },
    [config, onConfigChange],
  );

  const handleVolumesMountPathChange = useCallback(
    (value: string) => {
      onConfigChange?.(applyVolumesUpdate(config, { mountPath: value }));
    },
    [config, onConfigChange],
  );

  const handleToggleToolInternal = useCallback(
    (toolName: string, enabled: boolean) => {
      onToggleTool?.(toolName, enabled);
    },
    [onToggleTool],
  );

  const mcpEnvEditorProps = useMemo(
    () => ({
      title: 'Environment Variables',
      isOpen: mcpEnvOpen,
      onOpenChange: setMcpEnvOpen,
      envVars,
      onAdd: handleEnvAdd,
      onRemove: handleEnvRemove,
      onNameChange: handleEnvNameChange,
      onValueChange: handleEnvValueChange,
      onValueFocus: handleEnvValueFocus,
      onSourceTypeChange: handleEnvSourceChange,
      secretSuggestions,
      variableSuggestions,
    }),
    [
      envVars,
      handleEnvAdd,
      handleEnvRemove,
      handleEnvNameChange,
      handleEnvValueChange,
      handleEnvValueFocus,
      handleEnvSourceChange,
      mcpEnvOpen,
      secretSuggestions,
      variableSuggestions,
    ],
  );

  const workspaceEnvEditorProps = useMemo(
    () => ({
      title: 'Environment Variables',
      isOpen: workspaceEnvOpen,
      onOpenChange: setWorkspaceEnvOpen,
      envVars,
      onAdd: handleEnvAdd,
      onRemove: handleEnvRemove,
      onNameChange: handleEnvNameChange,
      onValueChange: handleEnvValueChange,
      onValueFocus: handleEnvValueFocus,
      onSourceTypeChange: handleEnvSourceChange,
      secretSuggestions,
      variableSuggestions,
    }),
    [
      envVars,
      handleEnvAdd,
      handleEnvRemove,
      handleEnvNameChange,
      handleEnvValueChange,
      handleEnvValueFocus,
      handleEnvSourceChange,
      workspaceEnvOpen,
      secretSuggestions,
      variableSuggestions,
    ],
  );

  return (
    <div className="w-[420px] bg-white border-l border-[var(--agyn-border-default)] flex flex-col">
      <Header
        title={nodeTitle}
        status={status}
        canProvision={canProvision}
        canDeprovision={canDeprovision}
        isActionPending={isActionPending}
        onProvision={onProvision}
        onDeprovision={onDeprovision}
      />
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="space-y-8">
          <section>
            <FieldLabel label="Title" hint="The display name for this node" />
            <Input value={nodeTitle} onChange={(event) => onConfigChange?.({ title: event.target.value })} size="sm" />
          </section>

          {nodeKind === 'Agent' && (
            <AgentSection
              model={agentModel}
              systemPrompt={agentSystemPrompt}
              restrictOutput={restrictOutput}
              restrictionMessage={restrictionMessage}
              restrictionMaxInjections={restrictionMaxInjections}
              queueConfig={queueConfig}
              summarization={summarizationConfig}
              onModelChange={(value) => onConfigChange?.({ model: value })}
              onSystemPromptChange={(value) => onConfigChange?.({ systemPrompt: value })}
              onRestrictOutputChange={(checked) => onConfigChange?.({ restrictOutput: checked })}
              onRestrictionMessageChange={(value) => onConfigChange?.({ restrictionMessage: value })}
              onRestrictionMaxInjectionsChange={(value) =>
                onConfigChange?.({ restrictionMaxInjections: value })
              }
              onQueueConfigChange={handleQueueUpdate}
              onSummarizationChange={handleSummarizationUpdate}
            />
          )}

          {nodeKind === 'Trigger' && (
            <TriggerSection
              appToken={slackAppReference.value}
              botToken={slackBotReference.value}
              onAppTokenChange={(value) => {
                onConfigChange?.({ app_token: writeReferenceValue(slackAppReference.raw, value) });
                scheduleSecretFetch(value);
              }}
              onAppTokenFocus={() => fetchSecretNow(slackAppReference.value)}
              onBotTokenChange={(value) => {
                onConfigChange?.({ bot_token: writeReferenceValue(slackBotReference.raw, value) });
                scheduleSecretFetch(value);
              }}
              onBotTokenFocus={() => fetchSecretNow(slackBotReference.value)}
              secretSuggestions={secretSuggestions}
            />
          )}

          {nodeKind === 'MCP' && (
            <McpSection
              namespace={typeof configRecord.namespace === 'string' ? (configRecord.namespace as string) : ''}
              command={typeof configRecord.command === 'string' ? (configRecord.command as string) : ''}
              workdir={typeof configRecord.workdir === 'string' ? (configRecord.workdir as string) : ''}
              onNamespaceChange={(value) => onConfigChange?.({ namespace: value })}
              onCommandChange={(value) => onConfigChange?.({ command: value })}
              onWorkdirChange={(value) => onConfigChange?.({ workdir: value })}
              envEditorProps={mcpEnvEditorProps}
              limitsOpen={mcpLimitsOpen}
              onLimitsOpenChange={setMcpLimitsOpen}
              limits={{
                requestTimeoutMs: mcpRequestTimeout,
                startupTimeoutMs: mcpStartupTimeout,
                heartbeatIntervalMs: mcpHeartbeatInterval,
                staleTimeoutMs: mcpStaleTimeout,
                restartMaxAttempts: mcpRestartMaxAttempts,
                restartBackoffMs: mcpRestartBackoff,
              }}
              onLimitChange={(key, value) => {
                if (key === 'restartMaxAttempts') {
                  handleRestartChange({ maxAttempts: value });
                  return;
                }
                if (key === 'restartBackoffMs') {
                  handleRestartChange({ backoffMs: value });
                  return;
                }
                onConfigChange?.({ [key]: value });
              }}
              tools={{
                items: toolList,
                enabled: enabledToolSet,
                loading: toolsLoading,
                onToggle: handleToggleToolInternal,
              }}
            />
          )}

          {nodeKind === 'Workspace' && (
            <WorkspaceSection
              image={workspaceImage}
              platform={workspacePlatform}
              onImageChange={(value) => onConfigChange?.({ image: value })}
              onPlatformChange={(value) => onConfigChange?.({ platform: value })}
              initialScript={workspaceInitialScript}
              onInitialScriptChange={(value) => onConfigChange?.({ initialScript: value })}
              envEditorProps={workspaceEnvEditorProps}
              enableDinD={workspaceEnableDinD}
              onEnableDinDChange={(checked) => onConfigChange?.({ enableDinD: checked })}
              volumesEnabled={volumesEnabled}
              onVolumesEnabledChange={handleVolumesEnabledChange}
              volumesMountPath={volumesMountPath}
              onVolumesMountPathChange={handleVolumesMountPathChange}
              ttlSeconds={workspaceTtlSeconds}
              onTtlChange={(value) => onConfigChange?.({ ttlSeconds: value })}
              nixProps={{
                query: nixPackageQuery,
                onQueryChange: setNixPackageQuery,
                fetchOptions: fetchNixPackageOptions,
                packages: workspaceNixPackages,
                versionOptions: nixVersionOptions,
                versionLoading: nixVersionLoading,
                resolutionLoading: nixResolutionLoading,
                errors: nixErrors,
                onSelectOption: handleNixSelect,
                onRemove: handleNixRemove,
                onVersionChange: handleNixVersionChange,
              }}
              nixOpen={nixPackagesOpen}
              onNixOpenChange={setNixPackagesOpen}
            />
          )}
        </div>
      </div>
    </div>
  );
}

export default memo(NodePropertiesSidebar);
export type { NodeConfig, NodeState, NodePropertiesSidebarProps };
