export type TeamAgentWhenBusy =
  | 'AGENT_WHEN_BUSY_UNSPECIFIED'
  | 'AGENT_WHEN_BUSY_WAIT'
  | 'AGENT_WHEN_BUSY_INJECT_AFTER_TOOLS';

export type TeamAgentProcessBuffer =
  | 'AGENT_PROCESS_BUFFER_UNSPECIFIED'
  | 'AGENT_PROCESS_BUFFER_ALL_TOGETHER'
  | 'AGENT_PROCESS_BUFFER_ONE_BY_ONE';

export type TeamToolType =
  | 'TOOL_TYPE_UNSPECIFIED'
  | 'TOOL_TYPE_MANAGE'
  | 'TOOL_TYPE_MEMORY'
  | 'TOOL_TYPE_SHELL_COMMAND'
  | 'TOOL_TYPE_SEND_MESSAGE'
  | 'TOOL_TYPE_SEND_SLACK_MESSAGE'
  | 'TOOL_TYPE_REMIND_ME'
  | 'TOOL_TYPE_GITHUB_CLONE_REPO'
  | 'TOOL_TYPE_CALL_AGENT';

export type TeamWorkspacePlatform =
  | 'WORKSPACE_PLATFORM_UNSPECIFIED'
  | 'WORKSPACE_PLATFORM_LINUX_AMD64'
  | 'WORKSPACE_PLATFORM_LINUX_ARM64'
  | 'WORKSPACE_PLATFORM_AUTO';

export type TeamMemoryBucketScope =
  | 'MEMORY_BUCKET_SCOPE_UNSPECIFIED'
  | 'MEMORY_BUCKET_SCOPE_GLOBAL'
  | 'MEMORY_BUCKET_SCOPE_PER_THREAD';

export type TeamEntityType =
  | 'ENTITY_TYPE_UNSPECIFIED'
  | 'ENTITY_TYPE_AGENT'
  | 'ENTITY_TYPE_TOOL'
  | 'ENTITY_TYPE_MCP_SERVER'
  | 'ENTITY_TYPE_WORKSPACE_CONFIGURATION'
  | 'ENTITY_TYPE_MEMORY_BUCKET';

export type TeamAttachmentKind =
  | 'ATTACHMENT_KIND_UNSPECIFIED'
  | 'ATTACHMENT_KIND_AGENT_TOOL'
  | 'ATTACHMENT_KIND_AGENT_MEMORY_BUCKET'
  | 'ATTACHMENT_KIND_AGENT_WORKSPACE_CONFIGURATION'
  | 'ATTACHMENT_KIND_AGENT_MCP_SERVER'
  | 'ATTACHMENT_KIND_MCP_SERVER_WORKSPACE_CONFIGURATION';

export interface TeamListResponse<T> {
  items: T[];
  nextPageToken?: string;
  page?: number;
  perPage?: number;
  total?: number;
}

export interface TeamAgent {
  id?: string;
  createdAt?: string;
  updatedAt?: string;
  title?: string;
  description?: string;
  config?: Record<string, unknown> | null;
  meta?: { id?: string };
}

export interface TeamTool {
  id?: string;
  createdAt?: string;
  updatedAt?: string;
  type?: TeamToolType | string | number;
  name?: string;
  description?: string;
  config?: Record<string, unknown> | null;
  meta?: { id?: string };
}

export interface TeamMcpServer {
  id?: string;
  createdAt?: string;
  updatedAt?: string;
  title?: string;
  description?: string;
  config?: Record<string, unknown> | null;
  meta?: { id?: string };
}

export interface TeamWorkspaceConfiguration {
  id?: string;
  createdAt?: string;
  updatedAt?: string;
  title?: string;
  description?: string;
  config?: Record<string, unknown> | null;
  meta?: { id?: string };
}

export interface TeamMemoryBucket {
  id?: string;
  createdAt?: string;
  updatedAt?: string;
  title?: string;
  description?: string;
  config?: Record<string, unknown> | null;
  meta?: { id?: string };
}

export interface TeamAttachment {
  id?: string;
  kind?: TeamAttachmentKind | string | number;
  sourceId?: string;
  targetId?: string;
  sourceType?: TeamEntityType | string | number;
  targetType?: TeamEntityType | string | number;
  meta?: { id?: string };
}
