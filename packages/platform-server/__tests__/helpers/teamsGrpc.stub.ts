import type {
  Agent,
  Attachment,
  McpServer,
  MemoryBucket,
  Tool,
  WorkspaceConfiguration,
} from '../../src/proto/gen/agynio/api/teams/v1/teams_pb';
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

  const paginate = <T>(items: T[], page: number, perPage: number) => {
    const start = Math.max(0, (page - 1) * perPage);
    return {
      items: items.slice(start, start + perPage),
      page,
      perPage,
      total: BigInt(items.length),
    };
  };

  const listAgents = options?.listAgents ?? (async (request: { page: number; perPage: number }) => paginate(agents, request.page, request.perPage));
  const listTools = options?.listTools ??
    (async (request: { page: number; perPage: number; type?: Tool['type'] }) =>
      paginate(
        request.type === undefined ? tools : tools.filter((tool) => tool.type === request.type),
        request.page,
        request.perPage,
      ));
  const listMcpServers = options?.listMcpServers ?? (async (request: { page: number; perPage: number }) => paginate(mcps, request.page, request.perPage));
  const listWorkspaceConfigurations = options?.listWorkspaceConfigurations ??
    (async (request: { page: number; perPage: number }) => paginate(workspaces, request.page, request.perPage));
  const listMemoryBuckets = options?.listMemoryBuckets ??
    (async (request: { page: number; perPage: number }) => paginate(memoryBuckets, request.page, request.perPage));
  const listAttachments = options?.listAttachments ??
    (async (request: { page: number; perPage: number; kind?: Attachment['kind']; sourceType?: Attachment['sourceType']; targetType?: Attachment['targetType'] }) =>
      paginate(
        attachments.filter((attachment) =>
          attachment.kind === request.kind
          && attachment.sourceType === request.sourceType
          && attachment.targetType === request.targetType),
        request.page,
        request.perPage,
      ));

  return {
    listAgents,
    listTools,
    listMcpServers,
    listWorkspaceConfigurations,
    listMemoryBuckets,
    listAttachments,
  } as unknown as TeamsGrpcClient;
};
