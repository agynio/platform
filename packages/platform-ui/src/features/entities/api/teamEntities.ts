import type { TemplateSchema } from '@/api/types/graph';
import type {
  TeamAgent,
  TeamAgentCreateRequest,
  TeamAttachment,
  TeamAttachmentKind,
  TeamMemoryBucket,
  TeamMemoryBucketCreateRequest,
  TeamMemoryBucketScope,
  TeamMcpServer,
  TeamMcpServerCreateRequest,
  TeamTool,
  TeamToolCreateRequest,
  TeamToolType,
  TeamWorkspaceConfiguration,
  TeamWorkspaceConfigurationCreateRequest,
  TeamWorkspacePlatform,
} from '@/api/types/team';
import type { AgentQueueConfig, NodeConfig } from '@/components/nodeProperties/types';
import { readEnvList, readQueueConfig, readSummarizationConfig } from '@/components/nodeProperties/utils';
import { buildGraphNodeFromTemplate } from '@/features/graph/mappers';
import type { GraphNodeConfig, GraphPersistedEdge } from '@/features/graph/types';
import { isRecord, readNumber, readString } from '@/utils/typeGuards';
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
  agentTool: 'agent_tool',
  agentMemoryBucket: 'agent_memoryBucket',
  agentWorkspaceConfiguration: 'agent_workspaceConfiguration',
  agentMcpServer: 'agent_mcpServer',
  mcpServerWorkspaceConfiguration: 'mcpServer_workspaceConfiguration',
} as const satisfies Record<string, TeamAttachmentKind>;

export const TEAM_TOOL_TYPE = {
  manage: 'manage',
  memory: 'memory',
  shellCommand: 'shell_command',
  sendMessage: 'send_message',
  sendSlackMessage: 'send_slack_message',
  remindMe: 'remind_me',
  githubCloneRepo: 'github_clone_repo',
  callAgent: 'call_agent',
} as const satisfies Record<string, TeamToolType>;

const TOOL_TYPE_TO_TEMPLATE: Record<TeamToolType, string> = {
  manage: 'manageTool',
  memory: 'memoryTool',
  shell_command: 'shellTool',
  send_message: 'sendMessageTool',
  send_slack_message: 'sendSlackMessageTool',
  remind_me: 'remindMeTool',
  github_clone_repo: 'githubCloneRepoTool',
  call_agent: 'callAgentTool',
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
  agent_tool: { sourceHandle: 'tools', targetHandle: '$self' },
  agent_memoryBucket: { sourceHandle: 'memory', targetHandle: '$self' },
  agent_workspaceConfiguration: { sourceHandle: 'workspace', targetHandle: '$self' },
  agent_mcpServer: { sourceHandle: 'mcp', targetHandle: '$self' },
  mcpServer_workspaceConfiguration: { sourceHandle: 'workspace', targetHandle: '$self' },
};

export type TeamAttachmentInput = {
  kind: TeamAttachmentKind;
  sourceId: string;
  targetId: string;
};

function readOptionalString(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value;
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

type AgentQueueWhenBusy = NonNullable<AgentQueueConfig['whenBusy']>;
type AgentQueueProcessBuffer = NonNullable<AgentQueueConfig['processBuffer']>;
const QUEUE_WHEN_BUSY_VALUES: AgentQueueWhenBusy[] = ['wait', 'injectAfterTools'];
const QUEUE_PROCESS_BUFFER_VALUES: AgentQueueProcessBuffer[] = ['allTogether', 'oneByOne'];
const WORKSPACE_PLATFORM_VALUES: TeamWorkspacePlatform[] = ['linux/amd64', 'linux/arm64', 'auto'];
const MEMORY_SCOPE_VALUES: TeamMemoryBucketScope[] = ['global', 'perThread'];

function readEnumValue<T extends string>(value: unknown, allowed: readonly T[], label: string): T | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') {
    throw new Error(`Unexpected ${label} value`);
  }
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (!allowed.includes(trimmed as T)) {
    throw new Error(`Unexpected ${label} value`);
  }
  return trimmed as T;
}

function readQueueWhenBusy(value: unknown): AgentQueueWhenBusy | undefined {
  return readEnumValue(value, QUEUE_WHEN_BUSY_VALUES, 'agent whenBusy');
}

function readQueueProcessBuffer(value: unknown): AgentQueueProcessBuffer | undefined {
  return readEnumValue(value, QUEUE_PROCESS_BUFFER_VALUES, 'agent processBuffer');
}

function readWorkspacePlatform(value: unknown): TeamWorkspacePlatform | undefined {
  return readEnumValue(value, WORKSPACE_PLATFORM_VALUES, 'workspace platform');
}

function readMemoryScope(value: unknown): TeamMemoryBucketScope | undefined {
  return readEnumValue(value, MEMORY_SCOPE_VALUES, 'memory bucket scope');
}

function mapAgentConfigFromTeam(raw: Record<string, unknown>): Record<string, unknown> {
  const config: Record<string, unknown> = {};
  const model = readString(raw.model);
  if (model) config.model = model;
  const systemPrompt = readOptionalString(raw.systemPrompt);
  if (systemPrompt !== undefined) config.systemPrompt = systemPrompt;
  const debounceMs = readNumber(raw.debounceMs);
  const whenBusy = readQueueWhenBusy(raw.whenBusy);
  const processBuffer = readQueueProcessBuffer(raw.processBuffer);
  if (debounceMs !== undefined || whenBusy || processBuffer) {
    const queue: Record<string, unknown> = {};
    if (debounceMs !== undefined) queue.debounceMs = debounceMs;
    if (whenBusy) queue.whenBusy = whenBusy;
    if (processBuffer) queue.processBuffer = processBuffer;
    config.queue = queue;
  }
  const sendFinalResponseToThread = readBoolean(raw.sendFinalResponseToThread);
  if (sendFinalResponseToThread !== undefined) {
    config.sendFinalResponseToThread = sendFinalResponseToThread;
  }
  const summarizationKeepTokens = readNumber(raw.summarizationKeepTokens);
  const summarizationMaxTokens = readNumber(raw.summarizationMaxTokens);
  if (summarizationKeepTokens !== undefined || summarizationMaxTokens !== undefined) {
    const summarization: Record<string, unknown> = {};
    if (summarizationKeepTokens !== undefined) summarization.keepTokens = summarizationKeepTokens;
    if (summarizationMaxTokens !== undefined) summarization.maxTokens = summarizationMaxTokens;
    config.summarization = summarization;
  }
  const restrictOutput = readBoolean(raw.restrictOutput);
  if (restrictOutput !== undefined) config.restrictOutput = restrictOutput;
  const restrictionMessage = readOptionalString(raw.restrictionMessage);
  if (restrictionMessage !== undefined) config.restrictionMessage = restrictionMessage;
  const restrictionMaxInjections = readNumber(raw.restrictionMaxInjections);
  if (restrictionMaxInjections !== undefined) config.restrictionMaxInjections = restrictionMaxInjections;
  const name = readString(raw.name);
  if (name) config.name = name;
  const role = readString(raw.role);
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
  const namespace = readString(raw.namespace);
  if (namespace) config.namespace = namespace;
  const command = readString(raw.command);
  if (command) config.command = command;
  const workdir = readString(raw.workdir);
  if (workdir) config.workdir = workdir;
  const env = Array.isArray(raw.env) ? raw.env : undefined;
  if (env) config.env = env;
  const requestTimeoutMs = readNumber(raw.requestTimeoutMs);
  if (requestTimeoutMs !== undefined) config.requestTimeoutMs = requestTimeoutMs;
  const startupTimeoutMs = readNumber(raw.startupTimeoutMs);
  if (startupTimeoutMs !== undefined) config.startupTimeoutMs = startupTimeoutMs;
  const heartbeatIntervalMs = readNumber(raw.heartbeatIntervalMs);
  if (heartbeatIntervalMs !== undefined) config.heartbeatIntervalMs = heartbeatIntervalMs;
  const staleTimeoutMs = readNumber(raw.staleTimeoutMs);
  if (staleTimeoutMs !== undefined) config.staleTimeoutMs = staleTimeoutMs;
  const restart = isRecord(raw.restart) ? raw.restart : undefined;
  if (restart) {
    const restartConfig: Record<string, unknown> = {};
    const maxAttempts = readNumber(restart.maxAttempts);
    const backoffMs = readNumber(restart.backoffMs);
    if (maxAttempts !== undefined) restartConfig.maxAttempts = maxAttempts;
    if (backoffMs !== undefined) restartConfig.backoffMs = backoffMs;
    config.restart = restartConfig;
  }
  return config;
}

function mapWorkspaceConfigFromTeam(raw: Record<string, unknown>): Record<string, unknown> {
  const config: Record<string, unknown> = {};
  const image = readString(raw.image);
  if (image) config.image = image;
  const env = Array.isArray(raw.env) ? raw.env : undefined;
  if (env) config.env = env;
  const initialScript = readOptionalString(raw.initialScript);
  if (initialScript !== undefined) config.initialScript = initialScript;
  if (typeof raw.cpuLimit === 'string' || typeof raw.cpuLimit === 'number') {
    config.cpu_limit = raw.cpuLimit;
  }
  if (typeof raw.memoryLimit === 'string' || typeof raw.memoryLimit === 'number') {
    config.memory_limit = raw.memoryLimit;
  }
  const platform = readWorkspacePlatform(raw.platform);
  if (platform) config.platform = platform;
  const enableDinD = readBoolean(raw.enableDinD);
  if (enableDinD !== undefined) config.enableDinD = enableDinD;
  const ttlSeconds = readNumber(raw.ttlSeconds);
  if (ttlSeconds !== undefined) config.ttlSeconds = ttlSeconds;
  const nix = isRecord(raw.nix) ? raw.nix : undefined;
  if (nix) config.nix = nix;
  const volumes = isRecord(raw.volumes) ? raw.volumes : undefined;
  if (volumes) {
    const volumeConfig: Record<string, unknown> = {};
    const enabled = readBoolean(volumes.enabled);
    if (enabled !== undefined) volumeConfig.enabled = enabled;
    const mountPath = readOptionalString(volumes.mountPath);
    if (mountPath !== undefined) volumeConfig.mountPath = mountPath;
    config.volumes = volumeConfig;
  }
  return config;
}

function mapMemoryBucketConfigFromTeam(raw: Record<string, unknown>): Record<string, unknown> {
  const config: Record<string, unknown> = {};
  const scopeValue = readMemoryScope(raw.scope);
  if (scopeValue) config.scope = scopeValue;
  const collectionPrefix = readOptionalString(raw.collectionPrefix);
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
    const id = agent.id;
    const template = selectTemplate(templates, 'agent', { preferredNames: ['agent'] });
    const templateName = template?.name ?? 'agent';
    const config = mapAgentConfigFromTeam(agent.config);
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
    const id = tool.id;
    const toolType = tool.type;
    const templateName = TOOL_TYPE_TO_TEMPLATE[toolType] ?? 'tool';
    const template = templates.find((entry) => entry.name === templateName) ??
      selectTemplate(templates, 'tool');
    const config = mapToolConfigFromTeam(tool.config, tool);
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
    const id = mcpServer.id;
    const template = selectTemplate(templates, 'mcp', { preferredNames: ['mcpServer', 'mcp'] });
    const templateName = template?.name ?? 'mcp';
    const config = mapMcpConfigFromTeam(mcpServer.config);
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
    const id = workspace.id;
    const template = selectTemplate(templates, 'workspace', {
      preferredNames: ['workspace'],
      excludeNames: EXCLUDED_WORKSPACE_TEMPLATES,
    });
    const templateName = template?.name ?? 'workspace';
    const config = mapWorkspaceConfigFromTeam(workspace.config);
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
    const id = memory.id;
    const template = selectTemplate(templates, 'memory', {
      preferredNames: ['memory'],
      includeNames: INCLUDED_MEMORY_TEMPLATES,
    });
    const templateName = template?.name ?? 'memory';
    const config = mapMemoryBucketConfigFromTeam(memory.config);
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
    const handles = ATTACHMENT_KIND_HANDLES[attachment.kind];
    const sourceId = attachment.sourceId;
    const targetId = attachment.targetId;
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
      ports: { inputs: [], outputs: [] },
    } satisfies GraphNodeConfig;
  });
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
      if (isRecord(item) && isEnvEntryRecord(item)) {
        return sanitizeEnvEntry(item);
      }
      return sanitizeConfigValue(item);
    });
  }
  if (isRecord(value)) {
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
  const base = isRecord(config) ? config : {};
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
    const key = `${attachment.kind}:${attachment.sourceId}:${attachment.targetId}`;
    normalizedCurrent.push({ key, attachment });
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

export function buildAgentRequest(input: GraphEntityUpsertInput, existing?: GraphEntitySummary): TeamAgentCreateRequest {
  const configRecord = input.config as Record<string, unknown>;
  const queue = readQueueConfig(configRecord as NodeConfig);
  const summarization = readSummarizationConfig(configRecord as NodeConfig);
  const payload: TeamAgentCreateRequest = {
    title: input.title,
    description: existing?.description ?? '',
    config: {},
  };
  const config: Record<string, unknown> = {};
  const model = readOptionalString(configRecord.model);
  if (model !== undefined) config.model = model;
  const systemPrompt = readOptionalString(configRecord.systemPrompt);
  if (systemPrompt !== undefined) config.systemPrompt = systemPrompt;
  if (queue.debounceMs !== undefined) config.debounceMs = queue.debounceMs;
  if (queue.whenBusy) config.whenBusy = queue.whenBusy;
  if (queue.processBuffer) config.processBuffer = queue.processBuffer;
  const sendFinal = readBoolean(configRecord.sendFinalResponseToThread);
  if (sendFinal !== undefined) config.sendFinalResponseToThread = sendFinal;
  if (summarization.keepTokens !== undefined) config.summarizationKeepTokens = summarization.keepTokens;
  if (summarization.maxTokens !== undefined) config.summarizationMaxTokens = summarization.maxTokens;
  const restrictOutput = readBoolean(configRecord.restrictOutput);
  if (restrictOutput !== undefined) config.restrictOutput = restrictOutput;
  const restrictionMessage = readOptionalString(configRecord.restrictionMessage);
  if (restrictionMessage !== undefined) config.restrictionMessage = restrictionMessage;
  const restrictionMaxInjections = readNumber(configRecord.restrictionMaxInjections);
  if (restrictionMaxInjections !== undefined) config.restrictionMaxInjections = restrictionMaxInjections;
  const name = readOptionalString(configRecord.name);
  if (name !== undefined) config.name = name;
  const role = readOptionalString(configRecord.role);
  if (role !== undefined) config.role = role;
  payload.config = config;
  return payload;
}

export function buildToolRequest(input: GraphEntityUpsertInput, existing?: GraphEntitySummary): TeamToolCreateRequest {
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

export function buildMcpServerRequest(
  input: GraphEntityUpsertInput,
  existing?: GraphEntitySummary,
): TeamMcpServerCreateRequest {
  const configRecord = input.config as Record<string, unknown>;
  const payload: TeamMcpServerCreateRequest = {
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
  if (requestTimeoutMs !== undefined) config.requestTimeoutMs = requestTimeoutMs;
  const startupTimeoutMs = readNumber(configRecord.startupTimeoutMs);
  if (startupTimeoutMs !== undefined) config.startupTimeoutMs = startupTimeoutMs;
  const heartbeatIntervalMs = readNumber(configRecord.heartbeatIntervalMs);
  if (heartbeatIntervalMs !== undefined) config.heartbeatIntervalMs = heartbeatIntervalMs;
  const staleTimeoutMs = readNumber(configRecord.staleTimeoutMs);
  if (staleTimeoutMs !== undefined) config.staleTimeoutMs = staleTimeoutMs;
  const restart = isRecord(configRecord.restart) ? configRecord.restart : {};
  const maxAttempts = readNumber(restart.maxAttempts);
  const backoffMs = readNumber(restart.backoffMs);
  if (maxAttempts !== undefined || backoffMs !== undefined) {
    const restartConfig: Record<string, unknown> = {};
    if (maxAttempts !== undefined) restartConfig.maxAttempts = maxAttempts;
    if (backoffMs !== undefined) restartConfig.backoffMs = backoffMs;
    config.restart = restartConfig;
  }
  payload.config = config;
  return payload;
}

export function buildWorkspaceRequest(
  input: GraphEntityUpsertInput,
  existing?: GraphEntitySummary,
): TeamWorkspaceConfigurationCreateRequest {
  const configRecord = input.config as Record<string, unknown>;
  const payload: TeamWorkspaceConfigurationCreateRequest = {
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
  if (initialScript !== undefined) config.initialScript = initialScript;
  if (configRecord.cpu_limit !== undefined) config.cpuLimit = configRecord.cpu_limit;
  if (configRecord.memory_limit !== undefined) config.memoryLimit = configRecord.memory_limit;
  const platform = readWorkspacePlatform(configRecord.platform);
  if (platform) config.platform = platform;
  const enableDinD = readBoolean(configRecord.enableDinD);
  if (enableDinD !== undefined) config.enableDinD = enableDinD;
  const ttlSeconds = readNumber(configRecord.ttlSeconds);
  if (ttlSeconds !== undefined) config.ttlSeconds = ttlSeconds;
  if (isRecord(configRecord.nix)) config.nix = configRecord.nix;
  if (isRecord(configRecord.volumes)) {
    const volumeConfig: Record<string, unknown> = {};
    const enabled = readBoolean(configRecord.volumes.enabled);
    if (enabled !== undefined) volumeConfig.enabled = enabled;
    const mountPath = readOptionalString(configRecord.volumes.mountPath);
    if (mountPath !== undefined) volumeConfig.mountPath = mountPath;
    config.volumes = volumeConfig;
  }
  payload.config = config;
  return payload;
}

export function buildMemoryBucketRequest(
  input: GraphEntityUpsertInput,
  existing?: GraphEntitySummary,
): TeamMemoryBucketCreateRequest {
  const configRecord = input.config as Record<string, unknown>;
  const payload: TeamMemoryBucketCreateRequest = {
    title: input.title,
    description: existing?.description ?? '',
    config: {},
  };
  const config: Record<string, unknown> = {};
  const scope = readMemoryScope(configRecord.scope);
  if (scope) config.scope = scope;
  const collectionPrefix = readOptionalString(configRecord.collectionPrefix);
  if (collectionPrefix !== undefined) config.collectionPrefix = collectionPrefix;
  payload.config = config;
  return payload;
}
