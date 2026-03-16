import { Inject, Injectable } from '@nestjs/common';
import { create } from '@bufbuild/protobuf';

import type { PersistedGraphEdge, PersistedGraphNode } from '../shared/types/graph.types';
import { listAllPages, readString } from '../teams/teamsGrpc.pagination';
import { TEAMS_GRPC_CLIENT } from '../teams/teamsGrpc.token';
import type { TeamsGrpcClient } from '../teams/teamsGrpc.client';
import { edgeKey } from './graph.utils';
import {
  Agent,
  AgentProcessBuffer,
  AgentWhenBusy,
  Attachment,
  AttachmentKind,
  EntityType,
  ListAgentsRequestSchema,
  ListAttachmentsRequestSchema,
  ListMcpServersRequestSchema,
  ListMemoryBucketsRequestSchema,
  ListToolsRequestSchema,
  ListWorkspaceConfigurationsRequestSchema,
  McpToolFilter,
  McpToolFilterMode,
  McpServer,
  MemoryBucket,
  MemoryBucketScope,
  Tool,
  ToolType,
  WorkspaceConfig,
  WorkspaceConfiguration,
  WorkspacePlatform,
} from '../proto/gen/agynio/api/teams/v1/teams_pb';

const TOOL_TYPE_TO_TEMPLATE: Record<ToolType, string | undefined> = {
  [ToolType.UNSPECIFIED]: undefined,
  [ToolType.MANAGE]: 'manageTool',
  [ToolType.MEMORY]: 'memoryTool',
  [ToolType.SHELL_COMMAND]: 'shellTool',
  [ToolType.SEND_MESSAGE]: 'sendMessageTool',
  [ToolType.SEND_SLACK_MESSAGE]: 'sendSlackMessageTool',
  [ToolType.REMIND_ME]: 'remindMeTool',
  [ToolType.GITHUB_CLONE_REPO]: 'githubCloneRepoTool',
  [ToolType.CALL_AGENT]: 'callAgentTool',
};

const TOOL_TYPES_WITH_NAME = new Set<ToolType>([ToolType.MANAGE, ToolType.MEMORY, ToolType.CALL_AGENT]);
const TOOL_TYPES_WITH_DESCRIPTION = TOOL_TYPES_WITH_NAME;

const ATTACHMENT_FILTERS: Array<{ kind: AttachmentKind; sourceType: EntityType; targetType: EntityType }> = [
  { kind: AttachmentKind.AGENT_TOOL, sourceType: EntityType.AGENT, targetType: EntityType.TOOL },
  { kind: AttachmentKind.AGENT_MEMORY_BUCKET, sourceType: EntityType.AGENT, targetType: EntityType.MEMORY_BUCKET },
  {
    kind: AttachmentKind.AGENT_WORKSPACE_CONFIGURATION,
    sourceType: EntityType.AGENT,
    targetType: EntityType.WORKSPACE_CONFIGURATION,
  },
  { kind: AttachmentKind.AGENT_MCP_SERVER, sourceType: EntityType.AGENT, targetType: EntityType.MCP_SERVER },
  {
    kind: AttachmentKind.MCP_SERVER_WORKSPACE_CONFIGURATION,
    sourceType: EntityType.MCP_SERVER,
    targetType: EntityType.WORKSPACE_CONFIGURATION,
  },
];

export type TeamsGraphSnapshot = { nodes: PersistedGraphNode[]; edges: PersistedGraphEdge[] };

@Injectable()
export class TeamsGraphSource {
  constructor(@Inject(TEAMS_GRPC_CLIENT) private readonly teams: TeamsGrpcClient) {}

  async load(): Promise<TeamsGraphSnapshot> {
    const [agents, tools, mcps, workspaces, memoryBuckets, attachments] = await Promise.all([
      this.listAllAgents(),
      this.listAllTools(),
      this.listAllMcpServers(),
      this.listAllWorkspaces(),
      this.listAllMemoryBuckets(),
      this.listAllAttachments(),
    ]);

    const nodes: PersistedGraphNode[] = [];
    const edges: PersistedGraphEdge[] = [];
    const nodeIds = new Set<string>();
    const edgeKeys = new Set<string>();
    const toolTemplateById = new Map<string, string>();
    const agentTools = new Map<string, Set<string>>();
    const agentMcps = new Map<string, Set<string>>();
    const agentWorkspaces = new Map<string, Set<string>>();

    const addNode = (node: PersistedGraphNode): void => {
      if (!node.id || nodeIds.has(node.id)) return;
      nodes.push(node);
      nodeIds.add(node.id);
    };

    const addEdge = (source: string, sourceHandle: string, target: string, targetHandle: string): void => {
      if (!nodeIds.has(source) || !nodeIds.has(target)) return;
      if (!sourceHandle || !targetHandle) return;
      const key = edgeKey({ source, sourceHandle, target, targetHandle });
      if (edgeKeys.has(key)) return;
      edgeKeys.add(key);
      edges.push({ id: key, source, sourceHandle, target, targetHandle });
    };

    for (const agent of agents) {
      const id = this.normalizeId(agent.meta?.id);
      if (!id) continue;
      addNode({ id, template: 'agent', config: this.mapAgentConfig(agent) });
    }

    for (const tool of tools) {
      const id = this.normalizeId(tool.meta?.id);
      if (!id) continue;
      const template = TOOL_TYPE_TO_TEMPLATE[tool.type];
      if (!template) continue;
      toolTemplateById.set(id, template);
      addNode({ id, template, config: this.mapToolConfig(tool) });
    }

    for (const mcp of mcps) {
      const id = this.normalizeId(mcp.meta?.id);
      if (!id) continue;
      addNode({ id, template: 'mcpServer', config: this.mapMcpConfig(mcp) });
    }

    for (const workspace of workspaces) {
      const id = this.normalizeId(workspace.meta?.id);
      if (!id) continue;
      addNode({ id, template: 'workspace', config: this.mapWorkspaceConfig(workspace) });
    }

    for (const memory of memoryBuckets) {
      const id = this.normalizeId(memory.meta?.id);
      if (!id) continue;
      addNode({ id, template: 'memory', config: this.mapMemoryBucketConfig(memory) });
    }

    for (const attachment of attachments) {
      switch (attachment.kind) {
        case AttachmentKind.AGENT_TOOL: {
          if (!this.matchesAttachmentTypes(attachment, EntityType.AGENT, EntityType.TOOL)) break;
          const agentId = this.normalizeId(attachment.sourceId);
          const toolId = this.normalizeId(attachment.targetId);
          if (!agentId || !toolId) break;
          addEdge(agentId, 'tools', toolId, '$self');
          this.addToSet(agentTools, agentId, toolId);
          break;
        }
        case AttachmentKind.AGENT_MCP_SERVER: {
          if (!this.matchesAttachmentTypes(attachment, EntityType.AGENT, EntityType.MCP_SERVER)) break;
          const agentId = this.normalizeId(attachment.sourceId);
          const mcpId = this.normalizeId(attachment.targetId);
          if (!agentId || !mcpId) break;
          addEdge(agentId, 'mcp', mcpId, '$self');
          this.addToSet(agentMcps, agentId, mcpId);
          break;
        }
        case AttachmentKind.AGENT_MEMORY_BUCKET: {
          if (!this.matchesAttachmentTypes(attachment, EntityType.AGENT, EntityType.MEMORY_BUCKET)) break;
          const agentId = this.normalizeId(attachment.sourceId);
          const memoryId = this.normalizeId(attachment.targetId);
          if (!agentId || !memoryId) break;
          if (!nodeIds.has(agentId) || !nodeIds.has(memoryId)) break;
          const connectorId = this.memoryConnectorId(agentId, memoryId);
          if (!nodeIds.has(connectorId)) {
            addNode({ id: connectorId, template: 'memoryConnector' });
          }
          addEdge(memoryId, '$self', connectorId, '$memory');
          addEdge(connectorId, '$self', agentId, 'memory');
          break;
        }
        case AttachmentKind.AGENT_WORKSPACE_CONFIGURATION: {
          if (!this.matchesAttachmentTypes(attachment, EntityType.AGENT, EntityType.WORKSPACE_CONFIGURATION)) break;
          const agentId = this.normalizeId(attachment.sourceId);
          const workspaceId = this.normalizeId(attachment.targetId);
          if (!agentId || !workspaceId) break;
          this.addToSet(agentWorkspaces, agentId, workspaceId);
          break;
        }
        case AttachmentKind.MCP_SERVER_WORKSPACE_CONFIGURATION: {
          if (!this.matchesAttachmentTypes(attachment, EntityType.MCP_SERVER, EntityType.WORKSPACE_CONFIGURATION)) break;
          const mcpId = this.normalizeId(attachment.sourceId);
          const workspaceId = this.normalizeId(attachment.targetId);
          if (!mcpId || !workspaceId) break;
          addEdge(workspaceId, '$self', mcpId, 'workspace');
          break;
        }
        default:
          break;
      }
    }

    for (const [agentId, workspaceIds] of agentWorkspaces) {
      const toolIds = agentTools.get(agentId);
      const mcpIds = agentMcps.get(agentId);
      this.addWorkspaceEdges(workspaceIds, toolIds, mcpIds, toolTemplateById, addEdge);
    }

    return { nodes, edges };
  }

  private async listAllAgents(): Promise<Agent[]> {
    return listAllPages((pageToken, pageSize) =>
      this.teams
        .listAgents(create(ListAgentsRequestSchema, { pageSize, pageToken: pageToken ?? '' }))
        .then((response) => ({ items: response.agents, nextPageToken: response.nextPageToken })),
    );
  }

  private async listAllTools(): Promise<Tool[]> {
    const items = await listAllPages((pageToken, pageSize) =>
      this.teams
        .listTools(create(ListToolsRequestSchema, { pageSize, pageToken: pageToken ?? '' }))
        .then((response) => ({ items: response.tools, nextPageToken: response.nextPageToken })),
    );
    const collected = new Map<string, Tool>();
    for (const tool of items) {
      if (!TOOL_TYPE_TO_TEMPLATE[tool.type]) continue;
      const id = this.normalizeId(tool.meta?.id);
      if (!id || collected.has(id)) continue;
      collected.set(id, tool);
    }
    return Array.from(collected.values());
  }

  private async listAllMcpServers(): Promise<McpServer[]> {
    return listAllPages((pageToken, pageSize) =>
      this.teams
        .listMcpServers(create(ListMcpServersRequestSchema, { pageSize, pageToken: pageToken ?? '' }))
        .then((response) => ({ items: response.mcpServers, nextPageToken: response.nextPageToken })),
    );
  }

  private async listAllWorkspaces(): Promise<WorkspaceConfiguration[]> {
    return listAllPages((pageToken, pageSize) =>
      this.teams
        .listWorkspaceConfigurations(
          create(ListWorkspaceConfigurationsRequestSchema, { pageSize, pageToken: pageToken ?? '' }),
        )
        .then((response) => ({ items: response.workspaceConfigurations, nextPageToken: response.nextPageToken })),
    );
  }

  private async listAllMemoryBuckets(): Promise<MemoryBucket[]> {
    return listAllPages((pageToken, pageSize) =>
      this.teams
        .listMemoryBuckets(create(ListMemoryBucketsRequestSchema, { pageSize, pageToken: pageToken ?? '' }))
        .then((response) => ({ items: response.memoryBuckets, nextPageToken: response.nextPageToken })),
    );
  }

  private async listAllAttachments(): Promise<Attachment[]> {
    const collected = new Map<string, Attachment>();
    for (const filter of ATTACHMENT_FILTERS) {
      const items = await listAllPages((pageToken, pageSize) =>
        this.teams
          .listAttachments(
            create(ListAttachmentsRequestSchema, {
              kind: filter.kind,
              sourceType: filter.sourceType,
              targetType: filter.targetType,
              pageSize,
              pageToken: pageToken ?? '',
            }),
          )
          .then((response) => ({ items: response.attachments, nextPageToken: response.nextPageToken })),
      );
      for (const attachment of items) {
        const key = this.normalizeId(attachment.meta?.id) ?? `${attachment.kind}:${attachment.sourceId}:${attachment.targetId}`;
        if (collected.has(key)) continue;
        collected.set(key, attachment);
      }
    }
    return Array.from(collected.values());
  }

  private mapAgentConfig(agent: Agent): Record<string, unknown> | undefined {
    const config: Record<string, unknown> = {};
    const title = readString(agent.title);
    if (title) config.title = title;

    const raw = agent.config;
    if (raw) {
      const model = readString(raw.model);
      if (model) config.model = model;
      const systemPrompt = this.readOptionalString(raw.systemPrompt);
      if (systemPrompt !== undefined) config.systemPrompt = systemPrompt;
      const debounceMs = this.readNumber(raw.debounceMs);
      if (debounceMs !== undefined) config.debounceMs = debounceMs;
      const whenBusy = this.mapWhenBusy(raw.whenBusy);
      if (whenBusy) config.whenBusy = whenBusy;
      const processBuffer = this.mapProcessBuffer(raw.processBuffer);
      if (processBuffer) config.processBuffer = processBuffer;
      if (typeof raw.sendFinalResponseToThread === 'boolean') {
        config.sendFinalResponseToThread = raw.sendFinalResponseToThread;
      }
      const summarizationKeepTokens = this.readNumber(raw.summarizationKeepTokens);
      if (summarizationKeepTokens !== undefined) config.summarizationKeepTokens = summarizationKeepTokens;
      const summarizationMaxTokens = this.readNumber(raw.summarizationMaxTokens);
      if (summarizationMaxTokens !== undefined) config.summarizationMaxTokens = summarizationMaxTokens;
      if (typeof raw.restrictOutput === 'boolean') {
        config.restrictOutput = raw.restrictOutput;
      }
      const restrictionMessage = this.readOptionalString(raw.restrictionMessage);
      if (restrictionMessage !== undefined) config.restrictionMessage = restrictionMessage;
      const restrictionMaxInjections = this.readNumber(raw.restrictionMaxInjections);
      if (restrictionMaxInjections !== undefined) config.restrictionMaxInjections = restrictionMaxInjections;
      const name = readString(raw.name);
      if (name) config.name = name;
      const role = readString(raw.role);
      if (role) config.role = role;
    }

    return Object.keys(config).length > 0 ? config : undefined;
  }

  private mapToolConfig(tool: Tool): Record<string, unknown> | undefined {
    const config: Record<string, unknown> = tool.config ? { ...tool.config } : {};
    const title = readString(tool.name);
    if (title) config.title = title;
    if (TOOL_TYPES_WITH_NAME.has(tool.type) && title) {
      config.name = title;
    }
    const description = this.readOptionalString(tool.description);
    if (TOOL_TYPES_WITH_DESCRIPTION.has(tool.type) && description !== undefined) {
      config.description = description;
    }
    return Object.keys(config).length > 0 ? config : undefined;
  }

  private mapMcpConfig(mcp: McpServer): Record<string, unknown> | undefined {
    const config: Record<string, unknown> = {};
    const title = readString(mcp.title);
    if (title) config.title = title;
    const raw = mcp.config;
    if (raw) {
      const namespace = readString(raw.namespace);
      if (namespace) config.namespace = namespace;
      const command = readString(raw.command);
      if (command) config.command = command;
      const workdir = readString(raw.workdir);
      if (workdir) config.workdir = workdir;
      const env = this.mapEnvItems(raw.env);
      if (env) config.env = env;
      const requestTimeoutMs = this.readPositiveNumber(raw.requestTimeoutMs);
      if (requestTimeoutMs !== undefined) config.requestTimeoutMs = requestTimeoutMs;
      const startupTimeoutMs = this.readPositiveNumber(raw.startupTimeoutMs);
      if (startupTimeoutMs !== undefined) config.startupTimeoutMs = startupTimeoutMs;
      const heartbeatIntervalMs = this.readPositiveNumber(raw.heartbeatIntervalMs);
      if (heartbeatIntervalMs !== undefined) config.heartbeatIntervalMs = heartbeatIntervalMs;
      const staleTimeoutMs = this.readNonNegativeNumber(raw.staleTimeoutMs);
      if (staleTimeoutMs !== undefined) config.staleTimeoutMs = staleTimeoutMs;
      if (raw.restart) {
        const restart: Record<string, unknown> = {};
        const maxAttempts = this.readPositiveNumber(raw.restart.maxAttempts);
        if (maxAttempts !== undefined) restart.maxAttempts = maxAttempts;
        const backoffMs = this.readPositiveNumber(raw.restart.backoffMs);
        if (backoffMs !== undefined) restart.backoffMs = backoffMs;
        if (Object.keys(restart).length > 0) config.restart = restart;
      }
      const toolFilter = this.mapMcpToolFilter(raw.toolFilter);
      if (toolFilter) config.toolFilter = toolFilter;
    }
    return Object.keys(config).length > 0 ? config : undefined;
  }

  private mapWorkspaceConfig(workspace: WorkspaceConfiguration): Record<string, unknown> | undefined {
    const config: Record<string, unknown> = {};
    const title = readString(workspace.title);
    if (title) config.title = title;
    const raw = workspace.config;
    if (raw) {
      const image = readString(raw.image);
      if (image) config.image = image;
      const env = this.mapEnvItems(raw.env);
      if (env) config.env = env;
      const initialScript = this.readOptionalString(raw.initialScript);
      if (initialScript !== undefined) config.initialScript = initialScript;
      const cpuLimit = this.readValue(raw.cpuLimit);
      if (cpuLimit !== undefined) config.cpu_limit = cpuLimit;
      const memoryLimit = this.readValue(raw.memoryLimit);
      if (memoryLimit !== undefined) config.memory_limit = memoryLimit;
      const platform = this.mapWorkspacePlatform(raw.platform);
      if (platform) config.platform = platform;
      if (typeof raw.enableDind === 'boolean') config.enableDinD = raw.enableDind;
      const ttlSeconds = this.readNumber(raw.ttlSeconds);
      if (ttlSeconds !== undefined) config.ttlSeconds = ttlSeconds;
      if (raw.nix) config.nix = raw.nix;
      if (raw.volumes) {
        const volumes: Record<string, unknown> = {};
        if (typeof raw.volumes.enabled === 'boolean') volumes.enabled = raw.volumes.enabled;
        const mountPath = this.readOptionalString(raw.volumes.mountPath);
        if (mountPath !== undefined) volumes.mountPath = mountPath;
        if (Object.keys(volumes).length > 0) config.volumes = volumes;
      }
    }
    return Object.keys(config).length > 0 ? config : undefined;
  }

  private mapMemoryBucketConfig(bucket: MemoryBucket): Record<string, unknown> | undefined {
    const config: Record<string, unknown> = {};
    const title = readString(bucket.title);
    if (title) config.title = title;
    const raw = bucket.config;
    if (raw) {
      const scope = this.mapMemoryScope(raw.scope);
      if (scope) config.scope = scope;
      const collectionPrefix = this.readOptionalString(raw.collectionPrefix);
      if (collectionPrefix !== undefined) config.collectionPrefix = collectionPrefix;
    }
    return Object.keys(config).length > 0 ? config : undefined;
  }

  private mapMcpToolFilter(
    filter: McpToolFilter | undefined,
  ): { mode: 'allow' | 'deny'; rules: Array<{ pattern: string }> } | undefined {
    if (!filter) return undefined;
    const mode = this.mapMcpToolFilterMode(filter.mode);
    if (!mode) return undefined;
    const rules = filter.rules
      .map((rule) => readString(rule.pattern))
      .filter((pattern): pattern is string => Boolean(pattern))
      .map((pattern) => ({ pattern }));
    return { mode, rules };
  }

  private mapMcpToolFilterMode(value: McpToolFilterMode): 'allow' | 'deny' | undefined {
    switch (value) {
      case McpToolFilterMode.ALLOW:
        return 'allow';
      case McpToolFilterMode.DENY:
        return 'deny';
      default:
        return undefined;
    }
  }

  private mapWhenBusy(value: AgentWhenBusy): 'wait' | 'injectAfterTools' | undefined {
    switch (value) {
      case AgentWhenBusy.WAIT:
        return 'wait';
      case AgentWhenBusy.INJECT_AFTER_TOOLS:
        return 'injectAfterTools';
      default:
        return undefined;
    }
  }

  private mapProcessBuffer(value: AgentProcessBuffer): 'allTogether' | 'oneByOne' | undefined {
    switch (value) {
      case AgentProcessBuffer.ALL_TOGETHER:
        return 'allTogether';
      case AgentProcessBuffer.ONE_BY_ONE:
        return 'oneByOne';
      default:
        return undefined;
    }
  }

  private mapWorkspacePlatform(value: WorkspacePlatform): 'linux/amd64' | 'linux/arm64' | 'auto' | undefined {
    switch (value) {
      case WorkspacePlatform.LINUX_AMD64:
        return 'linux/amd64';
      case WorkspacePlatform.LINUX_ARM64:
        return 'linux/arm64';
      case WorkspacePlatform.AUTO:
        return 'auto';
      default:
        return undefined;
    }
  }

  private mapMemoryScope(value: MemoryBucketScope): 'global' | 'perThread' | undefined {
    switch (value) {
      case MemoryBucketScope.GLOBAL:
        return 'global';
      case MemoryBucketScope.PER_THREAD:
        return 'perThread';
      default:
        return undefined;
    }
  }

  private mapEnvItems(items?: Array<{ name: string; value: string }>): Array<{ name: string; value: string }> | undefined {
    if (!items || items.length === 0) return undefined;
    const mapped: Array<{ name: string; value: string }> = [];
    for (const item of items) {
      const name = readString(item.name);
      if (!name) continue;
      mapped.push({ name, value: item.value });
    }
    return mapped.length > 0 ? mapped : undefined;
  }

  private readValue(value?: WorkspaceConfig['cpuLimit']): string | undefined {
    return readString(value);
  }

  private readNumber(value?: number): number | undefined {
    if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
    return value;
  }

  private readPositiveNumber(value?: number): number | undefined {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return undefined;
    return value;
  }

  private readNonNegativeNumber(value?: number): number | undefined {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return undefined;
    return value;
  }

  private readOptionalString(value?: string): string | undefined {
    if (typeof value !== 'string') return undefined;
    return value;
  }

  private normalizeId(value?: string): string | undefined {
    return readString(value);
  }

  private addToSet(map: Map<string, Set<string>>, key: string, value: string): void {
    const existing = map.get(key);
    if (existing) {
      existing.add(value);
      return;
    }
    map.set(key, new Set([value]));
  }

  private addWorkspaceEdges(
    workspaceIds: Set<string>,
    toolIds: Set<string> | undefined,
    mcpIds: Set<string> | undefined,
    toolTemplateById: Map<string, string>,
    addEdge: (source: string, sourceHandle: string, target: string, targetHandle: string) => void,
  ): void {
    if (!toolIds && !mcpIds) return;
    for (const workspaceId of workspaceIds) {
      if (toolIds) {
        this.addWorkspaceToolEdges(workspaceId, toolIds, toolTemplateById, addEdge);
      }
      if (mcpIds) {
        this.addWorkspaceMcpEdges(workspaceId, mcpIds, addEdge);
      }
    }
  }

  private addWorkspaceToolEdges(
    workspaceId: string,
    toolIds: Set<string>,
    toolTemplateById: Map<string, string>,
    addEdge: (source: string, sourceHandle: string, target: string, targetHandle: string) => void,
  ): void {
    for (const toolId of toolIds) {
      if (toolTemplateById.get(toolId) !== 'shellTool') continue;
      addEdge(workspaceId, '$self', toolId, 'workspace');
    }
  }

  private addWorkspaceMcpEdges(
    workspaceId: string,
    mcpIds: Set<string>,
    addEdge: (source: string, sourceHandle: string, target: string, targetHandle: string) => void,
  ): void {
    for (const mcpId of mcpIds) {
      addEdge(workspaceId, '$self', mcpId, 'workspace');
    }
  }

  private memoryConnectorId(agentId: string, memoryId: string): string {
    return `memoryConnector:${agentId}:${memoryId}`;
  }

  private matchesAttachmentTypes(attachment: Attachment, source: EntityType, target: EntityType): boolean {
    return attachment.sourceType === source && attachment.targetType === target;
  }
}
