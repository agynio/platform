import { create, type DescMessage } from '@bufbuild/protobuf';
import { HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Code, ConnectError, createClient, type CallOptions, type Client } from '@connectrpc/connect';
import { createGrpcTransport } from '@connectrpc/connect-node';
import {
  AgentCreateRequestSchema,
  AgentUpdateRequestSchema,
  AttachmentCreateRequestSchema,
  CreateVariableRequestSchema,
  DeleteAgentRequestSchema,
  DeleteAttachmentRequestSchema,
  DeleteMcpServerRequestSchema,
  DeleteMemoryBucketRequestSchema,
  DeleteToolRequestSchema,
  DeleteVariableRequestSchema,
  DeleteWorkspaceConfigurationRequestSchema,
  GetAgentRequestSchema,
  GetMcpServerRequestSchema,
  GetMemoryBucketRequestSchema,
  GetToolRequestSchema,
  GetVariableRequestSchema,
  GetWorkspaceConfigurationRequestSchema,
  ListAgentsRequestSchema,
  ListAttachmentsRequestSchema,
  ListMcpServersRequestSchema,
  ListMemoryBucketsRequestSchema,
  ListToolsRequestSchema,
  ListVariablesRequestSchema,
  ListWorkspaceConfigurationsRequestSchema,
  McpServerCreateRequestSchema,
  McpServerUpdateRequestSchema,
  MemoryBucketCreateRequestSchema,
  MemoryBucketUpdateRequestSchema,
  ResolveVariableRequestSchema,
  TeamsService,
  ToolCreateRequestSchema,
  ToolUpdateRequestSchema,
  UpdateVariableRequestSchema,
  WorkspaceConfigurationCreateRequestSchema,
  WorkspaceConfigurationUpdateRequestSchema,
} from '../proto/gen/agynio/api/teams/v1/teams_pb.js';
import type {
  Agent,
  AgentCreateRequest,
  AgentUpdateRequest,
  Attachment,
  AttachmentCreateRequest,
  CreateAgentResponse,
  CreateAttachmentResponse,
  CreateMcpServerResponse,
  CreateMemoryBucketResponse,
  CreateToolResponse,
  CreateVariableRequest,
  CreateVariableResponse,
  CreateWorkspaceConfigurationResponse,
  DeleteAgentRequest,
  DeleteAttachmentRequest,
  DeleteMcpServerRequest,
  DeleteMemoryBucketRequest,
  DeleteToolRequest,
  DeleteVariableRequest,
  DeleteWorkspaceConfigurationRequest,
  GetAgentRequest,
  GetMcpServerRequest,
  GetMemoryBucketRequest,
  GetToolRequest,
  GetVariableRequest,
  GetWorkspaceConfigurationRequest,
  GetAgentResponse,
  GetMcpServerResponse,
  GetMemoryBucketResponse,
  GetToolResponse,
  GetVariableResponse,
  GetWorkspaceConfigurationResponse,
  ListAgentsRequest,
  ListAgentsResponse,
  ListAttachmentsRequest,
  ListAttachmentsResponse,
  ListMcpServersRequest,
  ListMcpServersResponse,
  ListMemoryBucketsRequest,
  ListMemoryBucketsResponse,
  ListToolsRequest,
  ListToolsResponse,
  ListVariablesRequest,
  ListVariablesResponse,
  ListWorkspaceConfigurationsRequest,
  ListWorkspaceConfigurationsResponse,
  McpServer,
  McpServerCreateRequest,
  McpServerUpdateRequest,
  MemoryBucket,
  MemoryBucketCreateRequest,
  MemoryBucketUpdateRequest,
  ResolveVariableRequest,
  ResolveVariableResponse,
  Tool,
  ToolCreateRequest,
  ToolUpdateRequest,
  UpdateAgentResponse,
  UpdateMcpServerResponse,
  UpdateMemoryBucketResponse,
  UpdateToolResponse,
  UpdateVariableRequest,
  UpdateVariableResponse,
  UpdateWorkspaceConfigurationResponse,
  Variable,
  WorkspaceConfiguration,
  WorkspaceConfigurationCreateRequest,
  WorkspaceConfigurationUpdateRequest,
} from '../proto/gen/agynio/api/teams/v1/teams_pb.js';

type TeamsGrpcClientConfig = {
  address: string;
  requestTimeoutMs?: number;
};

type TeamsServiceClient = Client<typeof TeamsService>;
type UnaryRpcCall<Req, Res> = (request: Req, options?: CallOptions) => Promise<Res>;

const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
const DEFAULT_ERROR_MESSAGE = 'Teams service request failed';

const normalizeBaseUrl = (address: string): string => {
  const trimmed = address.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^grpc:\/\//i.test(trimmed)) return `http://${trimmed.slice('grpc://'.length)}`;
  return `http://${trimmed}`;
};

const teamsServicePath = (method: keyof typeof TeamsService.method): string =>
  `/${TeamsService.typeName}/${TeamsService.method[method].name}`;

export class TeamsGrpcRequestError extends HttpException {
  constructor(
    statusCode: number,
    readonly grpcCode: Code,
    readonly errorCode: string,
    message: string,
  ) {
    super({ error: errorCode, message, grpcCode }, statusCode);
    this.name = 'TeamsGrpcRequestError';
  }
}

export class TeamsGrpcClient {
  private readonly client: TeamsServiceClient;
  private readonly requestTimeoutMs: number;
  private readonly endpoint: string;
  private readonly logger = new Logger(TeamsGrpcClient.name);

  constructor(config: TeamsGrpcClientConfig) {
    const address = config.address?.trim();
    if (!address) {
      throw new Error('TeamsGrpcClient requires a valid address');
    }
    this.endpoint = address;
    this.requestTimeoutMs = config.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    const baseUrl = normalizeBaseUrl(address);
    this.client = createClient(TeamsService, createGrpcTransport({ baseUrl }));
  }

  getEndpoint(): string {
    return this.endpoint;
  }

  async listAgents(request: ListAgentsRequest): Promise<ListAgentsResponse> {
    return this.call(
      teamsServicePath('listAgents'),
      ListAgentsRequestSchema,
      request,
      'listAgents',
    );
  }

  async createAgent(request: AgentCreateRequest): Promise<Agent> {
    const response = await this.call<AgentCreateRequest, CreateAgentResponse>(
      teamsServicePath('createAgent'),
      AgentCreateRequestSchema,
      request,
      'createAgent',
    );
    return this.requireResponseField(response.agent, 'agent');
  }

  async getAgent(request: GetAgentRequest): Promise<Agent> {
    const response = await this.call<GetAgentRequest, GetAgentResponse>(
      teamsServicePath('getAgent'),
      GetAgentRequestSchema,
      request,
      'getAgent',
    );
    return this.requireResponseField(response.agent, 'agent');
  }

  async updateAgent(request: AgentUpdateRequest): Promise<Agent> {
    const response = await this.call<AgentUpdateRequest, UpdateAgentResponse>(
      teamsServicePath('updateAgent'),
      AgentUpdateRequestSchema,
      request,
      'updateAgent',
    );
    return this.requireResponseField(response.agent, 'agent');
  }

  async deleteAgent(request: DeleteAgentRequest): Promise<void> {
    await this.call<DeleteAgentRequest, void>(
      teamsServicePath('deleteAgent'),
      DeleteAgentRequestSchema,
      request,
      'deleteAgent',
    );
  }

  async listTools(request: ListToolsRequest): Promise<ListToolsResponse> {
    return this.call(
      teamsServicePath('listTools'),
      ListToolsRequestSchema,
      request,
      'listTools',
    );
  }

  async createTool(request: ToolCreateRequest): Promise<Tool> {
    const response = await this.call<ToolCreateRequest, CreateToolResponse>(
      teamsServicePath('createTool'),
      ToolCreateRequestSchema,
      request,
      'createTool',
    );
    return this.requireResponseField(response.tool, 'tool');
  }

  async getTool(request: GetToolRequest): Promise<Tool> {
    const response = await this.call<GetToolRequest, GetToolResponse>(
      teamsServicePath('getTool'),
      GetToolRequestSchema,
      request,
      'getTool',
    );
    return this.requireResponseField(response.tool, 'tool');
  }

  async updateTool(request: ToolUpdateRequest): Promise<Tool> {
    const response = await this.call<ToolUpdateRequest, UpdateToolResponse>(
      teamsServicePath('updateTool'),
      ToolUpdateRequestSchema,
      request,
      'updateTool',
    );
    return this.requireResponseField(response.tool, 'tool');
  }

  async deleteTool(request: DeleteToolRequest): Promise<void> {
    await this.call<DeleteToolRequest, void>(
      teamsServicePath('deleteTool'),
      DeleteToolRequestSchema,
      request,
      'deleteTool',
    );
  }

  async listMcpServers(request: ListMcpServersRequest): Promise<ListMcpServersResponse> {
    return this.call(
      teamsServicePath('listMcpServers'),
      ListMcpServersRequestSchema,
      request,
      'listMcpServers',
    );
  }

  async createMcpServer(request: McpServerCreateRequest): Promise<McpServer> {
    const response = await this.call<McpServerCreateRequest, CreateMcpServerResponse>(
      teamsServicePath('createMcpServer'),
      McpServerCreateRequestSchema,
      request,
      'createMcpServer',
    );
    return this.requireResponseField(response.mcpServer, 'mcp_server');
  }

  async getMcpServer(request: GetMcpServerRequest): Promise<McpServer> {
    const response = await this.call<GetMcpServerRequest, GetMcpServerResponse>(
      teamsServicePath('getMcpServer'),
      GetMcpServerRequestSchema,
      request,
      'getMcpServer',
    );
    return this.requireResponseField(response.mcpServer, 'mcp_server');
  }

  async updateMcpServer(request: McpServerUpdateRequest): Promise<McpServer> {
    const response = await this.call<McpServerUpdateRequest, UpdateMcpServerResponse>(
      teamsServicePath('updateMcpServer'),
      McpServerUpdateRequestSchema,
      request,
      'updateMcpServer',
    );
    return this.requireResponseField(response.mcpServer, 'mcp_server');
  }

  async deleteMcpServer(request: DeleteMcpServerRequest): Promise<void> {
    await this.call<DeleteMcpServerRequest, void>(
      teamsServicePath('deleteMcpServer'),
      DeleteMcpServerRequestSchema,
      request,
      'deleteMcpServer',
    );
  }

  async listWorkspaceConfigurations(
    request: ListWorkspaceConfigurationsRequest,
  ): Promise<ListWorkspaceConfigurationsResponse> {
    return this.call(
      teamsServicePath('listWorkspaceConfigurations'),
      ListWorkspaceConfigurationsRequestSchema,
      request,
      'listWorkspaceConfigurations',
    );
  }

  async createWorkspaceConfiguration(
    request: WorkspaceConfigurationCreateRequest,
  ): Promise<WorkspaceConfiguration> {
    const response = await this.call<
      WorkspaceConfigurationCreateRequest,
      CreateWorkspaceConfigurationResponse
    >(
      teamsServicePath('createWorkspaceConfiguration'),
      WorkspaceConfigurationCreateRequestSchema,
      request,
      'createWorkspaceConfiguration',
    );
    return this.requireResponseField(response.workspaceConfiguration, 'workspace_configuration');
  }

  async getWorkspaceConfiguration(
    request: GetWorkspaceConfigurationRequest,
  ): Promise<WorkspaceConfiguration> {
    const response = await this.call<GetWorkspaceConfigurationRequest, GetWorkspaceConfigurationResponse>(
      teamsServicePath('getWorkspaceConfiguration'),
      GetWorkspaceConfigurationRequestSchema,
      request,
      'getWorkspaceConfiguration',
    );
    return this.requireResponseField(response.workspaceConfiguration, 'workspace_configuration');
  }

  async updateWorkspaceConfiguration(
    request: WorkspaceConfigurationUpdateRequest,
  ): Promise<WorkspaceConfiguration> {
    const response = await this.call<
      WorkspaceConfigurationUpdateRequest,
      UpdateWorkspaceConfigurationResponse
    >(
      teamsServicePath('updateWorkspaceConfiguration'),
      WorkspaceConfigurationUpdateRequestSchema,
      request,
      'updateWorkspaceConfiguration',
    );
    return this.requireResponseField(response.workspaceConfiguration, 'workspace_configuration');
  }

  async deleteWorkspaceConfiguration(request: DeleteWorkspaceConfigurationRequest): Promise<void> {
    await this.call<DeleteWorkspaceConfigurationRequest, void>(
      teamsServicePath('deleteWorkspaceConfiguration'),
      DeleteWorkspaceConfigurationRequestSchema,
      request,
      'deleteWorkspaceConfiguration',
    );
  }

  async listMemoryBuckets(request: ListMemoryBucketsRequest): Promise<ListMemoryBucketsResponse> {
    return this.call(
      teamsServicePath('listMemoryBuckets'),
      ListMemoryBucketsRequestSchema,
      request,
      'listMemoryBuckets',
    );
  }

  async createMemoryBucket(request: MemoryBucketCreateRequest): Promise<MemoryBucket> {
    const response = await this.call<MemoryBucketCreateRequest, CreateMemoryBucketResponse>(
      teamsServicePath('createMemoryBucket'),
      MemoryBucketCreateRequestSchema,
      request,
      'createMemoryBucket',
    );
    return this.requireResponseField(response.memoryBucket, 'memory_bucket');
  }

  async getMemoryBucket(request: GetMemoryBucketRequest): Promise<MemoryBucket> {
    const response = await this.call<GetMemoryBucketRequest, GetMemoryBucketResponse>(
      teamsServicePath('getMemoryBucket'),
      GetMemoryBucketRequestSchema,
      request,
      'getMemoryBucket',
    );
    return this.requireResponseField(response.memoryBucket, 'memory_bucket');
  }

  async updateMemoryBucket(request: MemoryBucketUpdateRequest): Promise<MemoryBucket> {
    const response = await this.call<MemoryBucketUpdateRequest, UpdateMemoryBucketResponse>(
      teamsServicePath('updateMemoryBucket'),
      MemoryBucketUpdateRequestSchema,
      request,
      'updateMemoryBucket',
    );
    return this.requireResponseField(response.memoryBucket, 'memory_bucket');
  }

  async deleteMemoryBucket(request: DeleteMemoryBucketRequest): Promise<void> {
    await this.call<DeleteMemoryBucketRequest, void>(
      teamsServicePath('deleteMemoryBucket'),
      DeleteMemoryBucketRequestSchema,
      request,
      'deleteMemoryBucket',
    );
  }

  async listVariables(request: ListVariablesRequest): Promise<ListVariablesResponse> {
    return this.call(
      teamsServicePath('listVariables'),
      ListVariablesRequestSchema,
      request,
      'listVariables',
    );
  }

  async createVariable(request: CreateVariableRequest): Promise<Variable> {
    const response = await this.call<CreateVariableRequest, CreateVariableResponse>(
      teamsServicePath('createVariable'),
      CreateVariableRequestSchema,
      request,
      'createVariable',
    );
    return this.requireResponseField(response.variable, 'variable');
  }

  async getVariable(request: GetVariableRequest): Promise<Variable> {
    const response = await this.call<GetVariableRequest, GetVariableResponse>(
      teamsServicePath('getVariable'),
      GetVariableRequestSchema,
      request,
      'getVariable',
    );
    return this.requireResponseField(response.variable, 'variable');
  }

  async updateVariable(request: UpdateVariableRequest): Promise<Variable> {
    const response = await this.call<UpdateVariableRequest, UpdateVariableResponse>(
      teamsServicePath('updateVariable'),
      UpdateVariableRequestSchema,
      request,
      'updateVariable',
    );
    return this.requireResponseField(response.variable, 'variable');
  }

  async deleteVariable(request: DeleteVariableRequest): Promise<void> {
    await this.call<DeleteVariableRequest, void>(
      teamsServicePath('deleteVariable'),
      DeleteVariableRequestSchema,
      request,
      'deleteVariable',
    );
  }

  async resolveVariable(request: ResolveVariableRequest): Promise<ResolveVariableResponse> {
    return this.call(
      teamsServicePath('resolveVariable'),
      ResolveVariableRequestSchema,
      request,
      'resolveVariable',
    );
  }

  async listAttachments(request: ListAttachmentsRequest): Promise<ListAttachmentsResponse> {
    return this.call(
      teamsServicePath('listAttachments'),
      ListAttachmentsRequestSchema,
      request,
      'listAttachments',
    );
  }

  async createAttachment(request: AttachmentCreateRequest): Promise<Attachment> {
    const response = await this.call<AttachmentCreateRequest, CreateAttachmentResponse>(
      teamsServicePath('createAttachment'),
      AttachmentCreateRequestSchema,
      request,
      'createAttachment',
    );
    return this.requireResponseField(response.attachment, 'attachment');
  }

  async deleteAttachment(request: DeleteAttachmentRequest): Promise<void> {
    await this.call<DeleteAttachmentRequest, void>(
      teamsServicePath('deleteAttachment'),
      DeleteAttachmentRequestSchema,
      request,
      'deleteAttachment',
    );
  }

  private requireResponseField<T>(value: T | undefined, label: string): T {
    if (value === undefined || value === null) {
      throw new Error(`teams_missing_${label}`);
    }
    return value;
  }

  private call<Req, Res>(
    path: string,
    schema: DescMessage,
    request: Req,
    method: keyof TeamsServiceClient,
    timeoutMs?: number,
  ): Promise<Res> {
    const message = create(schema, request as never) as Req;
    const fn = this.client[method] as unknown as UnaryRpcCall<Req, Res>;
    return this.unary(path, message, fn, timeoutMs);
  }

  private unary<Request, Response>(
    path: string,
    request: Request,
    invoke: (request: Request, options?: CallOptions) => Promise<Response>,
    timeoutMs?: number,
  ): Promise<Response> {
    const callOptions = this.buildCallOptions(timeoutMs);
    return invoke(request, callOptions).catch((error) => {
      throw this.translateServiceError(error, { path });
    });
  }

  private buildCallOptions(timeoutMs?: number): CallOptions | undefined {
    const timeout = typeof timeoutMs === 'number' && timeoutMs > 0 ? timeoutMs : this.requestTimeoutMs;
    if (!timeout || timeout <= 0) return undefined;
    return { timeoutMs: timeout };
  }

  private translateServiceError(error: unknown, context?: { path?: string }): HttpException {
    const connectError = ConnectError.from(error);
    const grpcCode = connectError.code ?? Code.Unknown;
    const statusName = Code[grpcCode] ?? 'UNKNOWN';
    const message = this.extractServiceErrorMessage(connectError);
    const httpStatus = this.grpcStatusToHttpStatus(grpcCode);
    const errorCode = this.grpcStatusToErrorCode(grpcCode);
    const path = context?.path ?? 'unknown';
    if (grpcCode === Code.Unimplemented) {
      this.logger.error('Teams gRPC call returned UNIMPLEMENTED', {
        path,
        grpcStatus: statusName,
        grpcCode,
        message,
      });
    } else {
      this.logger.warn('Teams gRPC call failed', {
        path,
        grpcStatus: statusName,
        grpcCode,
        httpStatus,
        errorCode,
        message,
      });
    }
    return new TeamsGrpcRequestError(httpStatus, grpcCode, errorCode, message);
  }

  private grpcStatusToHttpStatus(grpcCode: Code): HttpStatus {
    switch (grpcCode) {
      case Code.InvalidArgument:
        return HttpStatus.BAD_REQUEST;
      case Code.Unauthenticated:
        return HttpStatus.UNAUTHORIZED;
      case Code.PermissionDenied:
        return HttpStatus.FORBIDDEN;
      case Code.NotFound:
        return HttpStatus.NOT_FOUND;
      case Code.Aborted:
      case Code.AlreadyExists:
        return HttpStatus.CONFLICT;
      case Code.FailedPrecondition:
        return HttpStatus.PRECONDITION_FAILED;
      case Code.ResourceExhausted:
        return HttpStatus.TOO_MANY_REQUESTS;
      case Code.Unimplemented:
        return HttpStatus.NOT_IMPLEMENTED;
      case Code.Internal:
      case Code.DataLoss:
        return HttpStatus.INTERNAL_SERVER_ERROR;
      case Code.Unavailable:
        return HttpStatus.SERVICE_UNAVAILABLE;
      case Code.DeadlineExceeded:
        return HttpStatus.GATEWAY_TIMEOUT;
      case Code.OutOfRange:
        return HttpStatus.BAD_REQUEST;
      case Code.Canceled:
        return 499 as HttpStatus;
      default:
        return HttpStatus.BAD_GATEWAY;
    }
  }

  private grpcStatusToErrorCode(grpcCode: Code): string {
    switch (grpcCode) {
      case Code.InvalidArgument:
        return 'teams_invalid_argument';
      case Code.Unauthenticated:
        return 'teams_unauthenticated';
      case Code.PermissionDenied:
        return 'teams_forbidden';
      case Code.NotFound:
        return 'teams_not_found';
      case Code.Aborted:
      case Code.AlreadyExists:
        return 'teams_conflict';
      case Code.FailedPrecondition:
        return 'teams_failed_precondition';
      case Code.ResourceExhausted:
        return 'teams_resource_exhausted';
      case Code.Unimplemented:
        return 'teams_unimplemented';
      case Code.Internal:
        return 'teams_internal_error';
      case Code.DataLoss:
        return 'teams_data_loss';
      case Code.Unavailable:
        return 'teams_unavailable';
      case Code.DeadlineExceeded:
        return 'teams_timeout';
      case Code.Canceled:
        return 'teams_cancelled';
      default:
        return 'teams_grpc_error';
    }
  }

  private extractServiceErrorMessage(error: ConnectError): string {
    const details = typeof error.rawMessage === 'string' ? error.rawMessage.trim() : '';
    if (details) return details;
    const sanitized = error.message.replace(/^\[[^\]]+\]\s*/, '').trim();
    return sanitized || DEFAULT_ERROR_MESSAGE;
  }
}
