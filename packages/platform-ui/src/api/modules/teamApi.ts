import { http } from '../http';
import type {
  TeamAgent,
  TeamAgentCreateRequest,
  TeamAgentUpdateRequest,
  TeamAttachment,
  TeamAttachmentCreateRequest,
  TeamAttachmentKind,
  TeamEntityType,
  TeamListResponse,
  TeamMemoryBucket,
  TeamMemoryBucketCreateRequest,
  TeamMemoryBucketUpdateRequest,
  TeamMcpServer,
  TeamMcpServerCreateRequest,
  TeamMcpServerUpdateRequest,
  TeamTool,
  TeamToolCreateRequest,
  TeamToolType,
  TeamToolUpdateRequest,
  TeamWorkspaceConfiguration,
  TeamWorkspaceConfigurationCreateRequest,
  TeamWorkspaceConfigurationUpdateRequest,
} from '../types/team';
import { isRecord, readNumber, readString } from '@/utils/typeGuards';

const TEAM_API_PREFIX = '/apiv2/team/v1';
const DEFAULT_PAGE_SIZE = 100;

export type TeamListParams = {
  page?: number;
  perPage?: number;
  q?: string;
};

type PageInfo = {
  page: number;
  perPage: number;
  total: number;
};

const TOOL_TYPES = new Set<TeamToolType>([
  'manage',
  'memory',
  'shell_command',
  'send_message',
  'send_slack_message',
  'remind_me',
  'github_clone_repo',
  'call_agent',
]);

const ATTACHMENT_KINDS = new Set<TeamAttachmentKind>([
  'agent_tool',
  'agent_memoryBucket',
  'agent_workspaceConfiguration',
  'agent_mcpServer',
  'mcpServer_workspaceConfiguration',
]);

const ENTITY_TYPES = new Set<TeamEntityType>([
  'agent',
  'tool',
  'mcpServer',
  'workspaceConfiguration',
  'memoryBucket',
]);

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(`Unexpected ${label} response`);
  }
  return value;
}

function readRequiredString(record: Record<string, unknown>, key: string, label: string): string {
  const value = readString(record[key]);
  if (!value) {
    throw new Error(`Unexpected ${label} response`);
  }
  return value;
}

function readRequiredRecord(record: Record<string, unknown>, key: string, label: string): Record<string, unknown> {
  const value = record[key];
  if (!isRecord(value)) {
    throw new Error(`Unexpected ${label} response`);
  }
  return value;
}

function readEnumValue<T extends string>(value: unknown, allowed: ReadonlySet<T>, label: string): T {
  const trimmed = readString(value);
  if (!trimmed || !allowed.has(trimmed as T)) {
    throw new Error(`Unexpected ${label} response`);
  }
  return trimmed as T;
}

function readPageInfo(record: Record<string, unknown>): PageInfo {
  const page = readNumber(record.page);
  const perPage = readNumber(record.perPage);
  const total = readNumber(record.total);
  if (page === undefined || perPage === undefined || total === undefined) {
    throw new Error('Unexpected list response');
  }
  return { page, perPage, total };
}

function parseListResponse<T>(payload: unknown, parseItem: (item: unknown) => T): TeamListResponse<T> {
  const record = requireRecord(payload, 'list');
  const items = record.items;
  if (!Array.isArray(items)) {
    throw new Error('Unexpected list response');
  }
  const pageInfo = readPageInfo(record);
  return { items: items.map((item) => parseItem(item)), ...pageInfo };
}

function buildListParams(params?: TeamListParams): Record<string, string | number> {
  if (!params) return {};
  const result: Record<string, string | number> = {};
  if (typeof params.page === 'number') result.page = params.page;
  if (typeof params.perPage === 'number') result.perPage = params.perPage;
  const query = readString(params.q);
  if (query) result.q = query;
  return result;
}

function parseEntityMeta(record: Record<string, unknown>, label: string): { id: string; createdAt: string; updatedAt: string } {
  return {
    id: readRequiredString(record, 'id', label),
    createdAt: readRequiredString(record, 'createdAt', label),
    updatedAt: readRequiredString(record, 'updatedAt', label),
  };
}

function parseAgent(raw: unknown): TeamAgent {
  const record = requireRecord(raw, 'agent');
  const meta = parseEntityMeta(record, 'agent');
  return {
    ...meta,
    title: readString(record.title),
    description: readString(record.description),
    config: readRequiredRecord(record, 'config', 'agent'),
  };
}

function parseTool(raw: unknown): TeamTool {
  const record = requireRecord(raw, 'tool');
  const meta = parseEntityMeta(record, 'tool');
  return {
    ...meta,
    type: readEnumValue(record.type, TOOL_TYPES, 'tool'),
    name: readString(record.name),
    description: readString(record.description),
    config: readRequiredRecord(record, 'config', 'tool'),
  };
}

function parseMcpServer(raw: unknown): TeamMcpServer {
  const record = requireRecord(raw, 'mcp server');
  const meta = parseEntityMeta(record, 'mcp server');
  return {
    ...meta,
    title: readString(record.title),
    description: readString(record.description),
    config: readRequiredRecord(record, 'config', 'mcp server'),
  };
}

function parseWorkspaceConfiguration(raw: unknown): TeamWorkspaceConfiguration {
  const record = requireRecord(raw, 'workspace configuration');
  const meta = parseEntityMeta(record, 'workspace configuration');
  return {
    ...meta,
    title: readString(record.title),
    description: readString(record.description),
    config: readRequiredRecord(record, 'config', 'workspace configuration'),
  };
}

function parseMemoryBucket(raw: unknown): TeamMemoryBucket {
  const record = requireRecord(raw, 'memory bucket');
  const meta = parseEntityMeta(record, 'memory bucket');
  return {
    ...meta,
    title: readString(record.title),
    description: readString(record.description),
    config: readRequiredRecord(record, 'config', 'memory bucket'),
  };
}

function parseAttachment(raw: unknown): TeamAttachment {
  const record = requireRecord(raw, 'attachment');
  const meta = parseEntityMeta(record, 'attachment');
  return {
    ...meta,
    kind: readEnumValue(record.kind, ATTACHMENT_KINDS, 'attachment kind'),
    sourceId: readRequiredString(record, 'sourceId', 'attachment'),
    targetId: readRequiredString(record, 'targetId', 'attachment'),
    sourceType: readEnumValue(record.sourceType, ENTITY_TYPES, 'attachment sourceType'),
    targetType: readEnumValue(record.targetType, ENTITY_TYPES, 'attachment targetType'),
  };
}

async function listAllPages<T>(
  fetchPage: (params: TeamListParams) => Promise<TeamListResponse<T>>,
  params?: TeamListParams,
): Promise<T[]> {
  const items: T[] = [];
  let page = params?.page ?? 1;
  const perPage = params?.perPage ?? DEFAULT_PAGE_SIZE;
  const q = params?.q;
  for (let i = 0; i < 50; i += 1) {
    const response = await fetchPage({ page, perPage, q });
    items.push(...response.items);
    if (response.page * response.perPage >= response.total) break;
    page = response.page + 1;
  }
  return items;
}

export async function listAgents(params?: TeamListParams): Promise<TeamListResponse<TeamAgent>> {
  const payload = await http.get<unknown>(`${TEAM_API_PREFIX}/agents`, { params: buildListParams(params) });
  return parseListResponse(payload, parseAgent);
}

export async function listAllAgents(): Promise<TeamAgent[]> {
  return listAllPages(listAgents);
}

export async function createAgent(payload: TeamAgentCreateRequest): Promise<TeamAgent> {
  const response = await http.post<unknown>(`${TEAM_API_PREFIX}/agents`, payload);
  return parseAgent(response);
}

export async function updateAgent(id: string, payload: TeamAgentUpdateRequest): Promise<TeamAgent> {
  const response = await http.patch<unknown>(`${TEAM_API_PREFIX}/agents/${id}`, payload);
  return parseAgent(response);
}

export async function deleteAgent(id: string): Promise<void> {
  await http.delete(`${TEAM_API_PREFIX}/agents/${id}`);
}

export async function listTools(params?: TeamListParams): Promise<TeamListResponse<TeamTool>> {
  const payload = await http.get<unknown>(`${TEAM_API_PREFIX}/tools`, { params: buildListParams(params) });
  return parseListResponse(payload, parseTool);
}

export async function listAllTools(): Promise<TeamTool[]> {
  return listAllPages(listTools);
}

export async function createTool(payload: TeamToolCreateRequest): Promise<TeamTool> {
  const response = await http.post<unknown>(`${TEAM_API_PREFIX}/tools`, payload);
  return parseTool(response);
}

export async function updateTool(id: string, payload: TeamToolUpdateRequest): Promise<TeamTool> {
  const response = await http.patch<unknown>(`${TEAM_API_PREFIX}/tools/${id}`, payload);
  return parseTool(response);
}

export async function deleteTool(id: string): Promise<void> {
  await http.delete(`${TEAM_API_PREFIX}/tools/${id}`);
}

export async function listMcpServers(params?: TeamListParams): Promise<TeamListResponse<TeamMcpServer>> {
  const payload = await http.get<unknown>(`${TEAM_API_PREFIX}/mcp-servers`, { params: buildListParams(params) });
  return parseListResponse(payload, parseMcpServer);
}

export async function listAllMcpServers(): Promise<TeamMcpServer[]> {
  return listAllPages(listMcpServers);
}

export async function createMcpServer(payload: TeamMcpServerCreateRequest): Promise<TeamMcpServer> {
  const response = await http.post<unknown>(`${TEAM_API_PREFIX}/mcp-servers`, payload);
  return parseMcpServer(response);
}

export async function updateMcpServer(id: string, payload: TeamMcpServerUpdateRequest): Promise<TeamMcpServer> {
  const response = await http.patch<unknown>(`${TEAM_API_PREFIX}/mcp-servers/${id}`, payload);
  return parseMcpServer(response);
}

export async function deleteMcpServer(id: string): Promise<void> {
  await http.delete(`${TEAM_API_PREFIX}/mcp-servers/${id}`);
}

export async function listWorkspaceConfigurations(
  params?: TeamListParams,
): Promise<TeamListResponse<TeamWorkspaceConfiguration>> {
  const payload = await http.get<unknown>(`${TEAM_API_PREFIX}/workspace-configurations`, {
    params: buildListParams(params),
  });
  return parseListResponse(payload, parseWorkspaceConfiguration);
}

export async function listAllWorkspaceConfigurations(): Promise<TeamWorkspaceConfiguration[]> {
  return listAllPages(listWorkspaceConfigurations);
}

export async function createWorkspaceConfiguration(
  payload: TeamWorkspaceConfigurationCreateRequest,
): Promise<TeamWorkspaceConfiguration> {
  const response = await http.post<unknown>(`${TEAM_API_PREFIX}/workspace-configurations`, payload);
  return parseWorkspaceConfiguration(response);
}

export async function updateWorkspaceConfiguration(
  id: string,
  payload: TeamWorkspaceConfigurationUpdateRequest,
): Promise<TeamWorkspaceConfiguration> {
  const response = await http.patch<unknown>(`${TEAM_API_PREFIX}/workspace-configurations/${id}`, payload);
  return parseWorkspaceConfiguration(response);
}

export async function deleteWorkspaceConfiguration(id: string): Promise<void> {
  await http.delete(`${TEAM_API_PREFIX}/workspace-configurations/${id}`);
}

export async function listMemoryBuckets(params?: TeamListParams): Promise<TeamListResponse<TeamMemoryBucket>> {
  const payload = await http.get<unknown>(`${TEAM_API_PREFIX}/memory-buckets`, { params: buildListParams(params) });
  return parseListResponse(payload, parseMemoryBucket);
}

export async function listAllMemoryBuckets(): Promise<TeamMemoryBucket[]> {
  return listAllPages(listMemoryBuckets);
}

export async function createMemoryBucket(payload: TeamMemoryBucketCreateRequest): Promise<TeamMemoryBucket> {
  const response = await http.post<unknown>(`${TEAM_API_PREFIX}/memory-buckets`, payload);
  return parseMemoryBucket(response);
}

export async function updateMemoryBucket(id: string, payload: TeamMemoryBucketUpdateRequest): Promise<TeamMemoryBucket> {
  const response = await http.patch<unknown>(`${TEAM_API_PREFIX}/memory-buckets/${id}`, payload);
  return parseMemoryBucket(response);
}

export async function deleteMemoryBucket(id: string): Promise<void> {
  await http.delete(`${TEAM_API_PREFIX}/memory-buckets/${id}`);
}

export async function listAttachments(params?: TeamListParams): Promise<TeamListResponse<TeamAttachment>> {
  const payload = await http.get<unknown>(`${TEAM_API_PREFIX}/attachments`, { params: buildListParams(params) });
  return parseListResponse(payload, parseAttachment);
}

export async function listAllAttachments(): Promise<TeamAttachment[]> {
  return listAllPages(listAttachments);
}

export async function createAttachment(payload: TeamAttachmentCreateRequest): Promise<TeamAttachment> {
  const response = await http.post<unknown>(`${TEAM_API_PREFIX}/attachments`, payload);
  return parseAttachment(response);
}

export async function deleteAttachment(id: string): Promise<void> {
  await http.delete(`${TEAM_API_PREFIX}/attachments/${id}`);
}
