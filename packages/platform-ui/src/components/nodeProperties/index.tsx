import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Input } from '../Input';
import { Dropdown } from '../Dropdown';
import type { AutocompleteOption } from '../AutocompleteInput';

import { Header } from './Header';
import { FieldLabel } from './FieldLabel';
import { AgentSection } from './AgentSection';
import { TriggerSection } from './TriggerSection';
import { McpSection } from './McpSection';
import { WorkspaceSection } from './WorkspaceSection';
import { ToolSection } from './ToolSection';
import { computeAgentDefaultTitle } from '../../utils/agentDisplay';
import {
  applyNixUpdate,
  applyQueueUpdate,
  applySummarizationUpdate,
  applyVolumesUpdate,
  createEnvVar,
  fromReferenceSourceType,
  isValidToolName,
  isRecord,
  mergeWithDefined,
  readEnvList,
  readNixFlakeRepos,
  readNixPackages,
  readNumber,
  readQueueConfig,
  readReferenceValue,
  readSummarizationConfig,
  serializeEnvVars,
  writeReferenceValue,
  toNumberOrUndefined,
} from './utils';
import { getCanonicalToolName } from './toolCanonicalNames';
import { TOOL_NAME_HINT } from './toolNameHint';
import type {
  AgentQueueConfig,
  AgentSummarizationConfig,
  NodeConfig,
  NodePropertiesSidebarProps,
  NodeState,
  WorkspaceFlakeRepo,
  WorkspaceNixPackage,
} from './types';

type SuggestionFetcher = {
  suggestions: string[];
  fetchNow: (query: string) => void;
  scheduleFetch: (query: string) => void;
};

type ToolLimitKey =
  | 'executionTimeoutMs'
  | 'idleTimeoutMs'
  | 'outputLimitChars'
  | 'chunkCoalesceMs'
  | 'chunkSizeBytes'
  | 'clientBufferLimitBytes';

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
  displayTitle,
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
  const { kind: nodeKind, title: nodeTitle, template } = config;
  const nodeTitleValue = typeof nodeTitle === 'string' ? nodeTitle : '';
  const { status } = state;
  const configRecord = config as Record<string, unknown>;
  const configTemplate = typeof template === 'string' ? template : undefined;
  const recordTemplate =
    typeof configRecord.template === 'string' ? (configRecord.template as string) : undefined;
  const nodeTemplate = configTemplate ?? recordTemplate;
  const isShellTool = nodeKind === 'Tool' && nodeTemplate === 'shellTool';
  const isManageTool = nodeKind === 'Tool' && nodeTemplate === 'manageTool';

  const [toolEnvOpen, setToolEnvOpen] = useState(true);
  const [workspaceEnvOpen, setWorkspaceEnvOpen] = useState(true);
  const [mcpEnvOpen, setMcpEnvOpen] = useState(true);
  const [nixPackagesOpen, setNixPackagesOpen] = useState(true);
  const [toolLimitsOpen, setToolLimitsOpen] = useState(false);
  const [mcpLimitsOpen, setMcpLimitsOpen] = useState(false);
  const [nixPackageQuery, setNixPackageQuery] = useState('');
  const [nixVersionOptions, setNixVersionOptions] = useState<Record<string, string[]>>({});
  const [nixVersionLoading, setNixVersionLoading] = useState<Set<string>>(() => new Set());
  const [nixResolutionLoading, setNixResolutionLoading] = useState<Set<string>>(() => new Set());
  const [nixErrors, setNixErrors] = useState<Record<string, string | null>>({});
  const toolName = typeof configRecord.name === 'string' ? (configRecord.name as string) : '';
  const [toolNameInput, setToolNameInput] = useState(toolName);
  const [toolNameError, setToolNameError] = useState<string | null>(null);

  const secretFetcher = useSuggestionFetcher(secretSuggestionProvider, providerDebounceMs);
  const variableFetcher = useSuggestionFetcher(variableSuggestionProvider, providerDebounceMs);

  const { suggestions: secretSuggestions, fetchNow: fetchSecretNow, scheduleFetch: scheduleSecretFetch } = secretFetcher;
  const {
    suggestions: variableSuggestions,
    fetchNow: fetchVariableNow,
    scheduleFetch: scheduleVariableFetch,
  } = variableFetcher;

  const envVars = useMemo(() => readEnvList(configRecord.env), [configRecord.env]);
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
  const logToPid1Enabled =
    typeof configRecord.logToPid1 === 'boolean' ? (configRecord.logToPid1 as boolean) : true;
  const manageModeValue = configRecord.mode === 'async' ? 'async' : 'sync';
  const manageTimeoutMs = readNumber(configRecord.timeoutMs);
  const agentNameValue = typeof configRecord.name === 'string' ? (configRecord.name as string) : '';
  const agentRoleValue = typeof configRecord.role === 'string' ? (configRecord.role as string) : '';
  const [agentNameInput, setAgentNameInput] = useState(agentNameValue);
  const [agentRoleInput, setAgentRoleInput] = useState(agentRoleValue);
  const [agentNameDirty, setAgentNameDirty] = useState(false);
  const [agentRoleDirty, setAgentRoleDirty] = useState(false);

  useEffect(() => {
    if (agentNameDirty) {
      return;
    }
    setAgentNameInput(agentNameValue);
  }, [agentNameValue, agentNameDirty]);

  useEffect(() => {
    if (agentRoleDirty) {
      return;
    }
    setAgentRoleInput(agentRoleValue);
  }, [agentRoleValue, agentRoleDirty]);

  const agentDefaultTitle = useMemo(
    () => computeAgentDefaultTitle(agentNameInput.trim(), agentRoleInput.trim(), 'Agent'),
    [agentNameInput, agentRoleInput],
  );
  const headerTitle = useMemo(() => {
    const providedDisplay = typeof displayTitle === 'string' ? displayTitle.trim() : '';
    if (providedDisplay.length > 0) return providedDisplay;

    if (nodeKind === 'Agent') {
      const trimmedConfigTitle = nodeTitleValue.trim();
      return trimmedConfigTitle.length > 0 ? trimmedConfigTitle : agentDefaultTitle;
    }

    return nodeTitleValue.trim();
  }, [displayTitle, nodeKind, nodeTitleValue, agentDefaultTitle]);
  const agentModelValue = typeof configRecord.model === 'string' ? (configRecord.model as string) : '';
  const agentSystemPromptValue =
    typeof configRecord.systemPrompt === 'string' ? (configRecord.systemPrompt as string) : '';
  const agentRestrictOutput = configRecord.restrictOutput === true;
  const agentRestrictionMessageValue =
    typeof configRecord.restrictionMessage === 'string' ? (configRecord.restrictionMessage as string) : '';
  const agentRestrictionMaxInjectionsValue = readNumber(configRecord.restrictionMaxInjections);
  const agentQueueConfig = useMemo<AgentQueueConfig>(
    () => (nodeKind === 'Agent' ? readQueueConfig(config) : {}),
    [config, nodeKind],
  );
  const agentSummarizationConfig = useMemo<AgentSummarizationConfig>(
    () => (nodeKind === 'Agent' ? readSummarizationConfig(config) : {}),
    [config, nodeKind],
  );

  const handleConfigChange = useCallback(
    (partial: Partial<NodeConfig>) => {
      if (!onConfigChange) return;
      if (nodeKind !== 'Agent') {
        onConfigChange(partial);
        return;
      }

      if (!Object.prototype.hasOwnProperty.call(partial, 'title')) {
        onConfigChange(partial);
        return;
      }

      const record = partial as Record<string, unknown>;
      const rawTitle = record.title;
      const stringTitle = typeof rawTitle === 'string' ? rawTitle : '';
      const trimmedTitle = stringTitle.trim();
      onConfigChange({ ...partial, title: trimmedTitle });
    },
    [onConfigChange, nodeKind],
  );

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
  const workspaceCpuLimit =
    typeof configRecord.cpu_limit === 'string'
      ? (configRecord.cpu_limit as string)
      : typeof configRecord.cpu_limit === 'number'
      ? String(configRecord.cpu_limit)
      : undefined;
  const workspaceMemoryLimit =
    typeof configRecord.memory_limit === 'string'
      ? (configRecord.memory_limit as string)
      : typeof configRecord.memory_limit === 'number'
      ? String(configRecord.memory_limit)
      : undefined;
  const workspaceTtlSeconds = readNumber(configRecord.ttlSeconds);
  const volumesConfig = isRecord(configRecord.volumes) ? (configRecord.volumes as Record<string, unknown>) : {};
  const volumesEnabled = volumesConfig.enabled === true;
  const volumesMountPath =
    typeof volumesConfig.mountPath === 'string' ? (volumesConfig.mountPath as string) : '/workspace';
  const workspaceNixPackages = useMemo(() => readNixPackages(configRecord.nix), [configRecord.nix]);
  const workspaceFlakeRepos = useMemo(() => readNixFlakeRepos(configRecord.nix), [configRecord.nix]);

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

  const handleAgentNameChange = useCallback((value: string) => {
    setAgentNameDirty(true);
    setAgentNameInput(value);
    const trimmed = value.trim();
    const normalizedNext = trimmed.length > 0 ? trimmed : undefined;
    const normalizedCurrent = agentNameValue.length > 0 ? agentNameValue : undefined;
    if (normalizedNext === normalizedCurrent) {
      return;
    }
    handleConfigChange({ name: normalizedNext });
  }, [agentNameValue, handleConfigChange]);

  const handleAgentNameBlur = useCallback(() => {
    const trimmed = agentNameInput.trim();
    const nextInputValue = trimmed.length > 0 ? trimmed : '';
    setAgentNameInput(nextInputValue);
    setAgentNameDirty(false);

    const normalizedNext = trimmed.length > 0 ? trimmed : undefined;
    const normalizedCurrent = agentNameValue.length > 0 ? agentNameValue : undefined;
    if (normalizedNext === normalizedCurrent) {
      return;
    }

    handleConfigChange({ name: normalizedNext });
  }, [agentNameInput, agentNameValue, handleConfigChange]);

  const handleAgentRoleChange = useCallback((value: string) => {
    setAgentRoleDirty(true);
    setAgentRoleInput(value);
    const trimmed = value.trim();
    const normalizedNext = trimmed.length > 0 ? trimmed : undefined;
    const normalizedCurrent = agentRoleValue.length > 0 ? agentRoleValue : undefined;
    if (normalizedNext === normalizedCurrent) {
      return;
    }
    handleConfigChange({ role: normalizedNext });
  }, [agentRoleValue, handleConfigChange]);

  const handleAgentRoleBlur = useCallback(() => {
    const trimmed = agentRoleInput.trim();
    const nextInputValue = trimmed.length > 0 ? trimmed : '';
    setAgentRoleInput(nextInputValue);
    setAgentRoleDirty(false);

    const normalizedNext = trimmed.length > 0 ? trimmed : undefined;
    const normalizedCurrent = agentRoleValue.length > 0 ? agentRoleValue : undefined;
    if (normalizedNext === normalizedCurrent) {
      return;
    }

    handleConfigChange({ role: normalizedNext });
  }, [agentRoleInput, agentRoleValue, handleConfigChange]);

  const handleAgentModelChange = useCallback(
    (value: string) => {
      const trimmed = value.trim();
      onConfigChange?.({ model: trimmed });
    },
    [onConfigChange],
  );

  const handleAgentSystemPromptChange = useCallback(
    (value: string) => {
      onConfigChange?.({ systemPrompt: value });
    },
    [onConfigChange],
  );

  const handleAgentRestrictOutputChange = useCallback(
    (checked: boolean) => {
      onConfigChange?.({ restrictOutput: checked });
    },
    [onConfigChange],
  );

  const handleAgentRestrictionMessageChange = useCallback(
    (value: string) => {
      const trimmed = value.trim();
      onConfigChange?.({ restrictionMessage: trimmed.length > 0 ? trimmed : undefined });
    },
    [onConfigChange],
  );

  const handleAgentRestrictionMaxInjectionsChange = useCallback(
    (value: number | undefined) => {
      onConfigChange?.({ restrictionMaxInjections: value ?? undefined });
    },
    [onConfigChange],
  );

  const handleAgentQueueConfigChange = useCallback(
    (partial: Partial<AgentQueueConfig>) => {
      onConfigChange?.(applyQueueUpdate(config, partial));
    },
    [config, onConfigChange],
  );

  const handleAgentSummarizationChange = useCallback(
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
        {
          kind: 'nixpkgs',
          name: option.value,
          version: '',
          commitHash: '',
          attributePath: '',
        },
      ];
      onConfigChange?.(applyNixUpdate(config, nextPackages, workspaceFlakeRepos));
      setNixErrors((prev) => ({ ...prev, [option.value]: null }));
      setNixPackageQuery('');
      await loadPackageVersions(option.value);
    },
    [workspaceNixPackages, workspaceFlakeRepos, onConfigChange, config, loadPackageVersions],
  );

  const handleNixRemove = useCallback(
    (index: number) => {
      const pkg = workspaceNixPackages[index];
      if (!pkg) return;
      const next = workspaceNixPackages.filter((_, idx) => idx !== index);
      onConfigChange?.(applyNixUpdate(config, next, workspaceFlakeRepos));
      clearPackageState(pkg.name);
    },
    [workspaceNixPackages, workspaceFlakeRepos, onConfigChange, config, clearPackageState],
  );

  const handleNixVersionChange = useCallback(
    async (index: number, value: string) => {
      const pkg = workspaceNixPackages[index];
      if (!pkg) return;
      const staged = workspaceNixPackages.map((entry, idx) =>
        idx === index ? { ...entry, version: value, commitHash: '', attributePath: '' } : entry,
      );
      onConfigChange?.(applyNixUpdate(config, staged, workspaceFlakeRepos));

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
                ...entry,
                version: resolved.version,
                commitHash: resolved.commitHash,
                attributePath: resolved.attributePath,
              }
            : entry,
        );
        onConfigChange?.(applyNixUpdate(config, nextResolved, workspaceFlakeRepos));
      } catch {
        setNixErrors((prev) => ({ ...prev, [pkg.name]: 'Failed to resolve package' }));
      } finally {
        setPackageResolving(pkg.name, false);
      }
    },
    [workspaceNixPackages, workspaceFlakeRepos, onConfigChange, config, resolveNixPackageSelection, setPackageResolving],
  );

  const handleRepoPackagesChange = useCallback(
    (nextRepos: WorkspaceFlakeRepo[]) => {
      onConfigChange?.(applyNixUpdate(config, workspaceNixPackages, nextRepos));
    },
    [config, onConfigChange, workspaceNixPackages],
  );

  const handleRestartChange = useCallback(
    (partial: Partial<{ maxAttempts: number | undefined; backoffMs: number | undefined }>) => {
      const merged = mergeWithDefined(restartConfig, partial as Record<string, unknown>);
      onConfigChange?.({ restart: merged });
    },
    [restartConfig, onConfigChange],
  );

  const handleWorkspaceCpuLimitChange = useCallback(
    (value: string | undefined) => {
      onConfigChange?.({ cpu_limit: value });
    },
    [onConfigChange],
  );

  const handleWorkspaceMemoryLimitChange = useCallback(
    (value: string | undefined) => {
      onConfigChange?.({ memory_limit: value });
    },
    [onConfigChange],
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

  const handleToolLimitChange = useCallback(
    (key: ToolLimitKey, value: number | undefined) => {
      onConfigChange?.({ [key]: value } as Partial<NodeConfig>);
    },
    [onConfigChange],
  );

  const handleToolWorkdirChange = useCallback(
    (value: string) => {
      onConfigChange?.({ workdir: value });
    },
    [onConfigChange],
  );

  const handleLogToPid1Change = useCallback(
    (checked: boolean) => {
      onConfigChange?.({ logToPid1: checked });
    },
    [onConfigChange],
  );

  const handleToggleToolInternal = useCallback(
    (toolName: string, enabled: boolean) => {
      onToggleTool?.(toolName, enabled);
    },
    [onToggleTool],
  );

  const toolEnvEditorProps = useMemo(
    () => ({
      title: 'Environment Variables',
      isOpen: toolEnvOpen,
      onOpenChange: setToolEnvOpen,
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
      secretSuggestions,
      toolEnvOpen,
      variableSuggestions,
    ],
  );

  useEffect(() => {
    setToolNameInput(toolName);
    setToolNameError(null);
  }, [toolName]);

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
        title={headerTitle}
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
            <Input
              value={nodeTitleValue}
              onChange={(event) => handleConfigChange({ title: event.target.value })}
              size="sm"
              placeholder={nodeKind === 'Agent' ? agentDefaultTitle : undefined}
            />
          </section>

          {nodeKind === 'Tool' && (
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
          )}

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

          {nodeKind === 'Agent' && (
            <AgentSection
              name={agentNameInput}
              role={agentRoleInput}
              model={agentModelValue}
              systemPrompt={agentSystemPromptValue}
              restrictOutput={agentRestrictOutput}
              restrictionMessage={agentRestrictionMessageValue}
              restrictionMaxInjections={agentRestrictionMaxInjectionsValue}
              queueConfig={agentQueueConfig}
              summarization={agentSummarizationConfig}
              onNameChange={handleAgentNameChange}
              onNameBlur={handleAgentNameBlur}
              onRoleChange={handleAgentRoleChange}
              onRoleBlur={handleAgentRoleBlur}
              onModelChange={handleAgentModelChange}
              onSystemPromptChange={handleAgentSystemPromptChange}
              onRestrictOutputChange={handleAgentRestrictOutputChange}
              onRestrictionMessageChange={handleAgentRestrictionMessageChange}
              onRestrictionMaxInjectionsChange={handleAgentRestrictionMaxInjectionsChange}
              onQueueConfigChange={handleAgentQueueConfigChange}
              onSummarizationChange={handleAgentSummarizationChange}
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

          {isShellTool && (
            <ToolSection
              workdir={toolWorkdir}
              onWorkdirChange={handleToolWorkdirChange}
              envEditorProps={toolEnvEditorProps}
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
              cpuLimit={workspaceCpuLimit}
              onCpuLimitChange={handleWorkspaceCpuLimitChange}
              memoryLimit={workspaceMemoryLimit}
              onMemoryLimitChange={handleWorkspaceMemoryLimitChange}
              ttlSeconds={workspaceTtlSeconds}
              onTtlChange={(value) => onConfigChange?.({ ttlSeconds: value })}
              nixProps={{
                query: nixPackageQuery,
                onQueryChange: setNixPackageQuery,
                fetchOptions: fetchNixPackageOptions,
                packages: workspaceNixPackages,
                repoEntries: workspaceFlakeRepos,
                versionOptions: nixVersionOptions,
                versionLoading: nixVersionLoading,
                resolutionLoading: nixResolutionLoading,
                errors: nixErrors,
                onSelectOption: handleNixSelect,
                onRemove: handleNixRemove,
                onVersionChange: handleNixVersionChange,
                onRepoEntriesChange: handleRepoPackagesChange,
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
