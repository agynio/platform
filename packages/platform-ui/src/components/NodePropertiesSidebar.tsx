import { Info, Play, Square, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { memo, useState, useCallback, useEffect, useMemo, type ReactNode } from 'react';

import { Input } from './Input';
import { Textarea } from './Textarea';
import { MarkdownInput } from './MarkdownInput';
import { Dropdown } from './Dropdown';
import { Button } from './Button';
import { Toggle } from './Toggle';
import { Tooltip, TooltipTrigger, TooltipContent } from './ui/tooltip';
import Badge from './Badge';
import { IconButton } from './IconButton';
import { ReferenceInput } from './ReferenceInput';
import { BashInput } from './BashInput';
import { AutocompleteInput } from './AutocompleteInput';
import type { AutocompleteOption } from './AutocompleteInput';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from './ui/collapsible';
import { ToolItem } from './ToolItem';
import { getConfigView } from './configViews/registry';

type NodeStatus =
  | 'not_ready'
  | 'provisioning'
  | 'ready'
  | 'deprovisioning'
  | 'provisioning_error'
  | 'deprovisioning_error';

type NodeKind = 'Agent' | 'Tool' | 'MCP' | 'Trigger' | 'Workspace';

export interface NodeConfig extends Record<string, unknown> {
  kind: NodeKind;
  title: string;
}

export interface NodeState extends Record<string, unknown> {
  status: NodeStatus;
}

type ReferenceConfigValue = string | Record<string, unknown>;

type EnvVar = {
  key: string;
  value: string;
  source: 'static' | 'vault' | 'variable';
};

type WorkspaceNixPackage = {
  name: string;
  version: string;
  commitHash: string;
  attributePath: string;
};

type AgentQueueConfig = {
  debounceMs?: number;
  whenBusy?: 'wait' | 'injectAfterTools';
  processBuffer?: 'allTogether' | 'oneByOne';
};

type AgentSummarizationConfig = {
  keepTokens?: number;
  maxTokens?: number;
  prompt?: string;
};

interface McpToolDescriptor {
  name: string;
  title?: string | null;
  description?: string | null;
}

type SimpleOption = { value: string; label: string };

export type CustomConfigViewRender = (props: {
  value: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
  readOnly?: boolean;
  disabled?: boolean;
}) => ReactNode;

const QUEUE_WHEN_BUSY_OPTIONS: SimpleOption[] = [
  { value: 'wait', label: 'Wait' },
  { value: 'injectAfterTools', label: 'Inject After Tools' },
];

const QUEUE_PROCESS_BUFFER_OPTIONS: SimpleOption[] = [
  { value: 'allTogether', label: 'All Together' },
  { value: 'oneByOne', label: 'One By One' },
];

const WORKSPACE_PLATFORM_OPTIONS: SimpleOption[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'linux/amd64', label: 'Linux AMD64' },
  { value: 'linux/arm64', label: 'Linux ARM64' },
];

interface NodePropertiesSidebarProps {
  config: NodeConfig;
  state: NodeState;
  onConfigChange?: (updates: Partial<NodeConfig>) => void;
  tools?: McpToolDescriptor[];
  enabledTools?: string[] | null;
  onToggleTool?: (toolName: string, nextEnabled: boolean) => void;
  toolsLoading?: boolean;
  nixPackageSearch?: (query: string) => Promise<AutocompleteOption[]>;
  fetchNixPackageVersions?: (name: string) => Promise<string[]>;
  resolveNixPackageSelection?: (name: string, version: string) => Promise<{
    version: string;
    commitHash: string;
    attributePath: string;
  }>;
  secretSuggestionProvider?: (query: string) => Promise<string[]>;
  variableSuggestionProvider?: (query: string) => Promise<string[]>;
  providerDebounceMs?: number;
  customConfigView?: CustomConfigViewRender;
  templateName?: string;
  nodeId?: string;
}

const statusConfig: Record<NodeStatus, { label: string; color: string; bgColor: string }> = {
  not_ready: { label: 'Not Ready', color: 'var(--agyn-gray)', bgColor: 'var(--agyn-bg-light)' },
  provisioning: { label: 'Provisioning', color: 'var(--agyn-status-running)', bgColor: 'var(--agyn-status-running-bg)' },
  ready: { label: 'Ready', color: 'var(--agyn-status-finished)', bgColor: 'var(--agyn-status-finished-bg)' },
  deprovisioning: { label: 'Deprovisioning', color: 'var(--agyn-status-pending)', bgColor: 'var(--agyn-status-pending-bg)' },
  provisioning_error: { label: 'Provisioning Error', color: 'var(--agyn-status-failed)', bgColor: 'var(--agyn-status-failed-bg)' },
  deprovisioning_error: { label: 'Deprovisioning Error', color: 'var(--agyn-status-failed)', bgColor: 'var(--agyn-status-failed-bg)' },
};

interface FieldLabelProps {
  label: string;
  hint?: string;
  required?: boolean;
}

function FieldLabel({ label, hint, required }: FieldLabelProps) {
  return (
    <div className="flex items-center gap-1 mb-2">
      <label className="text-sm text-[var(--agyn-dark)]">
        {label}
        {required && <span className="text-[var(--agyn-status-failed)]">*</span>}
      </label>
      {hint && (
        <Tooltip>
          <TooltipTrigger className="cursor-help">
            <Info className="w-3.5 h-3.5 text-[var(--agyn-gray)]" />
          </TooltipTrigger>
          <TooltipContent className="text-xs">{hint}</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function readString<T extends string>(value: unknown): T | undefined {
  return typeof value === 'string' ? (value as T) : undefined;
}

function mergeWithDefined(base: Record<string, unknown>, updates: Record<string, unknown>): Record<string, unknown> {
  const merged = { ...base, ...updates };
  return Object.fromEntries(Object.entries(merged).filter(([, val]) => val !== undefined));
}

function readReferenceValue(raw: unknown): { value: string; raw: ReferenceConfigValue } {
  if (typeof raw === 'string') return { value: raw, raw };
  if (isRecord(raw)) {
    const value = typeof raw.value === 'string' ? raw.value : '';
    return { value, raw: raw as Record<string, unknown> };
  }
  return { value: '', raw: '' };
}

function writeReferenceValue(prev: ReferenceConfigValue, nextValue: string): ReferenceConfigValue {
  if (typeof prev === 'string') {
    return nextValue;
  }
  if (isRecord(prev)) {
    return { ...prev, value: nextValue };
  }
  return nextValue;
}

function readEnvList(raw: unknown): EnvVar[] {
  if (Array.isArray(raw)) {
    return raw.map((item) => {
      if (!isRecord(item)) return { key: '', value: '', source: 'static' } satisfies EnvVar;
      const key = typeof item.key === 'string' ? item.key : typeof item.name === 'string' ? item.name : '';
      const value = typeof item.value === 'string' ? item.value : '';
      const source: EnvVar['source'] = item.source === 'vault'
        ? 'vault'
        : item.source === 'variable'
        ? 'variable'
        : 'static';
      return { key, value, source } satisfies EnvVar;
    });
  }
  if (isRecord(raw)) {
    return Object.entries(raw).map(([key, value]) => ({
      key,
      value: typeof value === 'string' ? value : '',
      source: 'static',
    }));
  }
  return [];
}

function serializeEnvVars(list: EnvVar[]): EnvVar[] {
  return list.map((item) => ({
    key: item.key,
    value: item.value,
    source: item.source ?? 'static',
  }));
}

function toReferenceSourceType(source: EnvVar['source']): 'text' | 'secret' | 'variable' {
  switch (source) {
    case 'vault':
      return 'secret';
    case 'variable':
      return 'variable';
    case 'static':
    default:
      return 'text';
  }
}

function fromReferenceSourceType(type: 'text' | 'secret' | 'variable'): EnvVar['source'] {
  switch (type) {
    case 'secret':
      return 'vault';
    case 'variable':
      return 'variable';
    case 'text':
    default:
      return 'static';
  }
}

function readQueueConfig(config: NodeConfig): AgentQueueConfig {
  const queueRaw = isRecord((config as Record<string, unknown>).queue)
    ? ((config as Record<string, unknown>).queue as Record<string, unknown>)
    : {};
  const debounceMs = readNumber(queueRaw.debounceMs ?? (config as Record<string, unknown>).debounceMs);
  const whenBusy = readString<NonNullable<AgentQueueConfig['whenBusy']>>(
    queueRaw.whenBusy ?? (config as Record<string, unknown>).whenBusy,
  );
  const processBuffer = readString<NonNullable<AgentQueueConfig['processBuffer']>>(
    queueRaw.processBuffer ?? (config as Record<string, unknown>).processBuffer,
  );
  return {
    debounceMs,
    whenBusy,
    processBuffer,
  };
}

function applyQueueUpdate(config: NodeConfig, partial: Partial<AgentQueueConfig>): Partial<NodeConfig> {
  const existingQueue = isRecord((config as Record<string, unknown>).queue)
    ? ((config as Record<string, unknown>).queue as Record<string, unknown>)
    : {};
  const queueUpdates: Record<string, unknown> = { ...partial };
  const mergedQueue = mergeWithDefined(existingQueue, queueUpdates);
  const updates: Partial<NodeConfig> = { queue: mergedQueue };
  if ('debounceMs' in partial) updates.debounceMs = partial.debounceMs;
  if ('whenBusy' in partial) updates.whenBusy = partial.whenBusy;
  if ('processBuffer' in partial) updates.processBuffer = partial.processBuffer;
  return updates;
}

function readSummarizationConfig(config: NodeConfig): AgentSummarizationConfig {
  const summaryRaw = isRecord((config as Record<string, unknown>).summarization)
    ? ((config as Record<string, unknown>).summarization as Record<string, unknown>)
    : {};
  const keepTokens = readNumber(summaryRaw.keepTokens ?? (config as Record<string, unknown>).summarizationKeepTokens);
  const maxTokens = readNumber(summaryRaw.maxTokens ?? (config as Record<string, unknown>).summarizationMaxTokens);
  const prompt = readString<string>(summaryRaw.prompt ?? (config as Record<string, unknown>).summarizationPrompt) ?? '';
  return {
    keepTokens,
    maxTokens,
    prompt,
  };
}

function applySummarizationUpdate(config: NodeConfig, partial: Partial<AgentSummarizationConfig>): Partial<NodeConfig> {
  const existingSummary = isRecord((config as Record<string, unknown>).summarization)
    ? ((config as Record<string, unknown>).summarization as Record<string, unknown>)
    : {};
  const mergedSummary = mergeWithDefined(existingSummary, partial as Record<string, unknown>);
  const updates: Partial<NodeConfig> = { summarization: mergedSummary };
  if ('keepTokens' in partial) updates.summarizationKeepTokens = partial.keepTokens;
  if ('maxTokens' in partial) updates.summarizationMaxTokens = partial.maxTokens;
  if ('prompt' in partial) updates.summarizationPrompt = partial.prompt;
  return updates;
}

function readNixPackages(nixConfig: unknown): WorkspaceNixPackage[] {
  if (!isRecord(nixConfig)) return [];
  const packagesRaw = nixConfig.packages;
  if (!Array.isArray(packagesRaw)) return [];
  return packagesRaw
    .map((pkg) => {
      if (!isRecord(pkg)) return null;
      const name = typeof pkg.name === 'string' ? pkg.name : '';
      if (!name) return null;
      const version = typeof pkg.version === 'string' ? pkg.version : '';
      const commitHash = typeof pkg.commitHash === 'string' ? pkg.commitHash : '';
      const attributePath = typeof pkg.attributePath === 'string' ? pkg.attributePath : '';
      return {
        name,
        version,
        commitHash,
        attributePath,
      } satisfies WorkspaceNixPackage;
    })
    .filter((pkg): pkg is WorkspaceNixPackage => pkg !== null);
}

function applyVolumesUpdate(config: NodeConfig, partial: Partial<{ enabled: boolean; mountPath: string }>): Partial<NodeConfig> {
  const existingVolumes = isRecord((config as Record<string, unknown>).volumes)
    ? ((config as Record<string, unknown>).volumes as Record<string, unknown>)
    : {};
  const mergedVolumes = mergeWithDefined(existingVolumes, partial as Record<string, unknown>);
  return { volumes: mergedVolumes };
}

function applyNixUpdate(config: NodeConfig, packages: WorkspaceNixPackage[]): Partial<NodeConfig> {
  const existingNix = isRecord((config as Record<string, unknown>).nix)
    ? ((config as Record<string, unknown>).nix as Record<string, unknown>)
    : {};
  return {
    nix: {
      ...existingNix,
      packages,
    },
  };
}

function toNumberOrUndefined(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function NodePropertiesSidebarComponent({
  config,
  state,
  onConfigChange,
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
  customConfigView,
  templateName,
  nodeId,
}: NodePropertiesSidebarProps) {
  const { kind: nodeKind, title: nodeTitle } = config;
  const { status } = state;
  const configRecord = config as Record<string, unknown>;

  const registryConfigView = useMemo<CustomConfigViewRender | undefined>(() => {
    if (!templateName) {
      return undefined;
    }
    const ViewComponent = getConfigView(templateName, 'static');
    if (!ViewComponent) {
      return undefined;
    }
    const keyBase = `${templateName}-${nodeId ?? ''}`;
    return ({ value, onChange, readOnly, disabled }) => (
      <ViewComponent
        key={keyBase}
        templateName={templateName}
        value={value}
        onChange={onChange}
        readOnly={readOnly}
        disabled={disabled}
      />
    );
  }, [templateName, nodeId]);

  const effectiveCustomConfigView = customConfigView ?? registryConfigView;

  const customConfigValue = useMemo(() => {
    const { kind: _ignoredKind, ...rest } = configRecord;
    return { ...rest } as Record<string, unknown>;
  }, [configRecord]);

  const handleCustomConfigChange = useCallback(
    (next: Record<string, unknown>) => {
      if (!onConfigChange) return;
      const { kind: _ignored, ...rest } = next;
      onConfigChange(rest as Partial<NodeConfig>);
    },
    [onConfigChange],
  );

  const [workspaceEnvOpen, setWorkspaceEnvOpen] = useState(true);
  const [mcpEnvOpen, setMcpEnvOpen] = useState(true);
  const [nixPackagesOpen, setNixPackagesOpen] = useState(true);
  const [mcpLimitsOpen, setMcpLimitsOpen] = useState(false);
  const [nixPackageQuery, setNixPackageQuery] = useState('');
  const [nixVersionOptions, setNixVersionOptions] = useState<Record<string, string[]>>({});
  const [nixVersionLoading, setNixVersionLoading] = useState<Set<string>>(() => new Set());
  const [nixResolutionLoading, setNixResolutionLoading] = useState<Set<string>>(() => new Set());
  const [nixErrors, setNixErrors] = useState<Record<string, string | null>>({});

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

  const loadPackageVersions = useCallback(
    async (name: string) => {
      if (!fetchNixPackageVersions) return;
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

  const clearPackageState = useCallback(
    (name: string) => {
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
      setVersionLoading(name, false);
      setPackageResolving(name, false);
    },
    [setVersionLoading, setPackageResolving],
  );

  const fallbackTools = useMemo<McpToolDescriptor[]>(() => [], []);
  const toolList = tools ?? fallbackTools;
  const enabledToolSet = useMemo(() => {
    if (enabledTools) {
      return new Set(enabledTools);
    }
    return new Set(toolList.map((tool) => tool.name));
  }, [enabledTools, toolList]);

  const agentModel = typeof configRecord.model === 'string' ? (configRecord.model as string) : '';
  const agentSystemPrompt = typeof configRecord.systemPrompt === 'string' ? (configRecord.systemPrompt as string) : '';
  const restrictOutput = configRecord.restrictOutput === true;
  const restrictionMessage =
    typeof configRecord.restrictionMessage === 'string' ? (configRecord.restrictionMessage as string) : '';
  const restrictionMaxInjections = readNumber(configRecord.restrictionMaxInjections);

  const queueConfig = readQueueConfig(config);
  const summarizationConfig = readSummarizationConfig(config);

  const queueDebounceValue = queueConfig.debounceMs !== undefined ? String(queueConfig.debounceMs) : '';
  const queueWhenBusyValue = queueConfig.whenBusy ?? 'wait';
  const queueProcessBufferValue = queueConfig.processBuffer ?? 'oneByOne';

  const summarizationKeepValue = summarizationConfig.keepTokens !== undefined ? String(summarizationConfig.keepTokens) : '';
  const summarizationMaxValue = summarizationConfig.maxTokens !== undefined ? String(summarizationConfig.maxTokens) : '';
  const summarizationPromptValue = summarizationConfig.prompt ?? '';

  const slackAppReference = readReferenceValue(configRecord.app_token);
  const slackBotReference = readReferenceValue(configRecord.bot_token);

  const mcpNamespace = typeof configRecord.namespace === 'string' ? (configRecord.namespace as string) : '';
  const mcpCommand = typeof configRecord.command === 'string' ? (configRecord.command as string) : '';
  const mcpWorkdir = typeof configRecord.workdir === 'string' ? (configRecord.workdir as string) : '';
  const mcpEnvVars = readEnvList(configRecord.env);
  const mcpRequestTimeout = readNumber(configRecord.requestTimeoutMs);
  const mcpStartupTimeout = readNumber(configRecord.startupTimeoutMs);
  const mcpHeartbeatInterval = readNumber(configRecord.heartbeatIntervalMs);
  const mcpStaleTimeout = readNumber(configRecord.staleTimeoutMs);
  const restartConfig = isRecord(configRecord.restart) ? (configRecord.restart as Record<string, unknown>) : {};
  const mcpRestartMaxAttempts = readNumber(restartConfig.maxAttempts);
  const mcpRestartBackoff = readNumber(restartConfig.backoffMs);

  const workspaceImage = typeof configRecord.image === 'string' ? (configRecord.image as string) : '';
  const workspacePlatform = typeof configRecord.platform === 'string' ? (configRecord.platform as string) : '';
  const workspaceInitialScript =
    typeof configRecord.initialScript === 'string' ? (configRecord.initialScript as string) : '';
  const workspaceCpuLimitValue =
    typeof configRecord.cpu_limit === 'string' || typeof configRecord.cpu_limit === 'number'
      ? String(configRecord.cpu_limit)
      : '';
  const workspaceMemoryLimitValue =
    typeof configRecord.memory_limit === 'string' || typeof configRecord.memory_limit === 'number'
      ? String(configRecord.memory_limit)
      : '';
  const workspaceEnableDinD = configRecord.enableDinD === true;
  const workspaceTtlSeconds = readNumber(configRecord.ttlSeconds);
  const workspaceEnvVars = readEnvList(configRecord.env);
  const volumesConfig = isRecord(configRecord.volumes) ? (configRecord.volumes as Record<string, unknown>) : {};
  const volumesEnabled = volumesConfig.enabled === true;
  const volumesMountPath = typeof volumesConfig.mountPath === 'string' ? (volumesConfig.mountPath as string) : '/workspace';
  const workspaceNixPackages = readNixPackages(configRecord.nix);

  useEffect(() => {
    if (!fetchNixPackageVersions) return;
    workspaceNixPackages.forEach((pkg) => {
      if (!nixVersionOptions[pkg.name]) {
        void loadPackageVersions(pkg.name);
      }
    });
  }, [workspaceNixPackages, fetchNixPackageVersions, loadPackageVersions, nixVersionOptions]);

  const statusInfo = statusConfig[status];
  const canProvision = status === 'not_ready' || status === 'deprovisioning_error';
  const canDeprovision = status === 'ready' || status === 'provisioning_error';

  const handleRestartChange = (partial: Partial<{ maxAttempts: number | undefined; backoffMs: number | undefined }>) => {
    const merged = mergeWithDefined(restartConfig, partial as Record<string, unknown>);
    onConfigChange?.({ restart: merged });
  };

  return (
    <div className="w-[420px] bg-white border-l border-[var(--agyn-border-default)] flex flex-col">
      <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--agyn-border-default)]">
        <div>
          <h2 className="text-[var(--agyn-dark)]">Node Properties</h2>
          <p className="text-sm text-[var(--agyn-gray)] mt-0.5">{nodeTitle}</p>
        </div>
        <div className="flex items-center gap-3">
          <Badge color={statusInfo.color} bgColor={statusInfo.bgColor}>
            {statusInfo.label}
          </Badge>
          <IconButton
            icon={canProvision ? <Play className="w-5 h-5" /> : <Square className="w-5 h-5" />}
            variant="ghost"
            size="md"
            disabled={!canProvision && !canDeprovision}
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="space-y-8">
          {effectiveCustomConfigView ? (
            <section>
              {effectiveCustomConfigView({
                value: customConfigValue,
                onChange: handleCustomConfigChange,
                readOnly: false,
                disabled: false,
              })}
            </section>
          ) : (
            <>
              <section>
                <FieldLabel label="Title" hint="The display name for this node" />
                <Input value={nodeTitle} onChange={(e) => onConfigChange?.({ title: e.target.value })} size="sm" />
              </section>

              {nodeKind === 'Agent' && (
                <>
                  <section>
                    <h3 className="text-[var(--agyn-dark)] mb-4 font-semibold">LLM</h3>
                    <div className="space-y-4">
                      <div>
                        <FieldLabel
                          label="Model"
                          hint="The LLM model identifier (e.g., gpt-4, claude-3-opus)"
                          required
                        />
                        <Input
                          placeholder="gpt-4"
                          value={agentModel}
                          onChange={(e) => onConfigChange?.({ model: e.target.value })}
                          size="sm"
                        />
                      </div>
                      <div>
                        <FieldLabel
                          label="System Prompt"
                          hint="Initial instructions that define the agent's behavior and personality"
                        />
                        <MarkdownInput
                          rows={3}
                          placeholder="You are a helpful assistant..."
                          value={agentSystemPrompt}
                          onChange={(e) => onConfigChange?.({ systemPrompt: e.target.value })}
                          size="sm"
                        />
                      </div>
                    </div>
                  </section>
                  <section>
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="text-[var(--agyn-dark)] font-semibold">Finish Restriction</h3>
                        <p className="text-xs text-[var(--agyn-gray)] mt-1">
                          Do not allow to finish agent work without tool call
                        </p>
                      </div>
                      <Toggle
                        label=""
                        description=""
                        checked={restrictOutput}
                        onCheckedChange={(checked) => onConfigChange?.({ restrictOutput: checked })}
                      />
                    </div>
                    {restrictOutput && (
                      <div className="space-y-4 pl-4 border-l-2 border-[var(--agyn-border-default)]">
                        <div>
                          <FieldLabel
                            label="Restriction Message"
                            hint="Message shown when the agent tries to finish without calling required tools"
                          />
                          <Textarea
                            rows={2}
                            placeholder="You must use at least one tool before finishing."
                            value={restrictionMessage}
                            onChange={(e) => onConfigChange?.({ restrictionMessage: e.target.value })}
                          />
                        </div>
                        <div>
                          <FieldLabel
                            label="Max Injections"
                            hint="Maximum number of times the restriction message can be injected"
                          />
                          <Input
                            type="number"
                            min="0"
                            size="sm"
                            value={restrictionMaxInjections !== undefined ? String(restrictionMaxInjections) : ''}
                            onChange={(e) =>
                              onConfigChange?.({ restrictionMaxInjections: toNumberOrUndefined(e.target.value) })
                            }
                          />
                        </div>
                      </div>
                    )}
                  </section>
                  <section>
                    <h3 className="text-[var(--agyn-dark)] mb-4 font-semibold">Messages Queue</h3>
                    <div className="space-y-4">
                      <div>
                        <FieldLabel
                          label="Debounce (ms)"
                          hint="Wait time in milliseconds before processing new messages"
                        />
                        <Input
                          type="number"
                          placeholder="1000"
                          min="0"
                          step="100"
                          size="sm"
                          value={queueDebounceValue}
                          onChange={(e) =>
                            onConfigChange?.(
                              applyQueueUpdate(config, { debounceMs: toNumberOrUndefined(e.target.value) }),
                            )
                          }
                        />
                      </div>
                      <div>
                        <FieldLabel
                          label="When Busy"
                          hint="Behavior when a new message arrives while agent is processing"
                        />
                        <Dropdown
                          options={QUEUE_WHEN_BUSY_OPTIONS}
                          value={queueWhenBusyValue}
                          onValueChange={(value) =>
                            onConfigChange?.(
                              applyQueueUpdate(config, { whenBusy: value as AgentQueueConfig['whenBusy'] }),
                            )
                          }
                          size="sm"
                        />
                      </div>
                      <div>
                        <FieldLabel
                          label="Process Buffer"
                          hint="How to process multiple queued messages"
                        />
                        <Dropdown
                          options={QUEUE_PROCESS_BUFFER_OPTIONS}
                          value={queueProcessBufferValue}
                          onValueChange={(value) =>
                            onConfigChange?.(
                              applyQueueUpdate(config, { processBuffer: value as AgentQueueConfig['processBuffer'] }),
                            )
                          }
                          size="sm"
                        />
                      </div>
                    </div>
                  </section>
                  <section>
                    <h3 className="text-[var(--agyn-dark)] mb-4 font-semibold">Summarization</h3>
                    <div className="space-y-4">
                      <div>
                        <FieldLabel
                          label="Keep Tokens"
                          hint="Number of tokens to preserve from the start of the conversation"
                        />
                        <Input
                          type="number"
                          placeholder="1000"
                          min="0"
                          step="100"
                          size="sm"
                          value={summarizationKeepValue}
                          onChange={(e) =>
                            onConfigChange?.(
                              applySummarizationUpdate(config, { keepTokens: toNumberOrUndefined(e.target.value) }),
                            )
                          }
                        />
                      </div>
                      <div>
                        <FieldLabel
                          label="Max Tokens"
                          hint="Maximum tokens before triggering summarization"
                        />
                        <Input
                          type="number"
                          placeholder="4000"
                          min="0"
                          step="100"
                          size="sm"
                          value={summarizationMaxValue}
                          onChange={(e) =>
                            onConfigChange?.(
                              applySummarizationUpdate(config, { maxTokens: toNumberOrUndefined(e.target.value) }),
                            )
                          }
                        />
                      </div>
                      <div>
                        <FieldLabel
                          label="Prompt"
                          hint="Instructions for how to summarize the conversation"
                        />
                        <Textarea
                          rows={2}
                          placeholder="Summarize the conversation above..."
                          value={summarizationPromptValue}
                          onChange={(e) =>
                            onConfigChange?.(applySummarizationUpdate(config, { prompt: e.target.value }))
                          }
                        />
                      </div>
                    </div>
                  </section>
                </>
              )}

              {nodeKind === 'Trigger' && (
                <section>
                  <h3 className="text-[var(--agyn-dark)] mb-4 font-semibold">Slack Configuration</h3>
                  <div className="space-y-4">
                    <div>
                      <FieldLabel
                        label="App Token"
                        hint="Slack App-Level token for connecting to the Events API"
                        required
                      />
                      <ReferenceInput
                        value={slackAppReference.value}
                        onChange={(e) =>
                          onConfigChange?.({ app_token: writeReferenceValue(slackAppReference.raw, e.target.value) })
                        }
                        sourceType="secret"
                        secretProvider={secretSuggestionProvider}
                        providerDebounceMs={providerDebounceMs}
                        placeholder="Select or enter app token..."
                        size="sm"
                      />
                    </div>
                    <div>
                      <FieldLabel
                        label="Bot Token"
                        hint="Slack Bot User OAuth token for authentication"
                        required
                      />
                      <ReferenceInput
                        value={slackBotReference.value}
                        onChange={(e) =>
                          onConfigChange?.({ bot_token: writeReferenceValue(slackBotReference.raw, e.target.value) })
                        }
                        sourceType="secret"
                        secretProvider={secretSuggestionProvider}
                        providerDebounceMs={providerDebounceMs}
                        placeholder="Select or enter bot token..."
                        size="sm"
                      />
                    </div>
                  </div>
                </section>
              )}
            </>
          )}

          {nodeKind === 'MCP' && !effectiveCustomConfigView && (
            <>
              <section>
                <div className="space-y-4">
                  <div>
                    <FieldLabel label="Namespace" hint="Namespace for the MCP server" required />
                    <Input
                      placeholder="my-mcp-server"
                      value={mcpNamespace}
                      onChange={(e) => onConfigChange?.({ namespace: e.target.value })}
                      size="sm"
                    />
                  </div>
                  <div>
                    <FieldLabel label="Command" hint="Command to start the MCP server" required />
                    <BashInput
                      rows={3}
                      placeholder="npx -y @modelcontextprotocol/server-everything"
                      value={mcpCommand}
                      onChange={(e) => onConfigChange?.({ command: e.target.value })}
                      size="sm"
                    />
                  </div>
                  <div>
                    <FieldLabel label="Working Directory" hint="Working directory for the MCP server" />
                    <Input
                      placeholder="/path/to/workdir"
                      value={mcpWorkdir}
                      onChange={(e) => onConfigChange?.({ workdir: e.target.value })}
                      size="sm"
                    />
                  </div>
                </div>
              </section>
              <section>
                <Collapsible open={mcpEnvOpen} onOpenChange={setMcpEnvOpen}>
                  <CollapsibleTrigger className="w-full">
                    <div className="flex items-center justify-between mb-4 cursor-pointer hover:opacity-70 transition-opacity">
                      <h3 className="text-[var(--agyn-dark)] font-semibold">Environment Variables</h3>
                      {mcpEnvOpen ? (
                        <ChevronUp className="w-4 h-4 text-[var(--agyn-gray)]" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-[var(--agyn-gray)]" />
                      )}
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="space-y-3">
                      {mcpEnvVars.map((envVar, index) => (
                        <div key={`${envVar.key}-${index}`} className="space-y-3">
                          <div className="flex-1">
                            <FieldLabel label="Name" />
                            <div className="flex items-center gap-2">
                              <Input
                                placeholder="VARIABLE_NAME"
                                value={envVar.key}
                                onChange={(e) => {
                                  const next = [...mcpEnvVars];
                                  next[index] = { ...next[index], key: e.target.value };
                                  onConfigChange?.({ env: serializeEnvVars(next) });
                                }}
                                size="sm"
                                className="flex-1"
                              />
                              <div className="w-[40px] flex items-center justify-center">
                                <IconButton
                                  icon={<Trash2 className="w-4 h-4" />}
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    const next = mcpEnvVars.filter((_, i) => i !== index);
                                    onConfigChange?.({ env: serializeEnvVars(next) });
                                  }}
                                  className="hover:text-[var(--agyn-status-failed)]"
                                />
                              </div>
                            </div>
                          </div>
                          <div className="pr-[48px]">
                            <FieldLabel label="Value" />
                            <ReferenceInput
                              value={envVar.value}
                              onChange={(e) => {
                                const next = [...mcpEnvVars];
                                next[index] = { ...next[index], value: e.target.value };
                                onConfigChange?.({ env: serializeEnvVars(next) });
                              }}
                              sourceType={toReferenceSourceType(envVar.source)}
                              onSourceTypeChange={(type) => {
                                const next = [...mcpEnvVars];
                                next[index] = { ...next[index], source: fromReferenceSourceType(type) };
                                onConfigChange?.({ env: serializeEnvVars(next) });
                              }}
                              secretProvider={secretSuggestionProvider}
                              variableProvider={variableSuggestionProvider}
                              providerDebounceMs={providerDebounceMs}
                              placeholder="Value or reference..."
                              size="sm"
                            />
                          </div>
                        </div>
                      ))}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          onConfigChange?.({
                            env: serializeEnvVars([
                              ...mcpEnvVars,
                              { key: '', value: '', source: 'static' },
                            ]),
                          })
                        }
                      >
                        Add Variable
                      </Button>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </section>
              <section>
                <Collapsible open={mcpLimitsOpen} onOpenChange={setMcpLimitsOpen}>
                  <CollapsibleTrigger className="w-full">
                    <div className="flex items-center justify-between mb-4 cursor-pointer hover:opacity-70 transition-opacity">
                      <h3 className="text-[var(--agyn-dark)] font-semibold">Limits</h3>
                      {mcpLimitsOpen ? (
                        <ChevronUp className="w-4 h-4 text-[var(--agyn-gray)]" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-[var(--agyn-gray)]" />
                      )}
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="space-y-4">
                      <div>
                        <FieldLabel label="Request Timeout (ms)" hint="Timeout for MCP requests in milliseconds" />
                        <Input
                          type="number"
                          placeholder="60000"
                          value={mcpRequestTimeout !== undefined ? String(mcpRequestTimeout) : ''}
                          onChange={(e) =>
                            onConfigChange?.({ requestTimeoutMs: toNumberOrUndefined(e.target.value) })
                          }
                          size="sm"
                        />
                      </div>
                      <div>
                        <FieldLabel label="Startup Timeout (ms)" hint="Timeout for MCP server startup in milliseconds" />
                        <Input
                          type="number"
                          placeholder="30000"
                          value={mcpStartupTimeout !== undefined ? String(mcpStartupTimeout) : ''}
                          onChange={(e) =>
                            onConfigChange?.({ startupTimeoutMs: toNumberOrUndefined(e.target.value) })
                          }
                          size="sm"
                        />
                      </div>
                      <div>
                        <FieldLabel
                          label="Heartbeat Interval (ms)"
                          hint="Interval for MCP server heartbeats in milliseconds"
                        />
                        <Input
                          type="number"
                          placeholder="10000"
                          value={mcpHeartbeatInterval !== undefined ? String(mcpHeartbeatInterval) : ''}
                          onChange={(e) =>
                            onConfigChange?.({ heartbeatIntervalMs: toNumberOrUndefined(e.target.value) })
                          }
                          size="sm"
                        />
                      </div>
                      <div>
                        <FieldLabel
                          label="Stale Timeout (ms)"
                          hint="Timeout for stale MCP server connections in milliseconds"
                        />
                        <Input
                          type="number"
                          placeholder="30000"
                          value={mcpStaleTimeout !== undefined ? String(mcpStaleTimeout) : ''}
                          onChange={(e) =>
                            onConfigChange?.({ staleTimeoutMs: toNumberOrUndefined(e.target.value) })
                          }
                          size="sm"
                        />
                      </div>
                      <div>
                        <FieldLabel
                          label="Restart Max Attempts"
                          hint="Maximum number of restart attempts for MCP server"
                        />
                        <Input
                          type="number"
                          placeholder="5"
                          value={mcpRestartMaxAttempts !== undefined ? String(mcpRestartMaxAttempts) : ''}
                          onChange={(e) => handleRestartChange({ maxAttempts: toNumberOrUndefined(e.target.value) })}
                          size="sm"
                        />
                      </div>
                      <div>
                        <FieldLabel
                          label="Restart Backoff (ms)"
                          hint="Backoff time between MCP server restart attempts in milliseconds"
                        />
                        <Input
                          type="number"
                          placeholder="2000"
                          value={mcpRestartBackoff !== undefined ? String(mcpRestartBackoff) : ''}
                          onChange={(e) => handleRestartChange({ backoffMs: toNumberOrUndefined(e.target.value) })}
                          size="sm"
                        />
                      </div>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </section>
              <section>
                <h3 className="text-[var(--agyn-dark)] mb-4 font-semibold">Tools</h3>
                <div className="space-y-3">
                  {toolsLoading && <div className="text-xs text-[var(--agyn-gray)]">Loading tools…</div>}
                  {!toolsLoading && toolList.length === 0 && (
                    <div className="text-xs text-[var(--agyn-gray)]">No tools discovered</div>
                  )}
                  {toolList.map((tool) => {
                    const displayName =
                      tool.title && tool.title.trim().length > 0 ? tool.title : tool.name;
                    const description = tool.description ?? '';
                    const enabled = enabledToolSet.has(tool.name);
                    return (
                      <ToolItem
                        key={tool.name}
                        name={displayName}
                        description={description}
                        enabled={enabled}
                        onToggle={(value) => {
                          if (toolsLoading) return;
                          onToggleTool?.(tool.name, value);
                        }}
                      />
                    );
                  })}
                </div>
              </section>
            </>
          )}

          {nodeKind === 'Workspace' && !effectiveCustomConfigView && (
            <>
              <section>
                <h3 className="text-[var(--agyn-dark)] mb-4 font-semibold">Container</h3>
                <div className="space-y-4">
                  <FieldLabel label="Image" hint="Docker image to use for the workspace" required />
                  <Input
                    placeholder="docker.io/library/ubuntu:latest"
                    value={workspaceImage}
                    onChange={(e) => onConfigChange?.({ image: e.target.value })}
                    size="sm"
                  />
                  <div>
                    <FieldLabel label="Platform" hint="Target platform for the workspace" />
                    <Dropdown
                      options={WORKSPACE_PLATFORM_OPTIONS}
                      value={workspacePlatform || 'auto'}
                      onValueChange={(value) => onConfigChange?.({ platform: value })}
                      size="sm"
                    />
                  </div>
                  <div>
                    <FieldLabel label="Initial Script" hint="Bash script to run when the workspace starts" />
                    <BashInput
                      rows={3}
                      placeholder="echo 'Hello, World!'"
                      value={workspaceInitialScript}
                      onChange={(e) => onConfigChange?.({ initialScript: e.target.value })}
                      size="sm"
                    />
                  </div>
                </div>
              </section>
              <section>
                <Collapsible open={workspaceEnvOpen} onOpenChange={setWorkspaceEnvOpen}>
                  <CollapsibleTrigger className="w-full">
                    <div className="flex items-center justify-between mb-4 cursor-pointer hover:opacity-70 transition-opacity">
                      <h3 className="text-[var(--agyn-dark)] font-semibold">Environment Variables</h3>
                      {workspaceEnvOpen ? (
                        <ChevronUp className="w-4 h-4 text-[var(--agyn-gray)]" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-[var(--agyn-gray)]" />
                      )}
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="space-y-3">
                      {workspaceEnvVars.map((envVar, index) => (
                        <div key={`${envVar.key}-${index}`} className="space-y-3">
                          <div className="flex-1">
                            <FieldLabel label="Name" />
                            <div className="flex items-center gap-2">
                              <Input
                                placeholder="VARIABLE_NAME"
                                value={envVar.key}
                                onChange={(e) => {
                                  const next = [...workspaceEnvVars];
                                  next[index] = { ...next[index], key: e.target.value };
                                  onConfigChange?.({ env: serializeEnvVars(next) });
                                }}
                                size="sm"
                                className="flex-1"
                              />
                              <div className="w-[40px] flex items-center justify-center">
                                <IconButton
                                  icon={<Trash2 className="w-4 h-4" />}
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    const next = workspaceEnvVars.filter((_, i) => i !== index);
                                    onConfigChange?.({ env: serializeEnvVars(next) });
                                  }}
                                  className="hover:text-[var(--agyn-status-failed)]"
                                />
                              </div>
                            </div>
                          </div>
                          <div className="pr-[48px]">
                            <FieldLabel label="Value" />
                            <ReferenceInput
                              value={envVar.value}
                              onChange={(e) => {
                                const next = [...workspaceEnvVars];
                                next[index] = { ...next[index], value: e.target.value };
                                onConfigChange?.({ env: serializeEnvVars(next) });
                              }}
                              sourceType={toReferenceSourceType(envVar.source)}
                              onSourceTypeChange={(type) => {
                                const next = [...workspaceEnvVars];
                                next[index] = { ...next[index], source: fromReferenceSourceType(type) };
                                onConfigChange?.({ env: serializeEnvVars(next) });
                              }}
                              secretProvider={secretSuggestionProvider}
                              variableProvider={variableSuggestionProvider}
                              providerDebounceMs={providerDebounceMs}
                              placeholder="Value or reference..."
                              size="sm"
                            />
                          </div>
                        </div>
                      ))}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          onConfigChange?.({
                            env: serializeEnvVars([
                              ...workspaceEnvVars,
                              { key: '', value: '', source: 'static' },
                            ]),
                          })
                        }
                      >
                        Add Variable
                      </Button>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </section>
              <section>
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-[var(--agyn-dark)] font-semibold">Enable Docker-in-Docker</h3>
                    <p className="text-xs text-[var(--agyn-gray)] mt-1">
                      Allow the workspace to run Docker containers
                    </p>
                  </div>
                  <Toggle
                    label=""
                    description=""
                    checked={workspaceEnableDinD}
                    onCheckedChange={(checked) => onConfigChange?.({ enableDinD: checked })}
                  />
                </div>
              </section>
              <section>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-[var(--agyn-dark)] font-semibold">Enable Persistent Volume</h3>
                    <p className="text-xs text-[var(--agyn-gray)] mt-1">Persist data across workspace restarts</p>
                  </div>
                  <Toggle
                    label=""
                    description=""
                    checked={volumesEnabled}
                    onCheckedChange={(checked) => onConfigChange?.(applyVolumesUpdate(config, { enabled: checked }))}
                  />
                </div>
                {volumesEnabled && (
                  <div className="pl-4 border-l-2 border-[var(--agyn-border-default)]">
                    <FieldLabel
                      label="Mount Path"
                      hint="Path in the workspace where the volume will be mounted"
                    />
                    <Input
                      placeholder="/workspace"
                      value={volumesMountPath}
                      onChange={(e) => onConfigChange?.(applyVolumesUpdate(config, { mountPath: e.target.value }))}
                      size="sm"
                    />
                  </div>
                )}
              </section>
              <section>
                <h3 className="text-[var(--agyn-dark)] mb-4 font-semibold">Limits</h3>
                <div className="space-y-4">
                  <div>
                    <FieldLabel label="TTL" hint="Time-to-live for the workspace in seconds" />
                    <Input
                      type="number"
                      placeholder="3600"
                      value={workspaceTtlSeconds !== undefined ? String(workspaceTtlSeconds) : ''}
                      onChange={(e) => onConfigChange?.({ ttlSeconds: toNumberOrUndefined(e.target.value) })}
                      size="sm"
                    />
                  </div>
                  <div>
                    <FieldLabel label="CPU Limit" hint="Optional CPU limit (e.g., 500m, 0.5)" />
                    <Input
                      placeholder="500m"
                      value={workspaceCpuLimitValue}
                      onChange={(e) => {
                        const raw = e.target.value;
                        const trimmed = raw.trim();
                        onConfigChange?.({ cpu_limit: trimmed.length > 0 ? trimmed : undefined });
                      }}
                      size="sm"
                    />
                  </div>
                  <div>
                    <FieldLabel label="Memory Limit" hint="Optional memory limit (e.g., 512Mi, 1Gi)" />
                    <Input
                      placeholder="1Gi"
                      value={workspaceMemoryLimitValue}
                      onChange={(e) => {
                        const raw = e.target.value;
                        const trimmed = raw.trim();
                        onConfigChange?.({ memory_limit: trimmed.length > 0 ? trimmed : undefined });
                      }}
                      size="sm"
                    />
                  </div>
                </div>
              </section>
              <section>
                <Collapsible open={nixPackagesOpen} onOpenChange={setNixPackagesOpen}>
                  <CollapsibleTrigger className="w-full">
                    <div className="flex items-center justify-between mb-4 cursor-pointer hover:opacity-70 transition-opacity">
                      <h3 className="text-[var(--agyn-dark)] font-semibold">Nix Packages</h3>
                      {nixPackagesOpen ? (
                        <ChevronUp className="w-4 h-4 text-[var(--agyn-gray)]" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-[var(--agyn-gray)]" />
                      )}
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="space-y-4">
                      <AutocompleteInput
                        value={nixPackageQuery}
                        onChange={setNixPackageQuery}
                        fetchOptions={fetchNixPackageOptions}
                        placeholder="Search packages..."
                        onSelect={async (option) => {
                          if (!workspaceNixPackages.some((pkg) => pkg.name === option.value)) {
                            const next = [
                              ...workspaceNixPackages,
                              {
                                name: option.value,
                                version: '',
                                commitHash: '',
                                attributePath: '',
                              } satisfies WorkspaceNixPackage,
                            ];
                            onConfigChange?.(applyNixUpdate(config, next));
                            setNixErrors((prev) => ({ ...prev, [option.value]: null }));
                            await loadPackageVersions(option.value);
                          }
                          setNixPackageQuery('');
                        }}
                        debounceMs={300}
                        clearable
                        size="sm"
                      />
                      <div className="space-y-3">
                        {workspaceNixPackages.map((pkg, index) => (
                          <div key={`${pkg.name}-${index}`}>
                            <FieldLabel label={pkg.name} />
                            <div className="flex items-center gap-2">
                              <Dropdown
                                options={(nixVersionOptions[pkg.name] ?? []).map((version) => ({
                                  value: version,
                                  label: version,
                                }))}
                                placeholder={
                                  nixVersionLoading.has(pkg.name)
                                    ? 'Loading versions...'
                                    : (nixVersionOptions[pkg.name]?.length ?? 0) === 0
                                      ? 'No versions found'
                                      : 'Select version'
                                }
                                value={pkg.version}
                                onValueChange={async (value) => {
                                  const staged = workspaceNixPackages.map((entry, idx) =>
                                    idx === index
                                      ? {
                                          ...entry,
                                          version: value,
                                          commitHash: '',
                                          attributePath: '',
                                        }
                                      : entry,
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
                                }}
                                size="sm"
                                className="flex-1"
                                disabled={
                                  nixVersionLoading.has(pkg.name) ||
                                  nixResolutionLoading.has(pkg.name) ||
                                  (nixVersionOptions[pkg.name]?.length ?? 0) === 0
                                }
                              />
                              <div className="w-[40px] flex items-center justify-center">
                                <IconButton
                                  icon={<Trash2 className="w-4 h-4" />}
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    const next = workspaceNixPackages.filter((_, idx) => idx !== index);
                                    onConfigChange?.(applyNixUpdate(config, next));
                                    clearPackageState(pkg.name);
                                  }}
                                  className="hover:text-[var(--agyn-status-failed)]"
                                  disabled={nixResolutionLoading.has(pkg.name)}
                                />
                              </div>
                            </div>
                            {nixErrors[pkg.name] ? (
                              <div className="mt-1 text-xs text-[var(--agyn-status-failed)]">{nixErrors[pkg.name]}</div>
                            ) : null}
                            {nixResolutionLoading.has(pkg.name) ? (
                              <div className="mt-1 text-xs text-[var(--agyn-gray)]">Resolving selection…</div>
                            ) : null}
                            {pkg.commitHash && pkg.attributePath ? (
                              <div className="mt-1 text-[10px] text-[var(--agyn-gray)]">
                                {pkg.commitHash.slice(0, 12)} · {pkg.attributePath}
                              </div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default memo(NodePropertiesSidebarComponent);
