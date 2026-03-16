import {
  listAllAgents,
  listAllAttachments,
  listAllMcpServers,
  listAllMemoryBuckets,
  listAllTools,
  listAllWorkspaceConfigurations,
} from '@/api/modules/teamApi';
import type {
  TeamAgent,
  TeamAttachment,
  TeamEntityType,
  TeamMemoryBucket,
  TeamMcpServer,
  TeamTool,
  TeamToolType,
  TeamWorkspaceConfiguration,
} from '@/api/types/team';
import type { GraphPersisted } from '../types';

const TOOL_TYPE_TO_TEMPLATE: Record<TeamToolType, string | undefined> = {
  manage: 'manageTool',
  memory: 'memoryTool',
  shell_command: 'shellTool',
  send_message: 'sendMessageTool',
  send_slack_message: 'sendSlackMessageTool',
  remind_me: 'remindMeTool',
  github_clone_repo: 'githubCloneRepoTool',
  call_agent: 'callAgentTool',
};

const TOOL_TYPES_WITH_NAME = new Set<TeamToolType>(['manage', 'memory', 'call_agent']);
const TOOL_TYPES_WITH_DESCRIPTION = TOOL_TYPES_WITH_NAME;

type AttachmentKind = TeamAttachment['kind'];

const ATTACHMENT_KINDS: Record<AttachmentKind, { source: TeamEntityType; target: TeamEntityType }> = {
  agent_tool: { source: 'agent', target: 'tool' },
  agent_memoryBucket: { source: 'agent', target: 'memoryBucket' },
  agent_workspaceConfiguration: { source: 'agent', target: 'workspaceConfiguration' },
  agent_mcpServer: { source: 'agent', target: 'mcpServer' },
  mcpServer_workspaceConfiguration: { source: 'mcpServer', target: 'workspaceConfiguration' },
};

function normalizeId(value?: string): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function edgeKey(source: string, sourceHandle: string, target: string, targetHandle: string): string {
  return `${source}-${sourceHandle}__${target}-${targetHandle}`;
}

function mapAgentConfig(agent: TeamAgent): Record<string, unknown> | undefined {
  const config = { ...agent.config };
  const title = typeof agent.title === 'string' ? agent.title.trim() : '';
  if (title) config.title = title;
  return Object.keys(config).length > 0 ? config : undefined;
}

function mapToolConfig(tool: TeamTool): Record<string, unknown> | undefined {
  const config = { ...tool.config };
  const title = typeof tool.name === 'string' ? tool.name.trim() : '';
  if (title) {
    config.title = title;
    if (TOOL_TYPES_WITH_NAME.has(tool.type)) {
      config.name = title;
    }
  }
  const description = typeof tool.description === 'string' ? tool.description.trim() : '';
  if (description && TOOL_TYPES_WITH_DESCRIPTION.has(tool.type)) {
    config.description = description;
  }
  return Object.keys(config).length > 0 ? config : undefined;
}

function mapMcpConfig(server: TeamMcpServer): Record<string, unknown> | undefined {
  const config = { ...server.config };
  const title = typeof server.title === 'string' ? server.title.trim() : '';
  if (title) config.title = title;
  return Object.keys(config).length > 0 ? config : undefined;
}

function mapWorkspaceConfig(workspace: TeamWorkspaceConfiguration): Record<string, unknown> | undefined {
  const config = { ...workspace.config };
  const title = typeof workspace.title === 'string' ? workspace.title.trim() : '';
  if (title) config.title = title;
  return Object.keys(config).length > 0 ? config : undefined;
}

function mapMemoryConfig(bucket: TeamMemoryBucket): Record<string, unknown> | undefined {
  const config = { ...bucket.config };
  const title = typeof bucket.title === 'string' ? bucket.title.trim() : '';
  if (title) config.title = title;
  return Object.keys(config).length > 0 ? config : undefined;
}

function addToSet(map: Map<string, Set<string>>, key: string, value: string): void {
  const existing = map.get(key);
  if (existing) {
    existing.add(value);
    return;
  }
  map.set(key, new Set([value]));
}

function memoryConnectorId(agentId: string, memoryId: string): string {
  return `memoryConnector:${agentId}:${memoryId}`;
}

function addWorkspaceToolEdges(
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

function addWorkspaceMcpEdges(
  workspaceId: string,
  mcpIds: Set<string>,
  addEdge: (source: string, sourceHandle: string, target: string, targetHandle: string) => void,
): void {
  for (const mcpId of mcpIds) {
    addEdge(workspaceId, '$self', mcpId, 'workspace');
  }
}

function addWorkspaceEdges(
  workspaceIds: Set<string>,
  toolIds: Set<string> | undefined,
  mcpIds: Set<string> | undefined,
  toolTemplateById: Map<string, string>,
  addEdge: (source: string, sourceHandle: string, target: string, targetHandle: string) => void,
): void {
  if (!toolIds && !mcpIds) return;
  for (const workspaceId of workspaceIds) {
    if (toolIds) {
      addWorkspaceToolEdges(workspaceId, toolIds, toolTemplateById, addEdge);
    }
    if (mcpIds) {
      addWorkspaceMcpEdges(workspaceId, mcpIds, addEdge);
    }
  }
}

function matchesAttachmentTypes(attachment: TeamAttachment, source: TeamEntityType, target: TeamEntityType): boolean {
  return attachment.sourceType === source && attachment.targetType === target;
}

export async function fetchTeamsGraphSnapshot(): Promise<GraphPersisted> {
  const [agents, tools, mcps, workspaces, memoryBuckets, attachments] = await Promise.all([
    listAllAgents(),
    listAllTools(),
    listAllMcpServers(),
    listAllWorkspaceConfigurations(),
    listAllMemoryBuckets(),
    listAllAttachments(),
  ]);

  const nodes: GraphPersisted['nodes'] = [];
  const edges: GraphPersisted['edges'] = [];
  const nodeIds = new Set<string>();
  const edgeKeys = new Set<string>();
  const toolTemplateById = new Map<string, string>();
  const agentTools = new Map<string, Set<string>>();
  const agentMcps = new Map<string, Set<string>>();
  const agentWorkspaces = new Map<string, Set<string>>();

  const addNode = (node: GraphPersisted['nodes'][number]): void => {
    if (!node.id || nodeIds.has(node.id)) return;
    nodes.push(node);
    nodeIds.add(node.id);
  };

  const addEdge = (source: string, sourceHandle: string, target: string, targetHandle: string): void => {
    if (!nodeIds.has(source) || !nodeIds.has(target)) return;
    if (!sourceHandle || !targetHandle) return;
    const key = edgeKey(source, sourceHandle, target, targetHandle);
    if (edgeKeys.has(key)) return;
    edgeKeys.add(key);
    edges.push({ id: key, source, sourceHandle, target, targetHandle });
  };

  for (const agent of agents) {
    const id = normalizeId(agent.id);
    if (!id) continue;
    addNode({ id, template: 'agent', config: mapAgentConfig(agent) });
  }

  for (const tool of tools) {
    const id = normalizeId(tool.id);
    if (!id) continue;
    const template = TOOL_TYPE_TO_TEMPLATE[tool.type];
    if (!template) continue;
    toolTemplateById.set(id, template);
    addNode({ id, template, config: mapToolConfig(tool) });
  }

  for (const mcp of mcps) {
    const id = normalizeId(mcp.id);
    if (!id) continue;
    addNode({ id, template: 'mcpServer', config: mapMcpConfig(mcp) });
  }

  for (const workspace of workspaces) {
    const id = normalizeId(workspace.id);
    if (!id) continue;
    addNode({ id, template: 'workspace', config: mapWorkspaceConfig(workspace) });
  }

  for (const memory of memoryBuckets) {
    const id = normalizeId(memory.id);
    if (!id) continue;
    addNode({ id, template: 'memory', config: mapMemoryConfig(memory) });
  }

  for (const attachment of attachments) {
    switch (attachment.kind) {
      case 'agent_tool': {
        if (!matchesAttachmentTypes(attachment, ATTACHMENT_KINDS.agent_tool.source, ATTACHMENT_KINDS.agent_tool.target)) {
          break;
        }
        const agentId = normalizeId(attachment.sourceId);
        const toolId = normalizeId(attachment.targetId);
        if (!agentId || !toolId) break;
        addEdge(agentId, 'tools', toolId, '$self');
        addToSet(agentTools, agentId, toolId);
        break;
      }
      case 'agent_mcpServer': {
        if (!matchesAttachmentTypes(attachment, ATTACHMENT_KINDS.agent_mcpServer.source, ATTACHMENT_KINDS.agent_mcpServer.target)) {
          break;
        }
        const agentId = normalizeId(attachment.sourceId);
        const mcpId = normalizeId(attachment.targetId);
        if (!agentId || !mcpId) break;
        addEdge(agentId, 'mcp', mcpId, '$self');
        addToSet(agentMcps, agentId, mcpId);
        break;
      }
      case 'agent_memoryBucket': {
        if (!matchesAttachmentTypes(
          attachment,
          ATTACHMENT_KINDS.agent_memoryBucket.source,
          ATTACHMENT_KINDS.agent_memoryBucket.target,
        )) {
          break;
        }
        const agentId = normalizeId(attachment.sourceId);
        const memoryId = normalizeId(attachment.targetId);
        if (!agentId || !memoryId) break;
        if (!nodeIds.has(agentId) || !nodeIds.has(memoryId)) break;
        const connectorId = memoryConnectorId(agentId, memoryId);
        if (!nodeIds.has(connectorId)) {
          addNode({ id: connectorId, template: 'memoryConnector' });
        }
        addEdge(memoryId, '$self', connectorId, '$memory');
        addEdge(connectorId, '$self', agentId, 'memory');
        break;
      }
      case 'agent_workspaceConfiguration': {
        if (!matchesAttachmentTypes(
          attachment,
          ATTACHMENT_KINDS.agent_workspaceConfiguration.source,
          ATTACHMENT_KINDS.agent_workspaceConfiguration.target,
        )) {
          break;
        }
        const agentId = normalizeId(attachment.sourceId);
        const workspaceId = normalizeId(attachment.targetId);
        if (!agentId || !workspaceId) break;
        addToSet(agentWorkspaces, agentId, workspaceId);
        break;
      }
      case 'mcpServer_workspaceConfiguration': {
        if (!matchesAttachmentTypes(
          attachment,
          ATTACHMENT_KINDS.mcpServer_workspaceConfiguration.source,
          ATTACHMENT_KINDS.mcpServer_workspaceConfiguration.target,
        )) {
          break;
        }
        const mcpId = normalizeId(attachment.sourceId);
        const workspaceId = normalizeId(attachment.targetId);
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
    addWorkspaceEdges(workspaceIds, toolIds, mcpIds, toolTemplateById, addEdge);
  }

  return {
    name: 'main',
    version: 0,
    updatedAt: new Date().toISOString(),
    nodes,
    edges,
  };
}
