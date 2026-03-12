import type { TemplateSchema } from '@/api/types/graph';
import type {
  TeamAgent,
  TeamAttachment,
  TeamAttachmentKind,
  TeamMemoryBucket,
  TeamMemoryBucketScope,
  TeamMcpServer,
  TeamTool,
  TeamToolType,
  TeamWorkspaceConfiguration,
  TeamWorkspacePlatform,
} from '@/api/types/team';
import type { AgentQueueConfig, NodeConfig } from '@/components/nodeProperties/types';
import { readEnvList, readQueueConfig, readSummarizationConfig } from '@/components/nodeProperties/utils';
import { buildGraphNodeFromTemplate } from '@/features/graph/mappers';
import type { GraphNodeConfig, GraphPersistedEdge } from '@/features/graph/types';
import type {
  GraphEdgeFilter,
  GraphEntityKind,
  GraphEntityRelationInput,
  GraphEntitySummary,
  GraphEntityUpsertInput,
  TemplateOption,
} from '../types';

export const EXCLUDED_WORKSPACE_TEMPLATES = new Set(['memory', 'memoryConnector']);
export const INCLUDED_MEMORY_TEMPLATES = new Set(['memory']);

export const TEAM_ATTACHMENT_KIND = {
  agentTool: 'ATTACHMENT_KIND_AGENT_TOOL',
  agentMemoryBucket: 'ATTACHMENT_KIND_AGENT_MEMORY_BUCKET',
  agentWorkspaceConfiguration: 'ATTACHMENT_KIND_AGENT_WORKSPACE_CONFIGURATION',
  agentMcpServer: 'ATTACHMENT_KIND_AGENT_MCP_SERVER',
  mcpServerWorkspaceConfiguration: 'ATTACHMENT_KIND_MCP_SERVER_WORKSPACE_CONFIGURATION',
} as const satisfies Record<string, TeamAttachmentKind>;

export const TEAM_TOOL_TYPE = {
  manage: 'TOOL_TYPE_MANAGE',
  memory: 'TOOL_TYPE_MEMORY',
  shellCommand: 'TOOL_TYPE_SHELL_COMMAND',
  sendMessage: 'TOOL_TYPE_SEND_MESSAGE',
  sendSlackMessage: 'TOOL_TYPE_SEND_SLACK_MESSAGE',
  remindMe: 'TOOL_TYPE_REMIND_ME',
  githubCloneRepo: 'TOOL_TYPE_GITHUB_CLONE_REPO',
  callAgent: 'TOOL_TYPE_CALL_AGENT',
} as const satisfies Record<string, TeamToolType>;

const TOOL_TYPE_TO_TEMPLATE: Record<TeamToolType, string> = {
  TOOL_TYPE_UNSPECIFIED: 'tool',
  TOOL_TYPE_MANAGE: 'manageTool',
  TOOL_TYPE_MEMORY: 'memoryTool',
  TOOL_TYPE_SHELL_COMMAND: 'shellTool',
  TOOL_TYPE_SEND_MESSAGE: 'sendMessageTool',
  TOOL_TYPE_SEND_SLACK_MESSAGE: 'sendSlackMessageTool',
  TOOL_TYPE_REMIND_ME: 'remindMeTool',
  TOOL_TYPE_GITHUB_CLONE_REPO: 'githubCloneRepoTool',
  TOOL_TYPE_CALL_AGENT: 'callAgentTool',
};

const TEMPLATE_TO_TOOL_TYPE: Record<string, TeamToolType> = Object.entries(TOOL_TYPE_TO_TEMPLATE).reduce(
  (acc, [toolType, templateName]) => {
    acc[templateName] = toolType as TeamToolType;
    return acc;
  },
  {} as Record<string, TeamToolType>,
);

const ENTITY_KIND_TO_NODE_KIND: Record<GraphEntityKind, GraphNodeConfig['kind']> = {
  agent: 'Agent',
  tool: 'Tool',
  mcp: 'MCP',
  workspace: 'Workspace',
  memory: 'Workspace',
  trigger: 'Trigger',
};

const ATTACHMENT_KIND_HANDLES: Record<TeamAttachmentKind, { sourceHandle: string; targetHandle: string }> = {
  ATTACHMENT_KIND_UNSPECIFIED: { sourceHandle: '$self', targetHandle: '$self' },
  ATTACHMENT_KIND_AGENT_TOOL: { sourceHandle: 'tools', targetHandle: '$self' },
  ATTACHMENT_KIND_AGENT_MEMORY_BUCKET: { sourceHandle: 'memory', targetHandle: '$self' },
  ATTACHMENT_KIND_AGENT_WORKSPACE_CONFIGURATION: { sourceHandle: 'workspace', targetHandle: '$self' },
  ATTACHMENT_KIND_AGENT_MCP_SERVER: { sourceHandle: 'mcp', targetHandle: '$self' },
  ATTACHMENT_KIND_MCP_SERVER_WORKSPACE_CONFIGURATION: { sourceHandle: 'workspace', targetHandle: '$self' },
};

export type TeamAttachmentInput = {
  kind: TeamAttachmentKind;
  sourceId: string;
  targetId: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readString(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }
  return undefined;
}

function readOptionalString(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value;
  }
  return undefined;
}

function readNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function readBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;
  }
  return undefined;
}

function readField<T>(record: Record<string, unknown>, keys: string[], reader: (value: unknown) => T | undefined): T | undefined {
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(record, key)) continue;
    const value = reader(record[key]);
    if (value !== undefined) return value;
  }
  return undefined;
}

function normalizeEnumName(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'string') {
    return value.trim().toUpperCase().replace(/[^A-Z0-9_]+/g, '_');
  }
  return '';
}

function normalizeTeamToolType(value: unknown): TeamToolType | undefined {
  if (typeof value === 'number') {
    switch (value) {
      case 1:
        return TEAM_TOOL_TYPE.manage;
      case 2:
        return TEAM_TOOL_TYPE.memory;
      case 3:
        return TEAM_TOOL_TYPE.shellCommand;
      case 4:
        return TEAM_TOOL_TYPE.sendMessage;
      case 5:
        return TEAM_TOOL_TYPE.sendSlackMessage;
      case 6:
        return TEAM_TOOL_TYPE.remindMe;
      case 7:
        return TEAM_TOOL_TYPE.githubCloneRepo;
      case 8:
        return TEAM_TOOL_TYPE.callAgent;
      default:
        return undefined;
    }
  }
  const normalized = normalizeEnumName(value);
  if (normalized.startsWith('TOOL_TYPE_')) {
    return normalized as TeamToolType;
  }
  switch (normalized) {
    case 'MANAGE':
      return TEAM_TOOL_TYPE.manage;
    case 'MEMORY':
      return TEAM_TOOL_TYPE.memory;
    case 'SHELL_COMMAND':
    case 'SHELL':
      return TEAM_TOOL_TYPE.shellCommand;
    case 'SEND_MESSAGE':
      return TEAM_TOOL_TYPE.sendMessage;
    case 'SEND_SLACK_MESSAGE':
      return TEAM_TOOL_TYPE.sendSlackMessage;
    case 'REMIND_ME':
      return TEAM_TOOL_TYPE.remindMe;
    case 'GITHUB_CLONE_REPO':
      return TEAM_TOOL_TYPE.githubCloneRepo;
    case 'CALL_AGENT':
      return TEAM_TOOL_TYPE.callAgent;
    default:
      return undefined;
  }
}

function normalizeAttachmentKind(value: unknown): TeamAttachmentKind | undefined {
  if (typeof value === 'number') {
    switch (value) {
      case 1:
        return TEAM_ATTACHMENT_KIND.agentTool;
      case 2:
        return TEAM_ATTACHMENT_KIND.agentMemoryBucket;
      case 3:
        return TEAM_ATTACHMENT_KIND.agentWorkspaceConfiguration;
      case 4:
        return TEAM_ATTACHMENT_KIND.agentMcpServer;
      case 5:
        return TEAM_ATTACHMENT_KIND.mcpServerWorkspaceConfiguration;
      default:
        return undefined;
    }
  }
  const normalized = normalizeEnumName(value);
  if (normalized.startsWith('ATTACHMENT_KIND_')) {
    if (normalized === 'ATTACHMENT_KIND_UNSPECIFIED') return undefined;
    return normalized as TeamAttachmentKind;
  }
  switch (normalized) {
    case 'AGENT_TOOL':
      return TEAM_ATTACHMENT_KIND.agentTool;
    case 'AGENT_MEMORY_BUCKET':
      return TEAM_ATTACHMENT_KIND.agentMemoryBucket;
    case 'AGENT_WORKSPACE_CONFIGURATION':
      return TEAM_ATTACHMENT_KIND.agentWorkspaceConfiguration;
    case 'AGENT_MCP_SERVER':
      return TEAM_ATTACHMENT_KIND.agentMcpServer;
    case 'MCP_SERVER_WORKSPACE_CONFIGURATION':
      return TEAM_ATTACHMENT_KIND.mcpServerWorkspaceConfiguration;
    default:
      return undefined;
  }
}

function normalizeWorkspacePlatform(value: unknown): TeamWorkspacePlatform | undefined {
  if (typeof value === 'number') {
    switch (value) {
      case 1:
        return 'WORKSPACE_PLATFORM_LINUX_AMD64';
      case 2:
        return 'WORKSPACE_PLATFORM_LINUX_ARM64';
      case 3:
        return 'WORKSPACE_PLATFORM_AUTO';
      default:
        return undefined;
    }
  }
  const normalized = normalizeEnumName(value);
  if (normalized.startsWith('WORKSPACE_PLATFORM_')) {
    return normalized as TeamWorkspacePlatform;
  }
  switch (normalized) {
    case 'LINUX_AMD64':
    case 'LINUX_AMD_64':
    case 'LINUX/AMD64':
      return 'WORKSPACE_PLATFORM_LINUX_AMD64';
    case 'LINUX_ARM64':
    case 'LINUX_ARM_64':
    case 'LINUX/ARM64':
      return 'WORKSPACE_PLATFORM_LINUX_ARM64';
    case 'AUTO':
      return 'WORKSPACE_PLATFORM_AUTO';
    default:
      return undefined;
  }
}

function normalizeMemoryScope(value: unknown): TeamMemoryBucketScope | undefined {
  if (typeof value === 'number') {
    switch (value) {
      case 1:
        return 'MEMORY_BUCKET_SCOPE_GLOBAL';
      case 2:
        return 'MEMORY_BUCKET_SCOPE_PER_THREAD';
      default:
        return undefined;
    }
  }
  const normalized = normalizeEnumName(value);
  if (normalized.startsWith('MEMORY_BUCKET_SCOPE_')) {
    return normalized as TeamMemoryBucketScope;
  }
  switch (normalized) {
    case 'GLOBAL':
      return 'MEMORY_BUCKET_SCOPE_GLOBAL';
    case 'PER_THREAD':
    case 'PERTHREAD':
      return 'MEMORY_BUCKET_SCOPE_PER_THREAD';
    default:
      return undefined;
  }
}

type AgentQueueWhenBusy = NonNullable<AgentQueueConfig['whenBusy']>;
type AgentQueueProcessBuffer = NonNullable<AgentQueueConfig['processBuffer']>;

function parseWhenBusy(value: unknown): AgentQueueWhenBusy | undefined {
  if (typeof value === 'number') {
    if (value === 1) return 'wait';
    if (value === 2) return 'injectAfterTools';
  }
  const normalized = normalizeEnumName(value);
  if (normalized.includes('WAIT')) return 'wait';
  if (normalized.includes('INJECT_AFTER_TOOLS')) return 'injectAfterTools';
  return undefined;
}

function parseProcessBuffer(value: unknown): AgentQueueProcessBuffer | undefined {
  if (typeof value === 'number') {
    if (value === 1) return 'allTogether';
    if (value === 2) return 'oneByOne';
  }
  const normalized = normalizeEnumName(value);
  if (normalized.includes('ALL_TOGETHER')) return 'allTogether';
  if (normalized.includes('ONE_BY_ONE')) return 'oneByOne';
  return undefined;
}

function mapWorkspacePlatformToUi(value: unknown): string | undefined {
  const normalized = normalizeWorkspacePlatform(value);
  switch (normalized) {
    case 'WORKSPACE_PLATFORM_LINUX_AMD64':
      return 'linux/amd64';
    case 'WORKSPACE_PLATFORM_LINUX_ARM64':
      return 'linux/arm64';
    case 'WORKSPACE_PLATFORM_AUTO':
      return 'auto';
    default:
      return undefined;
  }
}

function mapWorkspacePlatformToTeam(value: unknown): TeamWorkspacePlatform | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim().toLowerCase();
    if (trimmed === 'linux/amd64') return 'WORKSPACE_PLATFORM_LINUX_AMD64';
    if (trimmed === 'linux/arm64') return 'WORKSPACE_PLATFORM_LINUX_ARM64';
    if (trimmed === 'auto') return 'WORKSPACE_PLATFORM_AUTO';
  }
  return normalizeWorkspacePlatform(value);
}

function mapMemoryScopeToUi(value: unknown): string | undefined {
  const normalized = normalizeMemoryScope(value);
  if (normalized === 'MEMORY_BUCKET_SCOPE_GLOBAL') return 'global';
  if (normalized === 'MEMORY_BUCKET_SCOPE_PER_THREAD') return 'perThread';
  return undefined;
}

function mapMemoryScopeToTeam(value: unknown): TeamMemoryBucketScope | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim().toLowerCase();
    if (trimmed === 'global') return 'MEMORY_BUCKET_SCOPE_GLOBAL';
    if (trimmed === 'perthread' || trimmed === 'per_thread') return 'MEMORY_BUCKET_SCOPE_PER_THREAD';
  }
  return normalizeMemoryScope(value);
}

function mapWhenBusyToTeam(value: unknown): string | undefined {
  if (value === 'wait') return 'AGENT_WHEN_BUSY_WAIT';
  if (value === 'injectAfterTools') return 'AGENT_WHEN_BUSY_INJECT_AFTER_TOOLS';
  return undefined;
}

function mapProcessBufferToTeam(value: unknown): string | undefined {
  if (value === 'allTogether') return 'AGENT_PROCESS_BUFFER_ALL_TOGETHER';
  if (value === 'oneByOne') return 'AGENT_PROCESS_BUFFER_ONE_BY_ONE';
  return undefined;
}

function mapAgentConfigFromTeam(raw: Record<string, unknown>): Record<string, unknown> {
  const config: Record<string, unknown> = {};
  const model = readField(raw, ['model'], readString);
  if (model) config.model = model;
  const systemPrompt = readField(raw, ['systemPrompt', 'system_prompt'], readString);
  if (systemPrompt !== undefined) config.systemPrompt = systemPrompt;
  const debounceMs = readField(raw, ['debounceMs', 'debounce_ms'], readNumber);
  const whenBusy = parseWhenBusy(readField(raw, ['whenBusy', 'when_busy'], (value) => value));
  const processBuffer = parseProcessBuffer(readField(raw, ['processBuffer', 'process_buffer'], (value) => value));
  if (debounceMs !== undefined || whenBusy || processBuffer) {
    const queue: Record<string, unknown> = {};
    if (debounceMs !== undefined) queue.debounceMs = debounceMs;
    if (whenBusy) queue.whenBusy = whenBusy;
    if (processBuffer) queue.processBuffer = processBuffer;
    config.queue = queue;
  }
  const sendFinalResponseToThread = readField(
    raw,
    ['sendFinalResponseToThread', 'send_final_response_to_thread'],
    readBoolean,
  );
  if (sendFinalResponseToThread !== undefined) {
    config.sendFinalResponseToThread = sendFinalResponseToThread;
  }
  const summarizationKeepTokens = readField(
    raw,
    ['summarizationKeepTokens', 'summarization_keep_tokens'],
    readNumber,
  );
  const summarizationMaxTokens = readField(
    raw,
    ['summarizationMaxTokens', 'summarization_max_tokens'],
    readNumber,
  );
  if (summarizationKeepTokens !== undefined || summarizationMaxTokens !== undefined) {
    const summarization: Record<string, unknown> = {};
    if (summarizationKeepTokens !== undefined) summarization.keepTokens = summarizationKeepTokens;
    if (summarizationMaxTokens !== undefined) summarization.maxTokens = summarizationMaxTokens;
    config.summarization = summarization;
  }
  const restrictOutput = readField(raw, ['restrictOutput', 'restrict_output'], readBoolean);
  if (restrictOutput !== undefined) config.restrictOutput = restrictOutput;
  const restrictionMessage = readField(raw, ['restrictionMessage', 'restriction_message'], readString);
  if (restrictionMessage !== undefined) config.restrictionMessage = restrictionMessage;
  const restrictionMaxInjections = readField(
    raw,
    ['restrictionMaxInjections', 'restriction_max_injections'],
    readNumber,
  );
  if (restrictionMaxInjections !== undefined) config.restrictionMaxInjections = restrictionMaxInjections;
  const name = readField(raw, ['name'], readString);
  if (name) config.name = name;
  const role = readField(raw, ['role'], readString);
  if (role) config.role = role;
  return config;
}

function mapToolConfigFromTeam(raw: Record<string, unknown>, tool: TeamTool): Record<string, unknown> {
  const config = { ...raw };
  const toolName = readString(tool.name ?? config.name);
  if (toolName && typeof config.name !== 'string') {
    config.name = toolName;
  }
  return config;
}

function mapMcpConfigFromTeam(raw: Record<string, unknown>): Record<string, unknown> {
  const config: Record<string, unknown> = {};
  const namespace = readField(raw, ['namespace'], readString);
  if (namespace) config.namespace = namespace;
  const command = readField(raw, ['command'], readString);
  if (command) config.command = command;
  const workdir = readField(raw, ['workdir'], readString);
  if (workdir) config.workdir = workdir;
  const env = readField(raw, ['env'], (value) => (Array.isArray(value) ? value : undefined));
  if (env) config.env = env;
  const requestTimeoutMs = readField(raw, ['requestTimeoutMs', 'request_timeout_ms'], readNumber);
  if (requestTimeoutMs !== undefined) config.requestTimeoutMs = requestTimeoutMs;
  const startupTimeoutMs = readField(raw, ['startupTimeoutMs', 'startup_timeout_ms'], readNumber);
  if (startupTimeoutMs !== undefined) config.startupTimeoutMs = startupTimeoutMs;
  const heartbeatIntervalMs = readField(raw, ['heartbeatIntervalMs', 'heartbeat_interval_ms'], readNumber);
  if (heartbeatIntervalMs !== undefined) config.heartbeatIntervalMs = heartbeatIntervalMs;
  const staleTimeoutMs = readField(raw, ['staleTimeoutMs', 'stale_timeout_ms'], readNumber);
  if (staleTimeoutMs !== undefined) config.staleTimeoutMs = staleTimeoutMs;
  const restart = readField(raw, ['restart'], (value) => (isRecord(value) ? value : undefined));
  if (restart) {
    const restartConfig: Record<string, unknown> = {};
    const maxAttempts = readField(restart, ['maxAttempts', 'max_attempts'], readNumber);
    const backoffMs = readField(restart, ['backoffMs', 'backoff_ms'], readNumber);
    if (maxAttempts !== undefined) restartConfig.maxAttempts = maxAttempts;
    if (backoffMs !== undefined) restartConfig.backoffMs = backoffMs;
    config.restart = restartConfig;
  }
  return config;
}

function mapWorkspaceConfigFromTeam(raw: Record<string, unknown>): Record<string, unknown> {
  const config: Record<string, unknown> = {};
  const image = readField(raw, ['image'], readString);
  if (image) config.image = image;
  const env = readField(raw, ['env'], (value) => (Array.isArray(value) ? value : undefined));
  if (env) config.env = env;
  const initialScript = readField(raw, ['initialScript', 'initial_script'], readOptionalString);
  if (initialScript !== undefined) config.initialScript = initialScript;
  const cpuLimit = readField(raw, ['cpu_limit', 'cpuLimit'], (value) => value as unknown);
  if (cpuLimit !== undefined) config.cpu_limit = cpuLimit;
  const memoryLimit = readField(raw, ['memory_limit', 'memoryLimit'], (value) => value as unknown);
  if (memoryLimit !== undefined) config.memory_limit = memoryLimit;
  const platform = readField(raw, ['platform'], (value) => value as unknown);
  const platformValue = mapWorkspacePlatformToUi(platform);
  if (platformValue) config.platform = platformValue;
  const enableDinD = readField(raw, ['enableDinD', 'enable_dind', 'enableDind'], readBoolean);
  if (enableDinD !== undefined) config.enableDinD = enableDinD;
  const ttlSeconds = readField(raw, ['ttlSeconds', 'ttl_seconds'], readNumber);
  if (ttlSeconds !== undefined) config.ttlSeconds = ttlSeconds;
  const nix = readField(raw, ['nix'], (value) => (isRecord(value) ? value : undefined));
  if (nix) config.nix = nix;
  const volumes = readField(raw, ['volumes'], (value) => (isRecord(value) ? value : undefined));
  if (volumes) {
    const volumeConfig: Record<string, unknown> = {};
    const enabled = readField(volumes, ['enabled'], readBoolean);
    if (enabled !== undefined) volumeConfig.enabled = enabled;
    const mountPath = readField(volumes, ['mountPath', 'mount_path'], readOptionalString);
    if (mountPath !== undefined) volumeConfig.mountPath = mountPath;
    config.volumes = volumeConfig;
  }
  return config;
}

function mapMemoryBucketConfigFromTeam(raw: Record<string, unknown>): Record<string, unknown> {
  const config: Record<string, unknown> = {};
  const scope = readField(raw, ['scope'], (value) => value as unknown);
  const scopeValue = mapMemoryScopeToUi(scope);
  if (scopeValue) config.scope = scopeValue;
  const collectionPrefix = readField(raw, ['collectionPrefix', 'collection_prefix'], readOptionalString);
  if (collectionPrefix !== undefined) config.collectionPrefix = collectionPrefix;
  return config;
}

function resolveTemplateKind(rawKind?: string | null, templateName?: string): GraphEntityKind {
  switch (rawKind) {
    case 'trigger':
      return 'trigger';
    case 'agent':
      return 'agent';
    case 'tool':
      return 'tool';
    case 'mcp':
      return 'mcp';
    case 'service':
    default: {
      if (templateName === 'memory') return 'memory';
      return 'workspace';
    }
  }
}

function resolveTemplateEntityKind(template: TemplateSchema): GraphEntityKind {
  return resolveTemplateKind(template.kind, template.name);
}

function normalizeTemplateOptions(
  templates: TemplateSchema[],
  kind?: GraphEntityKind,
  excludeTemplateNames?: ReadonlySet<string> | Set<string>,
): TemplateOption[] {
  return templates
    .map((template) => ({
      name: template.name,
      title: template.title ?? template.name,
      kind: resolveTemplateEntityKind(template),
      source: template,
    }))
    .filter((option) => {
      if (kind && option.kind !== kind) return false;
      if (excludeTemplateNames && excludeTemplateNames.has(option.name)) return false;
      return true;
    })
    .sort((a, b) => a.title.localeCompare(b.title));
}

export function getTemplateOptions(
  templates: TemplateSchema[] = [],
  kind?: GraphEntityKind,
  excludeTemplateNames?: ReadonlySet<string> | Set<string>,
): TemplateOption[] {
  return normalizeTemplateOptions(templates, kind, excludeTemplateNames);
}

export function limitTemplateOptionsForKind(options: TemplateOption[], kind: GraphEntityKind): TemplateOption[] {
  if (kind === 'tool') return options;
  if (options.length <= 1) return options;
  const preferredNames: string[] = [];
  if (kind === 'agent') preferredNames.push('agent');
  if (kind === 'mcp') preferredNames.push('mcpServer', 'mcp');
  if (kind === 'workspace') preferredNames.push('workspace');
  if (kind === 'memory') preferredNames.push('memory');
  for (const name of preferredNames) {
    const match = options.find((option) => option.name === name);
    if (match) return [match];
  }
  return options.slice(0, 1);
}

function selectTemplate(
  templates: TemplateSchema[],
  kind: GraphEntityKind,
  options: { includeNames?: ReadonlySet<string>; excludeNames?: ReadonlySet<string>; preferredNames?: string[] } = {},
): TemplateSchema | undefined {
  const candidates = templates.filter((template) => resolveTemplateEntityKind(template) === kind);
  const filtered = candidates.filter((template) => {
    if (options.includeNames && !options.includeNames.has(template.name)) return false;
    if (options.excludeNames && options.excludeNames.has(template.name)) return false;
    return true;
  });
  if (options.preferredNames) {
    for (const name of options.preferredNames) {
      const match = filtered.find((template) => template.name === name);
      if (match) return match;
    }
  }
  return filtered[0];
}

function getTemplatePorts(template?: TemplateSchema): { inputs: Array<{ id: string; label: string }>; outputs: Array<{ id: string; label: string }> } {
  if (!template) return { inputs: [], outputs: [] };
  const toPortList = (portDefinition: TemplateSchema['sourcePorts']): Array<{ id: string; label: string }> => {
    if (!portDefinition) return [];
    if (Array.isArray(portDefinition)) {
      return portDefinition
        .filter((port): port is string => typeof port === 'string' && port.trim().length > 0)
        .map((port) => ({ id: port, label: port }));
    }
    if (typeof portDefinition === 'object') {
      return Object.entries(portDefinition)
        .filter(([key]) => typeof key === 'string' && key.trim().length > 0)
        .map(([key, definition]) => {
          if (typeof definition === 'string' && definition.trim().length > 0) {
            return { id: key, label: definition.trim() };
          }
          if (definition && typeof definition === 'object') {
            const record = definition as Record<string, unknown>;
            const label = record.title ?? record.label ?? record.name;
            if (typeof label === 'string' && label.trim().length > 0) {
              return { id: key, label: label.trim() };
            }
          }
          return { id: key, label: key };
        });
    }
    return [];
  };

  return {
    inputs: toPortList(template.targetPorts),
    outputs: toPortList(template.sourcePorts),
  };
}

function resolveEntityTitle(candidate?: string): string {
  if (candidate && candidate.trim().length > 0) return candidate.trim();
  return '';
}

export function mapTeamEntities(
  sources: {
    agents?: TeamAgent[];
    tools?: TeamTool[];
    mcpServers?: TeamMcpServer[];
    workspaceConfigurations?: TeamWorkspaceConfiguration[];
    memoryBuckets?: TeamMemoryBucket[];
  },
  templates: TemplateSchema[] = [],
): GraphEntitySummary[] {
  const result: GraphEntitySummary[] = [];

  const addSummary = (summary: GraphEntitySummary | null) => {
    if (summary) result.push(summary);
  };

  for (const agent of sources.agents ?? []) {
    if (!agent) continue;
    const id = readString(agent.id ?? agent.meta?.id);
    if (!id) continue;
    const template = selectTemplate(templates, 'agent', { preferredNames: ['agent'] });
    const templateName = template?.name ?? 'agent';
    const config = mapAgentConfigFromTeam(isRecord(agent.config) ? agent.config : {});
    const title = resolveEntityTitle(readString(agent.title) ?? template?.title ?? templateName) || templateName;
    addSummary({
      id,
      entityKind: 'agent',
      title,
      description: readString(agent.description),
      templateName,
      templateTitle: template?.title ?? templateName,
      templateKind: resolveTemplateKind(template?.kind, templateName),
      rawTemplateKind: template?.kind,
      config,
      ports: getTemplatePorts(template),
      relations: { incoming: 0, outgoing: 0 },
    });
  }

  for (const tool of sources.tools ?? []) {
    if (!tool) continue;
    const id = readString(tool.id ?? tool.meta?.id);
    if (!id) continue;
    const toolType = normalizeTeamToolType(tool.type);
    const templateName = (toolType && TOOL_TYPE_TO_TEMPLATE[toolType]) || 'tool';
    const template = templates.find((entry) => entry.name === templateName) ??
      selectTemplate(templates, 'tool');
    const config = mapToolConfigFromTeam(isRecord(tool.config) ? tool.config : {}, tool);
    const titleCandidate = readString(tool.description) ?? readString(tool.name) ?? template?.title ?? templateName;
    const title = resolveEntityTitle(titleCandidate) || templateName;
    addSummary({
      id,
      entityKind: 'tool',
      title,
      description: readString(tool.description),
      templateName: template?.name ?? templateName,
      templateTitle: template?.title ?? templateName,
      templateKind: resolveTemplateKind(template?.kind, templateName),
      rawTemplateKind: template?.kind,
      config,
      toolType,
      toolName: readString(tool.name),
      ports: getTemplatePorts(template),
      relations: { incoming: 0, outgoing: 0 },
    });
  }

  for (const mcpServer of sources.mcpServers ?? []) {
    if (!mcpServer) continue;
    const id = readString(mcpServer.id ?? mcpServer.meta?.id);
    if (!id) continue;
    const template = selectTemplate(templates, 'mcp', { preferredNames: ['mcpServer', 'mcp'] });
    const templateName = template?.name ?? 'mcp';
    const config = mapMcpConfigFromTeam(isRecord(mcpServer.config) ? mcpServer.config : {});
    const titleCandidate = readString(mcpServer.title) ?? template?.title ?? templateName;
    const title = resolveEntityTitle(titleCandidate) || templateName;
    addSummary({
      id,
      entityKind: 'mcp',
      title,
      description: readString(mcpServer.description),
      templateName,
      templateTitle: template?.title ?? templateName,
      templateKind: resolveTemplateKind(template?.kind, templateName),
      rawTemplateKind: template?.kind,
      config,
      ports: getTemplatePorts(template),
      relations: { incoming: 0, outgoing: 0 },
    });
  }

  for (const workspace of sources.workspaceConfigurations ?? []) {
    if (!workspace) continue;
    const id = readString(workspace.id ?? workspace.meta?.id);
    if (!id) continue;
    const template = selectTemplate(templates, 'workspace', {
      preferredNames: ['workspace'],
      excludeNames: EXCLUDED_WORKSPACE_TEMPLATES,
    });
    const templateName = template?.name ?? 'workspace';
    const config = mapWorkspaceConfigFromTeam(isRecord(workspace.config) ? workspace.config : {});
    const titleCandidate = readString(workspace.title) ?? template?.title ?? templateName;
    const title = resolveEntityTitle(titleCandidate) || templateName;
    addSummary({
      id,
      entityKind: 'workspace',
      title,
      description: readString(workspace.description),
      templateName,
      templateTitle: template?.title ?? templateName,
      templateKind: resolveTemplateKind(template?.kind, templateName),
      rawTemplateKind: template?.kind,
      config,
      ports: getTemplatePorts(template),
      relations: { incoming: 0, outgoing: 0 },
    });
  }

  for (const memory of sources.memoryBuckets ?? []) {
    if (!memory) continue;
    const id = readString(memory.id ?? memory.meta?.id);
    if (!id) continue;
    const template = selectTemplate(templates, 'memory', {
      preferredNames: ['memory'],
      includeNames: INCLUDED_MEMORY_TEMPLATES,
    });
    const templateName = template?.name ?? 'memory';
    const config = mapMemoryBucketConfigFromTeam(isRecord(memory.config) ? memory.config : {});
    const titleCandidate = readString(memory.title) ?? template?.title ?? templateName;
    const title = resolveEntityTitle(titleCandidate) || templateName;
    addSummary({
      id,
      entityKind: 'memory',
      title,
      description: readString(memory.description),
      templateName,
      templateTitle: template?.title ?? templateName,
      templateKind: resolveTemplateKind(template?.kind, templateName),
      rawTemplateKind: template?.kind,
      config,
      ports: getTemplatePorts(template),
      relations: { incoming: 0, outgoing: 0 },
    });
  }

  return result;
}

function buildEdgeId(source: string, sourceHandle: string, target: string, targetHandle: string): string {
  const normalizedSourceHandle = sourceHandle?.length ? sourceHandle : '$self';
  const normalizedTargetHandle = targetHandle?.length ? targetHandle : '$self';
  return `${source}-${normalizedSourceHandle}__${target}-${normalizedTargetHandle}`;
}

function matchesEdgeFilter(edge: GraphPersistedEdge, filter: GraphEdgeFilter): boolean {
  if (filter.sourceId && edge.source !== filter.sourceId) return false;
  if (filter.sourceHandle && edge.sourceHandle !== filter.sourceHandle) return false;
  if (filter.targetId && edge.target !== filter.targetId) return false;
  if (filter.targetHandle && edge.targetHandle !== filter.targetHandle) return false;
  return true;
}

export function listTargetsByEdge(edges: GraphPersistedEdge[] | undefined, filter: GraphEdgeFilter): GraphPersistedEdge[] {
  if (!Array.isArray(edges) || edges.length === 0) {
    return [];
  }
  return edges.filter((edge): edge is GraphPersistedEdge => Boolean(edge) && matchesEdgeFilter(edge, filter));
}

export function mapTeamAttachmentsToEdges(attachments: TeamAttachment[] | undefined): GraphPersistedEdge[] {
  if (!Array.isArray(attachments)) return [];
  const edges: GraphPersistedEdge[] = [];
  for (const attachment of attachments) {
    if (!attachment) continue;
    const kind = normalizeAttachmentKind(attachment.kind);
    if (!kind) continue;
    const sourceId = readString((attachment as Record<string, unknown>).sourceId ?? (attachment as Record<string, unknown>).source_id);
    const targetId = readString((attachment as Record<string, unknown>).targetId ?? (attachment as Record<string, unknown>).target_id);
    if (!sourceId || !targetId) continue;
    const handles = ATTACHMENT_KIND_HANDLES[kind];
    const id = buildEdgeId(sourceId, handles.sourceHandle, targetId, handles.targetHandle);
    edges.push({
      id,
      source: sourceId,
      sourceHandle: handles.sourceHandle,
      target: targetId,
      targetHandle: handles.targetHandle,
    });
  }
  return edges;
}

export function mapTeamEntitiesToGraphNodes(
  entities: GraphEntitySummary[],
  templates: TemplateSchema[] = [],
): GraphNodeConfig[] {
  const templateByName = new Map<string, TemplateSchema>();
  for (const template of templates) {
    templateByName.set(template.name, template);
  }
  return entities.map((entity) => {
    const template = templateByName.get(entity.templateName);
    if (template) {
      return buildGraphNodeFromTemplate(template, {
        id: entity.id,
        position: { x: 0, y: 0 },
        title: entity.title,
        config: entity.config,
        state: entity.state,
      }).node;
    }
    return {
      id: entity.id,
      template: entity.templateName,
      kind: ENTITY_KIND_TO_NODE_KIND[entity.templateKind],
      title: entity.title,
      x: 0,
      y: 0,
      status: 'ready',
      config: entity.config,
      state: entity.state,
      ports: { inputs: [], outputs: [] },
    } satisfies GraphNodeConfig;
  });
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isEnvEntryRecord(value: Record<string, unknown>): boolean {
  return typeof value.name === 'string' && Object.prototype.hasOwnProperty.call(value, 'value');
}

function sanitizeEnvEntry(entry: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(entry)) {
    if (key === 'source') {
      continue;
    }
    next[key] = sanitizeConfigValue(nested);
  }
  return next;
}

function sanitizeConfigValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => {
      if (isPlainRecord(item) && isEnvEntryRecord(item)) {
        return sanitizeEnvEntry(item);
      }
      return sanitizeConfigValue(item);
    });
  }
  if (isPlainRecord(value)) {
    if (isEnvEntryRecord(value)) {
      return sanitizeEnvEntry(value);
    }
    const next: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value)) {
      next[key] = sanitizeConfigValue(nested);
    }
    return next;
  }
  return value;
}

export function sanitizeConfigForPersistence(_templateName: string, config: Record<string, unknown> | undefined): Record<string, unknown> {
  const base = isPlainRecord(config) ? config : {};
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(base)) {
    if (key === 'title' || key === 'template' || key === 'kind') {
      continue;
    }
    if (value === undefined) {
      continue;
    }
    sanitized[key] = sanitizeConfigValue(value);
  }
  return sanitized;
}

export function buildAttachmentInputsFromRelations(relations: GraphEntityRelationInput[] | undefined, ownerId?: string): TeamAttachmentInput[] {
  if (!relations || relations.length === 0) return [];
  const attachments: TeamAttachmentInput[] = [];
  const seen = new Set<string>();
  for (const relation of relations) {
    if (!relation.attachmentKind) continue;
    const resolvedOwnerId = relation.ownerId ?? ownerId;
    if (!resolvedOwnerId) continue;
    const selections = Array.isArray(relation.selections) ? relation.selections : [];
    for (const selection of selections) {
      if (!selection) continue;
      const sourceId = relation.ownerRole === 'source' ? resolvedOwnerId : selection;
      const targetId = relation.ownerRole === 'source' ? selection : resolvedOwnerId;
      const key = `${relation.attachmentKind}:${sourceId}:${targetId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      attachments.push({ kind: relation.attachmentKind, sourceId, targetId });
    }
  }
  return attachments;
}

export function diffTeamAttachments(
  current: TeamAttachment[] | undefined,
  desired: TeamAttachmentInput[],
): { create: TeamAttachmentInput[]; remove: TeamAttachment[] } {
  const desiredKeys = new Set<string>();
  for (const item of desired) {
    desiredKeys.add(`${item.kind}:${item.sourceId}:${item.targetId}`);
  }

  const normalizedCurrent: Array<{ key: string; attachment: TeamAttachment }> = [];
  for (const attachment of current ?? []) {
    const kind = normalizeAttachmentKind(attachment.kind);
    if (!kind) continue;
    const sourceId = readString((attachment as Record<string, unknown>).sourceId ?? (attachment as Record<string, unknown>).source_id);
    const targetId = readString((attachment as Record<string, unknown>).targetId ?? (attachment as Record<string, unknown>).target_id);
    if (!sourceId || !targetId) continue;
    const key = `${kind}:${sourceId}:${targetId}`;
    normalizedCurrent.push({ key, attachment: { ...attachment, kind } });
  }

  const currentKeys = new Set(normalizedCurrent.map((entry) => entry.key));
  const create = desired.filter((item) => !currentKeys.has(`${item.kind}:${item.sourceId}:${item.targetId}`));
  const remove = normalizedCurrent.filter((entry) => !desiredKeys.has(entry.key)).map((entry) => entry.attachment);

  return { create, remove };
}

function mapEnvListForTeam(env: unknown): Array<{ name: string; value: string }> {
  const parsed = readEnvList(env);
  return parsed
    .map((item) => ({ name: item.name, value: item.value }))
    .filter((item) => item.name.length > 0);
}

export function buildAgentRequest(input: GraphEntityUpsertInput, existing?: GraphEntitySummary): Record<string, unknown> {
  const configRecord = input.config as Record<string, unknown>;
  const queue = readQueueConfig(configRecord as NodeConfig);
  const summarization = readSummarizationConfig(configRecord as NodeConfig);
  const payload: Record<string, unknown> = {
    title: input.title,
    description: existing?.description ?? '',
    config: {},
  };
  const config: Record<string, unknown> = {};
  const model = readOptionalString(configRecord.model);
  if (model !== undefined) config.model = model;
  const systemPrompt = readOptionalString(configRecord.systemPrompt);
  if (systemPrompt !== undefined) config.system_prompt = systemPrompt;
  if (queue.debounceMs !== undefined) config.debounce_ms = queue.debounceMs;
  if (queue.whenBusy) config.when_busy = mapWhenBusyToTeam(queue.whenBusy);
  if (queue.processBuffer) config.process_buffer = mapProcessBufferToTeam(queue.processBuffer);
  const sendFinal = readBoolean(configRecord.sendFinalResponseToThread);
  if (sendFinal !== undefined) config.send_final_response_to_thread = sendFinal;
  if (summarization.keepTokens !== undefined) config.summarization_keep_tokens = summarization.keepTokens;
  if (summarization.maxTokens !== undefined) config.summarization_max_tokens = summarization.maxTokens;
  const restrictOutput = readBoolean(configRecord.restrictOutput);
  if (restrictOutput !== undefined) config.restrict_output = restrictOutput;
  const restrictionMessage = readOptionalString(configRecord.restrictionMessage);
  if (restrictionMessage !== undefined) config.restriction_message = restrictionMessage;
  const restrictionMaxInjections = readNumber(configRecord.restrictionMaxInjections);
  if (restrictionMaxInjections !== undefined) config.restriction_max_injections = restrictionMaxInjections;
  const name = readOptionalString(configRecord.name);
  if (name !== undefined) config.name = name;
  const role = readOptionalString(configRecord.role);
  if (role !== undefined) config.role = role;
  payload.config = config;
  return payload;
}

export function buildToolRequest(input: GraphEntityUpsertInput, existing?: GraphEntitySummary): Record<string, unknown> {
  const configRecord = input.config as Record<string, unknown>;
  const toolType = TEMPLATE_TO_TOOL_TYPE[input.template] ?? existing?.toolType ?? TEAM_TOOL_TYPE.manage;
  const toolName = readOptionalString(configRecord.name) ?? existing?.toolName ?? input.title;
  return {
    type: toolType,
    name: toolName,
    description: input.title,
    config: configRecord,
  };
}

export function buildMcpServerRequest(input: GraphEntityUpsertInput, existing?: GraphEntitySummary): Record<string, unknown> {
  const configRecord = input.config as Record<string, unknown>;
  const payload: Record<string, unknown> = {
    title: input.title,
    description: existing?.description ?? '',
    config: {},
  };
  const config: Record<string, unknown> = {};
  const namespace = readOptionalString(configRecord.namespace);
  if (namespace !== undefined) config.namespace = namespace;
  const command = readOptionalString(configRecord.command);
  if (command !== undefined) config.command = command;
  const workdir = readOptionalString(configRecord.workdir);
  if (workdir !== undefined) config.workdir = workdir;
  const env = mapEnvListForTeam(configRecord.env);
  if (env.length > 0) config.env = env;
  const requestTimeoutMs = readNumber(configRecord.requestTimeoutMs);
  if (requestTimeoutMs !== undefined) config.request_timeout_ms = requestTimeoutMs;
  const startupTimeoutMs = readNumber(configRecord.startupTimeoutMs);
  if (startupTimeoutMs !== undefined) config.startup_timeout_ms = startupTimeoutMs;
  const heartbeatIntervalMs = readNumber(configRecord.heartbeatIntervalMs);
  if (heartbeatIntervalMs !== undefined) config.heartbeat_interval_ms = heartbeatIntervalMs;
  const staleTimeoutMs = readNumber(configRecord.staleTimeoutMs);
  if (staleTimeoutMs !== undefined) config.stale_timeout_ms = staleTimeoutMs;
  const restart = isRecord(configRecord.restart) ? configRecord.restart : {};
  const maxAttempts = readNumber(restart.maxAttempts);
  const backoffMs = readNumber(restart.backoffMs);
  if (maxAttempts !== undefined || backoffMs !== undefined) {
    const restartConfig: Record<string, unknown> = {};
    if (maxAttempts !== undefined) restartConfig.max_attempts = maxAttempts;
    if (backoffMs !== undefined) restartConfig.backoff_ms = backoffMs;
    config.restart = restartConfig;
  }
  payload.config = config;
  return payload;
}

export function buildWorkspaceRequest(input: GraphEntityUpsertInput, existing?: GraphEntitySummary): Record<string, unknown> {
  const configRecord = input.config as Record<string, unknown>;
  const payload: Record<string, unknown> = {
    title: input.title,
    description: existing?.description ?? '',
    config: {},
  };
  const config: Record<string, unknown> = {};
  const image = readOptionalString(configRecord.image);
  if (image !== undefined) config.image = image;
  const env = mapEnvListForTeam(configRecord.env);
  if (env.length > 0) config.env = env;
  const initialScript = readOptionalString(configRecord.initialScript);
  if (initialScript !== undefined) config.initial_script = initialScript;
  if (configRecord.cpu_limit !== undefined) config.cpu_limit = configRecord.cpu_limit;
  if (configRecord.memory_limit !== undefined) config.memory_limit = configRecord.memory_limit;
  const platform = mapWorkspacePlatformToTeam(configRecord.platform);
  if (platform) config.platform = platform;
  const enableDinD = readBoolean(configRecord.enableDinD ?? configRecord.enable_dind ?? configRecord.enableDind);
  if (enableDinD !== undefined) config.enable_dind = enableDinD;
  const ttlSeconds = readNumber(configRecord.ttlSeconds);
  if (ttlSeconds !== undefined) config.ttl_seconds = ttlSeconds;
  if (isRecord(configRecord.nix)) config.nix = configRecord.nix;
  if (isRecord(configRecord.volumes)) {
    const volumeConfig: Record<string, unknown> = {};
    const enabled = readBoolean(configRecord.volumes.enabled);
    if (enabled !== undefined) volumeConfig.enabled = enabled;
    const mountPath = readOptionalString(configRecord.volumes.mountPath ?? configRecord.volumes.mount_path);
    if (mountPath !== undefined) volumeConfig.mount_path = mountPath;
    config.volumes = volumeConfig;
  }
  payload.config = config;
  return payload;
}

export function buildMemoryBucketRequest(input: GraphEntityUpsertInput, existing?: GraphEntitySummary): Record<string, unknown> {
  const configRecord = input.config as Record<string, unknown>;
  const payload: Record<string, unknown> = {
    title: input.title,
    description: existing?.description ?? '',
    config: {},
  };
  const config: Record<string, unknown> = {};
  const scope = mapMemoryScopeToTeam(configRecord.scope);
  if (scope) config.scope = scope;
  const collectionPrefix = readOptionalString(configRecord.collectionPrefix ?? configRecord.collection_prefix);
  if (collectionPrefix !== undefined) config.collection_prefix = collectionPrefix;
  payload.config = config;
  return payload;
}
