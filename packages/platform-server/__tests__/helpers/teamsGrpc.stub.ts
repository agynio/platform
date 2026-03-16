import type {
  Agent,
  Attachment,
  McpServer,
  MemoryBucket,
  Tool,
  WorkspaceConfiguration,
} from '../../src/proto/gen/agynio/api/teams/v1/teams_pb';
import { ToolType } from '../../src/proto/gen/agynio/api/teams/v1/teams_pb';
import type { TeamsGrpcClient } from '../../src/teams/teamsGrpc.client';

type TeamsClientStubOptions = {
  agents?: Agent[];
  tools?: Tool[];
  mcps?: McpServer[];
  workspaces?: WorkspaceConfiguration[];
  memoryBuckets?: MemoryBucket[];
  attachments?: Attachment[];
  listAgents?: TeamsGrpcClient['listAgents'];
  listTools?: TeamsGrpcClient['listTools'];
  listMcpServers?: TeamsGrpcClient['listMcpServers'];
  listWorkspaceConfigurations?: TeamsGrpcClient['listWorkspaceConfigurations'];
  listMemoryBuckets?: TeamsGrpcClient['listMemoryBuckets'];
  listAttachments?: TeamsGrpcClient['listAttachments'];
};

export const createTeamsClientStub = (options?: TeamsClientStubOptions): TeamsGrpcClient => {
  const agents = options?.agents ?? [];
  const tools = options?.tools ?? [];
  const mcps = options?.mcps ?? [];
  const workspaces = options?.workspaces ?? [];
  const memoryBuckets = options?.memoryBuckets ?? [];
  const attachments = options?.attachments ?? [];

  const readOffset = (token?: string) => {
    if (!token) return 0;
    const offset = Number.parseInt(token, 10);
    if (!Number.isFinite(offset) || offset < 0) return 0;
    return offset;
  };

  const paginate = <T>(items: T[], pageSize: number, pageToken?: string) => {
    const size = pageSize > 0 ? pageSize : items.length;
    const start = readOffset(pageToken);
    const nextOffset = start + size;
    return {
      items: items.slice(start, start + size),
      nextPageToken: nextOffset < items.length ? String(nextOffset) : '',
    };
  };

  const listAgents = options?.listAgents ??
    (async (request: { pageSize: number; pageToken?: string }) => {
      const { items, nextPageToken } = paginate(agents, request.pageSize, request.pageToken);
      return { agents: items, nextPageToken };
    });
  const listTools = options?.listTools ??
    (async (request: { pageSize: number; pageToken?: string; type?: Tool['type'] }) => {
      const shouldFilter = typeof request.type === 'number' && request.type !== ToolType.UNSPECIFIED;
      const { items, nextPageToken } = paginate(
        shouldFilter ? tools.filter((tool) => tool.type === request.type) : tools,
        request.pageSize,
        request.pageToken,
      );
      return { tools: items, nextPageToken };
    });
  const listMcpServers = options?.listMcpServers ??
    (async (request: { pageSize: number; pageToken?: string }) => {
      const { items, nextPageToken } = paginate(mcps, request.pageSize, request.pageToken);
      return { mcpServers: items, nextPageToken };
    });
  const listWorkspaceConfigurations = options?.listWorkspaceConfigurations ??
    (async (request: { pageSize: number; pageToken?: string }) => {
      const { items, nextPageToken } = paginate(workspaces, request.pageSize, request.pageToken);
      return { workspaceConfigurations: items, nextPageToken };
    });
  const listMemoryBuckets = options?.listMemoryBuckets ??
    (async (request: { pageSize: number; pageToken?: string }) => {
      const { items, nextPageToken } = paginate(memoryBuckets, request.pageSize, request.pageToken);
      return { memoryBuckets: items, nextPageToken };
    });
  const listAttachments = options?.listAttachments ??
    (async (request: { pageSize: number; pageToken?: string; kind?: Attachment['kind']; sourceType?: Attachment['sourceType']; targetType?: Attachment['targetType'] }) => {
      const { items, nextPageToken } = paginate(
        attachments.filter((attachment) =>
          attachment.kind === request.kind
          && attachment.sourceType === request.sourceType
          && attachment.targetType === request.targetType),
        request.pageSize,
        request.pageToken,
      );
      return { attachments: items, nextPageToken };
    });

  return {
    listAgents,
    listTools,
    listMcpServers,
    listWorkspaceConfigurations,
    listMemoryBuckets,
    listAttachments,
  } as unknown as TeamsGrpcClient;
};
