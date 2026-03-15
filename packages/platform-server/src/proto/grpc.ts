import { makeGenericClientConstructor } from '@grpc/grpc-js';
import type { MethodDefinition, ServiceDefinition } from '@grpc/grpc-js';
import { toBinary, fromBinary } from '@bufbuild/protobuf';
import type { DescMessage } from '@bufbuild/protobuf';
import { EmptySchema } from '@bufbuild/protobuf/wkt';
import {
  CancelExecutionRequestSchema,
  CancelExecutionResponseSchema,
  ExecRequestSchema,
  ExecResponseSchema,
  FindWorkloadsByLabelsRequestSchema,
  FindWorkloadsByLabelsResponseSchema,
  GetWorkloadLabelsRequestSchema,
  GetWorkloadLabelsResponseSchema,
  InspectWorkloadRequestSchema,
  InspectWorkloadResponseSchema,
  ListWorkloadsByVolumeRequestSchema,
  ListWorkloadsByVolumeResponseSchema,
  PutArchiveRequestSchema,
  PutArchiveResponseSchema,
  ReadyRequestSchema,
  ReadyResponseSchema,
  RemoveVolumeRequestSchema,
  RemoveVolumeResponseSchema,
  RemoveWorkloadRequestSchema,
  RemoveWorkloadResponseSchema,
  StartWorkloadRequestSchema,
  StartWorkloadResponseSchema,
  StopWorkloadRequestSchema,
  StopWorkloadResponseSchema,
  StreamEventsRequestSchema,
  StreamEventsResponseSchema,
  StreamWorkloadLogsRequestSchema,
  StreamWorkloadLogsResponseSchema,
  TouchWorkloadRequestSchema,
  TouchWorkloadResponseSchema,
} from './gen/agynio/api/runner/v1/runner_pb.js';
import {
  AgentCreateRequestSchema,
  AgentSchema,
  AgentUpdateRequestSchema,
  AttachmentCreateRequestSchema,
  AttachmentSchema,
  DeleteAgentRequestSchema,
  DeleteAttachmentRequestSchema,
  DeleteMcpServerRequestSchema,
  DeleteMemoryBucketRequestSchema,
  DeleteToolRequestSchema,
  DeleteWorkspaceConfigurationRequestSchema,
  GetAgentRequestSchema,
  GetMcpServerRequestSchema,
  GetMemoryBucketRequestSchema,
  GetToolRequestSchema,
  GetWorkspaceConfigurationRequestSchema,
  ListAgentsRequestSchema,
  ListAttachmentsRequestSchema,
  ListMcpServersRequestSchema,
  ListMemoryBucketsRequestSchema,
  ListToolsRequestSchema,
  ListWorkspaceConfigurationsRequestSchema,
  McpServerCreateRequestSchema,
  McpServerSchema,
  McpServerUpdateRequestSchema,
  MemoryBucketCreateRequestSchema,
  MemoryBucketSchema,
  MemoryBucketUpdateRequestSchema,
  PaginatedAgentsSchema,
  PaginatedAttachmentsSchema,
  PaginatedMcpServersSchema,
  PaginatedMemoryBucketsSchema,
  PaginatedToolsSchema,
  PaginatedWorkspaceConfigurationsSchema,
  ToolCreateRequestSchema,
  ToolSchema,
  ToolUpdateRequestSchema,
  WorkspaceConfigurationCreateRequestSchema,
  WorkspaceConfigurationSchema,
  WorkspaceConfigurationUpdateRequestSchema,
} from './gen/agynio/api/teams/v1/teams_pb.js';

const unaryDefinition = (
  path: string,
  input: DescMessage,
  output: DescMessage,
): MethodDefinition<unknown, unknown> => ({
  path,
  requestStream: false,
  responseStream: false,
  requestSerialize: (value: unknown) => Buffer.from(toBinary(input, value as never)),
  responseSerialize: (value: unknown) => Buffer.from(toBinary(output, value as never)),
  requestDeserialize: (buffer: Buffer) => fromBinary(input, buffer),
  responseDeserialize: (buffer: Buffer) => fromBinary(output, buffer),
  originalName: path.split('/').pop() ?? path,
});

const serverStreamDefinition = (
  path: string,
  input: DescMessage,
  output: DescMessage,
): MethodDefinition<unknown, unknown> => ({
  path,
  requestStream: false,
  responseStream: true,
  requestSerialize: (value: unknown) => Buffer.from(toBinary(input, value as never)),
  responseSerialize: (value: unknown) => Buffer.from(toBinary(output, value as never)),
  requestDeserialize: (buffer: Buffer) => fromBinary(input, buffer),
  responseDeserialize: (buffer: Buffer) => fromBinary(output, buffer),
  originalName: path.split('/').pop() ?? path,
});

const bidiDefinition = (
  path: string,
  input: DescMessage,
  output: DescMessage,
): MethodDefinition<unknown, unknown> => ({
  path,
  requestStream: true,
  responseStream: true,
  requestSerialize: (value: unknown) => Buffer.from(toBinary(input, value as never)),
  responseSerialize: (value: unknown) => Buffer.from(toBinary(output, value as never)),
  requestDeserialize: (buffer: Buffer) => fromBinary(input, buffer),
  responseDeserialize: (buffer: Buffer) => fromBinary(output, buffer),
  originalName: path.split('/').pop() ?? path,
});

export const RUNNER_SERVICE_READY_PATH = '/agynio.api.runner.v1.RunnerService/Ready';
export const RUNNER_SERVICE_START_WORKLOAD_PATH = '/agynio.api.runner.v1.RunnerService/StartWorkload';
export const RUNNER_SERVICE_STOP_WORKLOAD_PATH = '/agynio.api.runner.v1.RunnerService/StopWorkload';
export const RUNNER_SERVICE_REMOVE_WORKLOAD_PATH = '/agynio.api.runner.v1.RunnerService/RemoveWorkload';
export const RUNNER_SERVICE_INSPECT_WORKLOAD_PATH = '/agynio.api.runner.v1.RunnerService/InspectWorkload';
export const RUNNER_SERVICE_GET_WORKLOAD_LABELS_PATH = '/agynio.api.runner.v1.RunnerService/GetWorkloadLabels';
export const RUNNER_SERVICE_FIND_WORKLOADS_BY_LABELS_PATH = '/agynio.api.runner.v1.RunnerService/FindWorkloadsByLabels';
export const RUNNER_SERVICE_LIST_WORKLOADS_BY_VOLUME_PATH = '/agynio.api.runner.v1.RunnerService/ListWorkloadsByVolume';
export const RUNNER_SERVICE_REMOVE_VOLUME_PATH = '/agynio.api.runner.v1.RunnerService/RemoveVolume';
export const RUNNER_SERVICE_TOUCH_WORKLOAD_PATH = '/agynio.api.runner.v1.RunnerService/TouchWorkload';
export const RUNNER_SERVICE_PUT_ARCHIVE_PATH = '/agynio.api.runner.v1.RunnerService/PutArchive';
export const RUNNER_SERVICE_STREAM_WORKLOAD_LOGS_PATH = '/agynio.api.runner.v1.RunnerService/StreamWorkloadLogs';
export const RUNNER_SERVICE_STREAM_EVENTS_PATH = '/agynio.api.runner.v1.RunnerService/StreamEvents';
export const RUNNER_SERVICE_EXEC_PATH = '/agynio.api.runner.v1.RunnerService/Exec';
export const RUNNER_SERVICE_CANCEL_EXEC_PATH = '/agynio.api.runner.v1.RunnerService/CancelExecution';

export const runnerServiceGrpcDefinition: ServiceDefinition = {
  ready: unaryDefinition(
    RUNNER_SERVICE_READY_PATH,
    ReadyRequestSchema,
    ReadyResponseSchema,
  ),
  startWorkload: unaryDefinition(
    RUNNER_SERVICE_START_WORKLOAD_PATH,
    StartWorkloadRequestSchema,
    StartWorkloadResponseSchema,
  ),
  stopWorkload: unaryDefinition(
    RUNNER_SERVICE_STOP_WORKLOAD_PATH,
    StopWorkloadRequestSchema,
    StopWorkloadResponseSchema,
  ),
  removeWorkload: unaryDefinition(
    RUNNER_SERVICE_REMOVE_WORKLOAD_PATH,
    RemoveWorkloadRequestSchema,
    RemoveWorkloadResponseSchema,
  ),
  inspectWorkload: unaryDefinition(
    RUNNER_SERVICE_INSPECT_WORKLOAD_PATH,
    InspectWorkloadRequestSchema,
    InspectWorkloadResponseSchema,
  ),
  getWorkloadLabels: unaryDefinition(
    RUNNER_SERVICE_GET_WORKLOAD_LABELS_PATH,
    GetWorkloadLabelsRequestSchema,
    GetWorkloadLabelsResponseSchema,
  ),
  findWorkloadsByLabels: unaryDefinition(
    RUNNER_SERVICE_FIND_WORKLOADS_BY_LABELS_PATH,
    FindWorkloadsByLabelsRequestSchema,
    FindWorkloadsByLabelsResponseSchema,
  ),
  listWorkloadsByVolume: unaryDefinition(
    RUNNER_SERVICE_LIST_WORKLOADS_BY_VOLUME_PATH,
    ListWorkloadsByVolumeRequestSchema,
    ListWorkloadsByVolumeResponseSchema,
  ),
  removeVolume: unaryDefinition(
    RUNNER_SERVICE_REMOVE_VOLUME_PATH,
    RemoveVolumeRequestSchema,
    RemoveVolumeResponseSchema,
  ),
  touchWorkload: unaryDefinition(
    RUNNER_SERVICE_TOUCH_WORKLOAD_PATH,
    TouchWorkloadRequestSchema,
    TouchWorkloadResponseSchema,
  ),
  putArchive: unaryDefinition(
    RUNNER_SERVICE_PUT_ARCHIVE_PATH,
    PutArchiveRequestSchema,
    PutArchiveResponseSchema,
  ),
  streamWorkloadLogs: serverStreamDefinition(
    RUNNER_SERVICE_STREAM_WORKLOAD_LOGS_PATH,
    StreamWorkloadLogsRequestSchema,
    StreamWorkloadLogsResponseSchema,
  ),
  streamEvents: serverStreamDefinition(
    RUNNER_SERVICE_STREAM_EVENTS_PATH,
    StreamEventsRequestSchema,
    StreamEventsResponseSchema,
  ),
  exec: bidiDefinition(
    RUNNER_SERVICE_EXEC_PATH,
    ExecRequestSchema,
    ExecResponseSchema,
  ),
  cancelExecution: unaryDefinition(
    RUNNER_SERVICE_CANCEL_EXEC_PATH,
    CancelExecutionRequestSchema,
    CancelExecutionResponseSchema,
  ),
};

export const RunnerServiceGrpcClient = makeGenericClientConstructor(
  runnerServiceGrpcDefinition,
  'agynio.api.runner.v1.RunnerService',
);

export type RunnerServiceGrpcClientInstance = InstanceType<typeof RunnerServiceGrpcClient>;

export const TEAMS_SERVICE_LIST_AGENTS_PATH = '/agynio.api.teams.v1.TeamsService/ListAgents';
export const TEAMS_SERVICE_CREATE_AGENT_PATH = '/agynio.api.teams.v1.TeamsService/CreateAgent';
export const TEAMS_SERVICE_GET_AGENT_PATH = '/agynio.api.teams.v1.TeamsService/GetAgent';
export const TEAMS_SERVICE_UPDATE_AGENT_PATH = '/agynio.api.teams.v1.TeamsService/UpdateAgent';
export const TEAMS_SERVICE_DELETE_AGENT_PATH = '/agynio.api.teams.v1.TeamsService/DeleteAgent';
export const TEAMS_SERVICE_LIST_TOOLS_PATH = '/agynio.api.teams.v1.TeamsService/ListTools';
export const TEAMS_SERVICE_CREATE_TOOL_PATH = '/agynio.api.teams.v1.TeamsService/CreateTool';
export const TEAMS_SERVICE_GET_TOOL_PATH = '/agynio.api.teams.v1.TeamsService/GetTool';
export const TEAMS_SERVICE_UPDATE_TOOL_PATH = '/agynio.api.teams.v1.TeamsService/UpdateTool';
export const TEAMS_SERVICE_DELETE_TOOL_PATH = '/agynio.api.teams.v1.TeamsService/DeleteTool';
export const TEAMS_SERVICE_LIST_MCP_SERVERS_PATH = '/agynio.api.teams.v1.TeamsService/ListMcpServers';
export const TEAMS_SERVICE_CREATE_MCP_SERVER_PATH = '/agynio.api.teams.v1.TeamsService/CreateMcpServer';
export const TEAMS_SERVICE_GET_MCP_SERVER_PATH = '/agynio.api.teams.v1.TeamsService/GetMcpServer';
export const TEAMS_SERVICE_UPDATE_MCP_SERVER_PATH = '/agynio.api.teams.v1.TeamsService/UpdateMcpServer';
export const TEAMS_SERVICE_DELETE_MCP_SERVER_PATH = '/agynio.api.teams.v1.TeamsService/DeleteMcpServer';
export const TEAMS_SERVICE_LIST_WORKSPACE_CONFIGURATIONS_PATH =
  '/agynio.api.teams.v1.TeamsService/ListWorkspaceConfigurations';
export const TEAMS_SERVICE_CREATE_WORKSPACE_CONFIGURATION_PATH =
  '/agynio.api.teams.v1.TeamsService/CreateWorkspaceConfiguration';
export const TEAMS_SERVICE_GET_WORKSPACE_CONFIGURATION_PATH =
  '/agynio.api.teams.v1.TeamsService/GetWorkspaceConfiguration';
export const TEAMS_SERVICE_UPDATE_WORKSPACE_CONFIGURATION_PATH =
  '/agynio.api.teams.v1.TeamsService/UpdateWorkspaceConfiguration';
export const TEAMS_SERVICE_DELETE_WORKSPACE_CONFIGURATION_PATH =
  '/agynio.api.teams.v1.TeamsService/DeleteWorkspaceConfiguration';
export const TEAMS_SERVICE_LIST_MEMORY_BUCKETS_PATH = '/agynio.api.teams.v1.TeamsService/ListMemoryBuckets';
export const TEAMS_SERVICE_CREATE_MEMORY_BUCKET_PATH = '/agynio.api.teams.v1.TeamsService/CreateMemoryBucket';
export const TEAMS_SERVICE_GET_MEMORY_BUCKET_PATH = '/agynio.api.teams.v1.TeamsService/GetMemoryBucket';
export const TEAMS_SERVICE_UPDATE_MEMORY_BUCKET_PATH = '/agynio.api.teams.v1.TeamsService/UpdateMemoryBucket';
export const TEAMS_SERVICE_DELETE_MEMORY_BUCKET_PATH = '/agynio.api.teams.v1.TeamsService/DeleteMemoryBucket';
export const TEAMS_SERVICE_LIST_ATTACHMENTS_PATH = '/agynio.api.teams.v1.TeamsService/ListAttachments';
export const TEAMS_SERVICE_CREATE_ATTACHMENT_PATH = '/agynio.api.teams.v1.TeamsService/CreateAttachment';
export const TEAMS_SERVICE_DELETE_ATTACHMENT_PATH = '/agynio.api.teams.v1.TeamsService/DeleteAttachment';

export const teamsServiceGrpcDefinition: ServiceDefinition = {
  listAgents: unaryDefinition(
    TEAMS_SERVICE_LIST_AGENTS_PATH,
    ListAgentsRequestSchema,
    PaginatedAgentsSchema,
  ),
  createAgent: unaryDefinition(
    TEAMS_SERVICE_CREATE_AGENT_PATH,
    AgentCreateRequestSchema,
    AgentSchema,
  ),
  getAgent: unaryDefinition(
    TEAMS_SERVICE_GET_AGENT_PATH,
    GetAgentRequestSchema,
    AgentSchema,
  ),
  updateAgent: unaryDefinition(
    TEAMS_SERVICE_UPDATE_AGENT_PATH,
    AgentUpdateRequestSchema,
    AgentSchema,
  ),
  deleteAgent: unaryDefinition(
    TEAMS_SERVICE_DELETE_AGENT_PATH,
    DeleteAgentRequestSchema,
    EmptySchema,
  ),
  listTools: unaryDefinition(
    TEAMS_SERVICE_LIST_TOOLS_PATH,
    ListToolsRequestSchema,
    PaginatedToolsSchema,
  ),
  createTool: unaryDefinition(
    TEAMS_SERVICE_CREATE_TOOL_PATH,
    ToolCreateRequestSchema,
    ToolSchema,
  ),
  getTool: unaryDefinition(
    TEAMS_SERVICE_GET_TOOL_PATH,
    GetToolRequestSchema,
    ToolSchema,
  ),
  updateTool: unaryDefinition(
    TEAMS_SERVICE_UPDATE_TOOL_PATH,
    ToolUpdateRequestSchema,
    ToolSchema,
  ),
  deleteTool: unaryDefinition(
    TEAMS_SERVICE_DELETE_TOOL_PATH,
    DeleteToolRequestSchema,
    EmptySchema,
  ),
  listMcpServers: unaryDefinition(
    TEAMS_SERVICE_LIST_MCP_SERVERS_PATH,
    ListMcpServersRequestSchema,
    PaginatedMcpServersSchema,
  ),
  createMcpServer: unaryDefinition(
    TEAMS_SERVICE_CREATE_MCP_SERVER_PATH,
    McpServerCreateRequestSchema,
    McpServerSchema,
  ),
  getMcpServer: unaryDefinition(
    TEAMS_SERVICE_GET_MCP_SERVER_PATH,
    GetMcpServerRequestSchema,
    McpServerSchema,
  ),
  updateMcpServer: unaryDefinition(
    TEAMS_SERVICE_UPDATE_MCP_SERVER_PATH,
    McpServerUpdateRequestSchema,
    McpServerSchema,
  ),
  deleteMcpServer: unaryDefinition(
    TEAMS_SERVICE_DELETE_MCP_SERVER_PATH,
    DeleteMcpServerRequestSchema,
    EmptySchema,
  ),
  listWorkspaceConfigurations: unaryDefinition(
    TEAMS_SERVICE_LIST_WORKSPACE_CONFIGURATIONS_PATH,
    ListWorkspaceConfigurationsRequestSchema,
    PaginatedWorkspaceConfigurationsSchema,
  ),
  createWorkspaceConfiguration: unaryDefinition(
    TEAMS_SERVICE_CREATE_WORKSPACE_CONFIGURATION_PATH,
    WorkspaceConfigurationCreateRequestSchema,
    WorkspaceConfigurationSchema,
  ),
  getWorkspaceConfiguration: unaryDefinition(
    TEAMS_SERVICE_GET_WORKSPACE_CONFIGURATION_PATH,
    GetWorkspaceConfigurationRequestSchema,
    WorkspaceConfigurationSchema,
  ),
  updateWorkspaceConfiguration: unaryDefinition(
    TEAMS_SERVICE_UPDATE_WORKSPACE_CONFIGURATION_PATH,
    WorkspaceConfigurationUpdateRequestSchema,
    WorkspaceConfigurationSchema,
  ),
  deleteWorkspaceConfiguration: unaryDefinition(
    TEAMS_SERVICE_DELETE_WORKSPACE_CONFIGURATION_PATH,
    DeleteWorkspaceConfigurationRequestSchema,
    EmptySchema,
  ),
  listMemoryBuckets: unaryDefinition(
    TEAMS_SERVICE_LIST_MEMORY_BUCKETS_PATH,
    ListMemoryBucketsRequestSchema,
    PaginatedMemoryBucketsSchema,
  ),
  createMemoryBucket: unaryDefinition(
    TEAMS_SERVICE_CREATE_MEMORY_BUCKET_PATH,
    MemoryBucketCreateRequestSchema,
    MemoryBucketSchema,
  ),
  getMemoryBucket: unaryDefinition(
    TEAMS_SERVICE_GET_MEMORY_BUCKET_PATH,
    GetMemoryBucketRequestSchema,
    MemoryBucketSchema,
  ),
  updateMemoryBucket: unaryDefinition(
    TEAMS_SERVICE_UPDATE_MEMORY_BUCKET_PATH,
    MemoryBucketUpdateRequestSchema,
    MemoryBucketSchema,
  ),
  deleteMemoryBucket: unaryDefinition(
    TEAMS_SERVICE_DELETE_MEMORY_BUCKET_PATH,
    DeleteMemoryBucketRequestSchema,
    EmptySchema,
  ),
  listAttachments: unaryDefinition(
    TEAMS_SERVICE_LIST_ATTACHMENTS_PATH,
    ListAttachmentsRequestSchema,
    PaginatedAttachmentsSchema,
  ),
  createAttachment: unaryDefinition(
    TEAMS_SERVICE_CREATE_ATTACHMENT_PATH,
    AttachmentCreateRequestSchema,
    AttachmentSchema,
  ),
  deleteAttachment: unaryDefinition(
    TEAMS_SERVICE_DELETE_ATTACHMENT_PATH,
    DeleteAttachmentRequestSchema,
    EmptySchema,
  ),
};

export const TeamsServiceGrpcClient = makeGenericClientConstructor(
  teamsServiceGrpcDefinition,
  'agynio.api.teams.v1.TeamsService',
);

export type TeamsServiceGrpcClientInstance = InstanceType<typeof TeamsServiceGrpcClient>;
