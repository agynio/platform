import { http } from '../http';
import type {
  TeamAgent,
  TeamAttachment,
  TeamListResponse,
  TeamMemoryBucket,
  TeamMcpServer,
  TeamTool,
  TeamWorkspaceConfiguration,
} from '../types/team';

const TEAM_API_PREFIX = '/apiv2/team/v1';
const DEFAULT_PAGE_SIZE = 200;

export type TeamListParams = {
  pageToken?: string;
  pageSize?: number;
};

type PageInfo = {
  nextPageToken?: string;
  page?: number;
  perPage?: number;
  total?: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readString(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value;
  }
  return undefined;
}

function readNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function readPageInfo(record: Record<string, unknown>): PageInfo {
  const nextPageToken = readString(record.nextPageToken ?? record.next_page_token);
  const page = readNumber(record.page ?? record.pageNumber ?? record.page_number);
  const perPage = readNumber(record.perPage ?? record.per_page);
  const total = readNumber(record.total);
  return { nextPageToken, page, perPage, total };
}

function getItems<T>(record: Record<string, unknown>, key: string): T[] {
  const raw = record[key] ?? record.items;
  return Array.isArray(raw) ? (raw as T[]) : [];
}

function parseListResponse<T>(payload: unknown, key: string): TeamListResponse<T> {
  if (!isRecord(payload)) {
    return { items: [] };
  }
  const items = getItems<T>(payload, key);
  const pageInfo = readPageInfo(payload);
  return { items, ...pageInfo };
}

function buildListParams(params?: TeamListParams): Record<string, string | number> {
  if (!params) return {};
  const result: Record<string, string | number> = {};
  if (params.pageSize !== undefined) {
    result.pageSize = params.pageSize;
    result.page_size = params.pageSize;
    result.per_page = params.pageSize;
  }
  if (params.pageToken !== undefined) {
    result.pageToken = params.pageToken;
    result.page_token = params.pageToken;
    const parsed = Number(params.pageToken);
    if (Number.isFinite(parsed)) {
      result.page = parsed;
    }
  }
  return result;
}

function resolveNextPageToken(pageInfo: PageInfo, pageSize: number, currentPage: number, count: number): string | undefined {
  if (pageInfo.nextPageToken) return pageInfo.nextPageToken;
  if (pageInfo.page !== undefined && pageInfo.perPage !== undefined && pageInfo.total !== undefined) {
    if (pageInfo.page * pageInfo.perPage >= pageInfo.total) {
      return undefined;
    }
    return String(pageInfo.page + 1);
  }
  if (count < pageSize) {
    return undefined;
  }
  return String(currentPage + 1);
}

async function listAllPages<T>(
  fetchPage: (params: TeamListParams) => Promise<TeamListResponse<T>>,
  pageSize = DEFAULT_PAGE_SIZE,
): Promise<T[]> {
  const items: T[] = [];
  let pageToken: string | undefined = undefined;
  let pageIndex = 1;
  for (let i = 0; i < 50; i += 1) {
    const response = await fetchPage({ pageSize, pageToken });
    items.push(...response.items);
    const nextToken = resolveNextPageToken(response, pageSize, pageIndex, response.items.length);
    if (!nextToken) break;
    pageToken = nextToken;
    pageIndex += 1;
  }
  return items;
}

export async function listAgents(params?: TeamListParams): Promise<TeamListResponse<TeamAgent>> {
  const payload = await http.get<unknown>(`${TEAM_API_PREFIX}/agents`, { params: buildListParams(params) });
  return parseListResponse(payload, 'agents');
}

export async function listAllAgents(): Promise<TeamAgent[]> {
  return listAllPages(listAgents);
}

export async function createAgent(payload: Record<string, unknown>): Promise<TeamAgent> {
  return http.post<TeamAgent>(`${TEAM_API_PREFIX}/agents`, payload);
}

export async function updateAgent(id: string, payload: Record<string, unknown>): Promise<TeamAgent> {
  return http.patch<TeamAgent>(`${TEAM_API_PREFIX}/agents/${id}`, payload);
}

export async function deleteAgent(id: string): Promise<void> {
  await http.delete(`${TEAM_API_PREFIX}/agents/${id}`);
}

export async function listTools(params?: TeamListParams): Promise<TeamListResponse<TeamTool>> {
  const payload = await http.get<unknown>(`${TEAM_API_PREFIX}/tools`, { params: buildListParams(params) });
  return parseListResponse(payload, 'tools');
}

export async function listAllTools(): Promise<TeamTool[]> {
  return listAllPages(listTools);
}

export async function createTool(payload: Record<string, unknown>): Promise<TeamTool> {
  return http.post<TeamTool>(`${TEAM_API_PREFIX}/tools`, payload);
}

export async function updateTool(id: string, payload: Record<string, unknown>): Promise<TeamTool> {
  return http.patch<TeamTool>(`${TEAM_API_PREFIX}/tools/${id}`, payload);
}

export async function deleteTool(id: string): Promise<void> {
  await http.delete(`${TEAM_API_PREFIX}/tools/${id}`);
}

export async function listMcpServers(params?: TeamListParams): Promise<TeamListResponse<TeamMcpServer>> {
  const payload = await http.get<unknown>(`${TEAM_API_PREFIX}/mcp-servers`, { params: buildListParams(params) });
  return parseListResponse(payload, 'mcpServers');
}

export async function listAllMcpServers(): Promise<TeamMcpServer[]> {
  return listAllPages(listMcpServers);
}

export async function createMcpServer(payload: Record<string, unknown>): Promise<TeamMcpServer> {
  return http.post<TeamMcpServer>(`${TEAM_API_PREFIX}/mcp-servers`, payload);
}

export async function updateMcpServer(id: string, payload: Record<string, unknown>): Promise<TeamMcpServer> {
  return http.patch<TeamMcpServer>(`${TEAM_API_PREFIX}/mcp-servers/${id}`, payload);
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
  return parseListResponse(payload, 'workspaceConfigurations');
}

export async function listAllWorkspaceConfigurations(): Promise<TeamWorkspaceConfiguration[]> {
  return listAllPages(listWorkspaceConfigurations);
}

export async function createWorkspaceConfiguration(payload: Record<string, unknown>): Promise<TeamWorkspaceConfiguration> {
  return http.post<TeamWorkspaceConfiguration>(`${TEAM_API_PREFIX}/workspace-configurations`, payload);
}

export async function updateWorkspaceConfiguration(
  id: string,
  payload: Record<string, unknown>,
): Promise<TeamWorkspaceConfiguration> {
  return http.patch<TeamWorkspaceConfiguration>(`${TEAM_API_PREFIX}/workspace-configurations/${id}`, payload);
}

export async function deleteWorkspaceConfiguration(id: string): Promise<void> {
  await http.delete(`${TEAM_API_PREFIX}/workspace-configurations/${id}`);
}

export async function listMemoryBuckets(params?: TeamListParams): Promise<TeamListResponse<TeamMemoryBucket>> {
  const payload = await http.get<unknown>(`${TEAM_API_PREFIX}/memory-buckets`, { params: buildListParams(params) });
  return parseListResponse(payload, 'memoryBuckets');
}

export async function listAllMemoryBuckets(): Promise<TeamMemoryBucket[]> {
  return listAllPages(listMemoryBuckets);
}

export async function createMemoryBucket(payload: Record<string, unknown>): Promise<TeamMemoryBucket> {
  return http.post<TeamMemoryBucket>(`${TEAM_API_PREFIX}/memory-buckets`, payload);
}

export async function updateMemoryBucket(id: string, payload: Record<string, unknown>): Promise<TeamMemoryBucket> {
  return http.patch<TeamMemoryBucket>(`${TEAM_API_PREFIX}/memory-buckets/${id}`, payload);
}

export async function deleteMemoryBucket(id: string): Promise<void> {
  await http.delete(`${TEAM_API_PREFIX}/memory-buckets/${id}`);
}

export async function listAttachments(params?: TeamListParams): Promise<TeamListResponse<TeamAttachment>> {
  const payload = await http.get<unknown>(`${TEAM_API_PREFIX}/attachments`, { params: buildListParams(params) });
  return parseListResponse(payload, 'attachments');
}

export async function listAllAttachments(): Promise<TeamAttachment[]> {
  return listAllPages(listAttachments);
}

export async function createAttachment(payload: Record<string, unknown>): Promise<TeamAttachment> {
  return http.post<TeamAttachment>(`${TEAM_API_PREFIX}/attachments`, payload);
}

export async function deleteAttachment(id: string): Promise<void> {
  await http.delete(`${TEAM_API_PREFIX}/attachments/${id}`);
}
