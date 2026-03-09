import { makeGenericClientConstructor } from '@grpc/grpc-js';
import type { MethodDefinition, ServiceDefinition } from '@grpc/grpc-js';
import { toBinary, fromBinary } from '@bufbuild/protobuf';
import type { DescMessage } from '@bufbuild/protobuf';
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
  CreateAgentRequestSchema,
  CreateAgentResponseSchema,
  CreateAttachmentRequestSchema,
  CreateAttachmentResponseSchema,
  CreateMcpServerRequestSchema,
  CreateMcpServerResponseSchema,
  CreateMemoryBucketRequestSchema,
  CreateMemoryBucketResponseSchema,
  CreateToolRequestSchema,
  CreateToolResponseSchema,
  CreateWorkspaceConfigurationRequestSchema,
  CreateWorkspaceConfigurationResponseSchema,
  DeleteAgentRequestSchema,
  DeleteAgentResponseSchema,
  DeleteAttachmentRequestSchema,
  DeleteAttachmentResponseSchema,
  DeleteMcpServerRequestSchema,
  DeleteMcpServerResponseSchema,
  DeleteMemoryBucketRequestSchema,
  DeleteMemoryBucketResponseSchema,
  DeleteToolRequestSchema,
  DeleteToolResponseSchema,
  DeleteWorkspaceConfigurationRequestSchema,
  DeleteWorkspaceConfigurationResponseSchema,
  GetAgentRequestSchema,
  GetAgentResponseSchema,
  GetMcpServerRequestSchema,
  GetMcpServerResponseSchema,
  GetMemoryBucketRequestSchema,
  GetMemoryBucketResponseSchema,
  GetToolRequestSchema,
  GetToolResponseSchema,
  GetWorkspaceConfigurationRequestSchema,
  GetWorkspaceConfigurationResponseSchema,
  ListAgentsRequestSchema,
  ListAgentsResponseSchema,
  ListAttachmentsRequestSchema,
  ListAttachmentsResponseSchema,
  ListMcpServersRequestSchema,
  ListMcpServersResponseSchema,
  ListMemoryBucketsRequestSchema,
  ListMemoryBucketsResponseSchema,
  ListToolsRequestSchema,
  ListToolsResponseSchema,
  ListWorkspaceConfigurationsRequestSchema,
  ListWorkspaceConfigurationsResponseSchema,
  UpdateAgentRequestSchema,
  UpdateAgentResponseSchema,
  UpdateMcpServerRequestSchema,
  UpdateMcpServerResponseSchema,
  UpdateMemoryBucketRequestSchema,
  UpdateMemoryBucketResponseSchema,
  UpdateToolRequestSchema,
  UpdateToolResponseSchema,
  UpdateWorkspaceConfigurationRequestSchema,
  UpdateWorkspaceConfigurationResponseSchema,
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
    ListAgentsResponseSchema,
  ),
  createAgent: unaryDefinition(
    TEAMS_SERVICE_CREATE_AGENT_PATH,
    CreateAgentRequestSchema,
    CreateAgentResponseSchema,
  ),
  getAgent: unaryDefinition(
    TEAMS_SERVICE_GET_AGENT_PATH,
    GetAgentRequestSchema,
    GetAgentResponseSchema,
  ),
  updateAgent: unaryDefinition(
    TEAMS_SERVICE_UPDATE_AGENT_PATH,
    UpdateAgentRequestSchema,
    UpdateAgentResponseSchema,
  ),
  deleteAgent: unaryDefinition(
    TEAMS_SERVICE_DELETE_AGENT_PATH,
    DeleteAgentRequestSchema,
    DeleteAgentResponseSchema,
  ),
  listTools: unaryDefinition(
    TEAMS_SERVICE_LIST_TOOLS_PATH,
    ListToolsRequestSchema,
    ListToolsResponseSchema,
  ),
  createTool: unaryDefinition(
    TEAMS_SERVICE_CREATE_TOOL_PATH,
    CreateToolRequestSchema,
    CreateToolResponseSchema,
  ),
  getTool: unaryDefinition(
    TEAMS_SERVICE_GET_TOOL_PATH,
    GetToolRequestSchema,
    GetToolResponseSchema,
  ),
  updateTool: unaryDefinition(
    TEAMS_SERVICE_UPDATE_TOOL_PATH,
    UpdateToolRequestSchema,
    UpdateToolResponseSchema,
  ),
  deleteTool: unaryDefinition(
    TEAMS_SERVICE_DELETE_TOOL_PATH,
    DeleteToolRequestSchema,
    DeleteToolResponseSchema,
  ),
  listMcpServers: unaryDefinition(
    TEAMS_SERVICE_LIST_MCP_SERVERS_PATH,
    ListMcpServersRequestSchema,
    ListMcpServersResponseSchema,
  ),
  createMcpServer: unaryDefinition(
    TEAMS_SERVICE_CREATE_MCP_SERVER_PATH,
    CreateMcpServerRequestSchema,
    CreateMcpServerResponseSchema,
  ),
  getMcpServer: unaryDefinition(
    TEAMS_SERVICE_GET_MCP_SERVER_PATH,
    GetMcpServerRequestSchema,
    GetMcpServerResponseSchema,
  ),
  updateMcpServer: unaryDefinition(
    TEAMS_SERVICE_UPDATE_MCP_SERVER_PATH,
    UpdateMcpServerRequestSchema,
    UpdateMcpServerResponseSchema,
  ),
  deleteMcpServer: unaryDefinition(
    TEAMS_SERVICE_DELETE_MCP_SERVER_PATH,
    DeleteMcpServerRequestSchema,
    DeleteMcpServerResponseSchema,
  ),
  listWorkspaceConfigurations: unaryDefinition(
    TEAMS_SERVICE_LIST_WORKSPACE_CONFIGURATIONS_PATH,
    ListWorkspaceConfigurationsRequestSchema,
    ListWorkspaceConfigurationsResponseSchema,
  ),
  createWorkspaceConfiguration: unaryDefinition(
    TEAMS_SERVICE_CREATE_WORKSPACE_CONFIGURATION_PATH,
    CreateWorkspaceConfigurationRequestSchema,
    CreateWorkspaceConfigurationResponseSchema,
  ),
  getWorkspaceConfiguration: unaryDefinition(
    TEAMS_SERVICE_GET_WORKSPACE_CONFIGURATION_PATH,
    GetWorkspaceConfigurationRequestSchema,
    GetWorkspaceConfigurationResponseSchema,
  ),
  updateWorkspaceConfiguration: unaryDefinition(
    TEAMS_SERVICE_UPDATE_WORKSPACE_CONFIGURATION_PATH,
    UpdateWorkspaceConfigurationRequestSchema,
    UpdateWorkspaceConfigurationResponseSchema,
  ),
  deleteWorkspaceConfiguration: unaryDefinition(
    TEAMS_SERVICE_DELETE_WORKSPACE_CONFIGURATION_PATH,
    DeleteWorkspaceConfigurationRequestSchema,
    DeleteWorkspaceConfigurationResponseSchema,
  ),
  listMemoryBuckets: unaryDefinition(
    TEAMS_SERVICE_LIST_MEMORY_BUCKETS_PATH,
    ListMemoryBucketsRequestSchema,
    ListMemoryBucketsResponseSchema,
  ),
  createMemoryBucket: unaryDefinition(
    TEAMS_SERVICE_CREATE_MEMORY_BUCKET_PATH,
    CreateMemoryBucketRequestSchema,
    CreateMemoryBucketResponseSchema,
  ),
  getMemoryBucket: unaryDefinition(
    TEAMS_SERVICE_GET_MEMORY_BUCKET_PATH,
    GetMemoryBucketRequestSchema,
    GetMemoryBucketResponseSchema,
  ),
  updateMemoryBucket: unaryDefinition(
    TEAMS_SERVICE_UPDATE_MEMORY_BUCKET_PATH,
    UpdateMemoryBucketRequestSchema,
    UpdateMemoryBucketResponseSchema,
  ),
  deleteMemoryBucket: unaryDefinition(
    TEAMS_SERVICE_DELETE_MEMORY_BUCKET_PATH,
    DeleteMemoryBucketRequestSchema,
    DeleteMemoryBucketResponseSchema,
  ),
  listAttachments: unaryDefinition(
    TEAMS_SERVICE_LIST_ATTACHMENTS_PATH,
    ListAttachmentsRequestSchema,
    ListAttachmentsResponseSchema,
  ),
  createAttachment: unaryDefinition(
    TEAMS_SERVICE_CREATE_ATTACHMENT_PATH,
    CreateAttachmentRequestSchema,
    CreateAttachmentResponseSchema,
  ),
  deleteAttachment: unaryDefinition(
    TEAMS_SERVICE_DELETE_ATTACHMENT_PATH,
    DeleteAttachmentRequestSchema,
    DeleteAttachmentResponseSchema,
  ),
};

export const TeamsServiceGrpcClient = makeGenericClientConstructor(
  teamsServiceGrpcDefinition,
  'agynio.api.teams.v1.TeamsService',
);

export type TeamsServiceGrpcClientInstance = InstanceType<typeof TeamsServiceGrpcClient>;
