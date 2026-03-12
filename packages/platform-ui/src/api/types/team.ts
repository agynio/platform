export type TeamAgentWhenBusy = 'wait' | 'injectAfterTools';

export type TeamAgentProcessBuffer = 'allTogether' | 'oneByOne';

export type TeamToolType =
  | 'manage'
  | 'memory'
  | 'shell_command'
  | 'send_message'
  | 'send_slack_message'
  | 'remind_me'
  | 'github_clone_repo'
  | 'call_agent';

export type TeamWorkspacePlatform = 'linux/amd64' | 'linux/arm64' | 'auto';

export type TeamMemoryBucketScope = 'global' | 'perThread';

export type TeamEntityType = 'agent' | 'tool' | 'mcpServer' | 'workspaceConfiguration' | 'memoryBucket';

export type TeamAttachmentKind =
  | 'agent_tool'
  | 'agent_memoryBucket'
  | 'agent_workspaceConfiguration'
  | 'agent_mcpServer'
  | 'mcpServer_workspaceConfiguration';

export interface TeamListResponse<T> {
  items: T[];
  page: number;
  perPage: number;
  total: number;
}

export interface TeamAgent {
  id: string;
  createdAt: string;
  updatedAt: string;
  title?: string;
  description?: string;
  config: Record<string, unknown>;
}

export interface TeamTool {
  id: string;
  createdAt: string;
  updatedAt: string;
  type: TeamToolType;
  name?: string;
  description?: string;
  config: Record<string, unknown>;
}

export interface TeamMcpServer {
  id: string;
  createdAt: string;
  updatedAt: string;
  title?: string;
  description?: string;
  config: Record<string, unknown>;
}

export interface TeamWorkspaceConfiguration {
  id: string;
  createdAt: string;
  updatedAt: string;
  title?: string;
  description?: string;
  config: Record<string, unknown>;
}

export interface TeamMemoryBucket {
  id: string;
  createdAt: string;
  updatedAt: string;
  title?: string;
  description?: string;
  config: Record<string, unknown>;
}

export interface TeamAttachment {
  id: string;
  createdAt: string;
  updatedAt: string;
  kind: TeamAttachmentKind;
  sourceId: string;
  targetId: string;
  sourceType: TeamEntityType;
  targetType: TeamEntityType;
}

export interface TeamAgentCreateRequest {
  title?: string;
  description?: string;
  config: Record<string, unknown>;
}

export interface TeamAgentUpdateRequest {
  title?: string;
  description?: string;
  config?: Record<string, unknown>;
}

export interface TeamToolCreateRequest {
  type: TeamToolType;
  name?: string;
  description?: string;
  config?: Record<string, unknown>;
}

export interface TeamToolUpdateRequest {
  name?: string;
  description?: string;
  config?: Record<string, unknown>;
}

export interface TeamMcpServerCreateRequest {
  title?: string;
  description?: string;
  config: Record<string, unknown>;
}

export interface TeamMcpServerUpdateRequest {
  title?: string;
  description?: string;
  config?: Record<string, unknown>;
}

export interface TeamWorkspaceConfigurationCreateRequest {
  title?: string;
  description?: string;
  config: Record<string, unknown>;
}

export interface TeamWorkspaceConfigurationUpdateRequest {
  title?: string;
  description?: string;
  config?: Record<string, unknown>;
}

export interface TeamMemoryBucketCreateRequest {
  title?: string;
  description?: string;
  config: Record<string, unknown>;
}

export interface TeamMemoryBucketUpdateRequest {
  title?: string;
  description?: string;
  config?: Record<string, unknown>;
}

export interface TeamAttachmentCreateRequest {
  kind: TeamAttachmentKind;
  sourceId: string;
  targetId: string;
}
