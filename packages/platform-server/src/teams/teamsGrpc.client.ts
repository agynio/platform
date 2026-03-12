import { create, type DescMessage } from '@bufbuild/protobuf';
import { HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Code, ConnectError, createClient, type CallOptions, type Client } from '@connectrpc/connect';
import { createGrpcTransport } from '@connectrpc/connect-node';
import {
  AgentCreateRequestSchema,
  AgentUpdateRequestSchema,
  AttachmentCreateRequestSchema,
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
  McpServerUpdateRequestSchema,
  MemoryBucketCreateRequestSchema,
  MemoryBucketUpdateRequestSchema,
  TeamsService,
  ToolCreateRequestSchema,
  ToolUpdateRequestSchema,
  WorkspaceConfigurationCreateRequestSchema,
  WorkspaceConfigurationUpdateRequestSchema,
} from '../proto/gen/agynio/api/teams/v1/teams_pb.js';
import type {
  Agent,
  AgentCreateRequest,
  AgentUpdateRequest,
  Attachment,
  AttachmentCreateRequest,
  DeleteAgentRequest,
  DeleteAttachmentRequest,
  DeleteMcpServerRequest,
  DeleteMemoryBucketRequest,
  DeleteToolRequest,
  DeleteWorkspaceConfigurationRequest,
  GetAgentRequest,
  GetMcpServerRequest,
  GetMemoryBucketRequest,
  GetToolRequest,
  GetWorkspaceConfigurationRequest,
  ListAgentsRequest,
  ListAttachmentsRequest,
  ListMcpServersRequest,
  ListMemoryBucketsRequest,
  ListToolsRequest,
  ListWorkspaceConfigurationsRequest,
  McpServer,
  McpServerCreateRequest,
  McpServerUpdateRequest,
  MemoryBucket,
  MemoryBucketCreateRequest,
  MemoryBucketUpdateRequest,
  PaginatedAgents,
  PaginatedAttachments,
  PaginatedMcpServers,
  PaginatedMemoryBuckets,
  PaginatedTools,
  PaginatedWorkspaceConfigurations,
  Tool,
  ToolCreateRequest,
  ToolUpdateRequest,
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

  async listAgents(request: ListAgentsRequest): Promise<PaginatedAgents> {
    return this.call(
      teamsServicePath('listAgents'),
      ListAgentsRequestSchema,
      request,
      'listAgents',
    );
  }

  async createAgent(request: AgentCreateRequest): Promise<Agent> {
    return this.call(
      teamsServicePath('createAgent'),
      AgentCreateRequestSchema,
      request,
      'createAgent',
    );
  }

  async getAgent(request: GetAgentRequest): Promise<Agent> {
    return this.call(
      teamsServicePath('getAgent'),
      GetAgentRequestSchema,
      request,
      'getAgent',
    );
  }

  async updateAgent(request: AgentUpdateRequest): Promise<Agent> {
    return this.call(
      teamsServicePath('updateAgent'),
      AgentUpdateRequestSchema,
      request,
      'updateAgent',
    );
  }

  async deleteAgent(request: DeleteAgentRequest): Promise<void> {
    await this.call<DeleteAgentRequest, void>(
      teamsServicePath('deleteAgent'),
      DeleteAgentRequestSchema,
      request,
      'deleteAgent',
    );
  }

  async listTools(request: ListToolsRequest): Promise<PaginatedTools> {
    return this.call(
      teamsServicePath('listTools'),
      ListToolsRequestSchema,
      request,
      'listTools',
    );
  }

  async createTool(request: ToolCreateRequest): Promise<Tool> {
    return this.call(
      teamsServicePath('createTool'),
      ToolCreateRequestSchema,
      request,
      'createTool',
    );
  }

  async getTool(request: GetToolRequest): Promise<Tool> {
    return this.call(
      teamsServicePath('getTool'),
      GetToolRequestSchema,
      request,
      'getTool',
    );
  }

  async updateTool(request: ToolUpdateRequest): Promise<Tool> {
    return this.call(
      teamsServicePath('updateTool'),
      ToolUpdateRequestSchema,
      request,
      'updateTool',
    );
  }

  async deleteTool(request: DeleteToolRequest): Promise<void> {
    await this.call<DeleteToolRequest, void>(
      teamsServicePath('deleteTool'),
      DeleteToolRequestSchema,
      request,
      'deleteTool',
    );
  }

  async listMcpServers(request: ListMcpServersRequest): Promise<PaginatedMcpServers> {
    return this.call(
      teamsServicePath('listMcpServers'),
      ListMcpServersRequestSchema,
      request,
      'listMcpServers',
    );
  }

  async createMcpServer(request: McpServerCreateRequest): Promise<McpServer> {
    return this.call(
      teamsServicePath('createMcpServer'),
      McpServerCreateRequestSchema,
      request,
      'createMcpServer',
    );
  }

  async getMcpServer(request: GetMcpServerRequest): Promise<McpServer> {
    return this.call(
      teamsServicePath('getMcpServer'),
      GetMcpServerRequestSchema,
      request,
      'getMcpServer',
    );
  }

  async updateMcpServer(request: McpServerUpdateRequest): Promise<McpServer> {
    return this.call(
      teamsServicePath('updateMcpServer'),
      McpServerUpdateRequestSchema,
      request,
      'updateMcpServer',
    );
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
  ): Promise<PaginatedWorkspaceConfigurations> {
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
    return this.call(
      teamsServicePath('createWorkspaceConfiguration'),
      WorkspaceConfigurationCreateRequestSchema,
      request,
      'createWorkspaceConfiguration',
    );
  }

  async getWorkspaceConfiguration(
    request: GetWorkspaceConfigurationRequest,
  ): Promise<WorkspaceConfiguration> {
    return this.call(
      teamsServicePath('getWorkspaceConfiguration'),
      GetWorkspaceConfigurationRequestSchema,
      request,
      'getWorkspaceConfiguration',
    );
  }

  async updateWorkspaceConfiguration(
    request: WorkspaceConfigurationUpdateRequest,
  ): Promise<WorkspaceConfiguration> {
    return this.call(
      teamsServicePath('updateWorkspaceConfiguration'),
      WorkspaceConfigurationUpdateRequestSchema,
      request,
      'updateWorkspaceConfiguration',
    );
  }

  async deleteWorkspaceConfiguration(request: DeleteWorkspaceConfigurationRequest): Promise<void> {
    await this.call<DeleteWorkspaceConfigurationRequest, void>(
      teamsServicePath('deleteWorkspaceConfiguration'),
      DeleteWorkspaceConfigurationRequestSchema,
      request,
      'deleteWorkspaceConfiguration',
    );
  }

  async listMemoryBuckets(request: ListMemoryBucketsRequest): Promise<PaginatedMemoryBuckets> {
    return this.call(
      teamsServicePath('listMemoryBuckets'),
      ListMemoryBucketsRequestSchema,
      request,
      'listMemoryBuckets',
    );
  }

  async createMemoryBucket(request: MemoryBucketCreateRequest): Promise<MemoryBucket> {
    return this.call(
      teamsServicePath('createMemoryBucket'),
      MemoryBucketCreateRequestSchema,
      request,
      'createMemoryBucket',
    );
  }

  async getMemoryBucket(request: GetMemoryBucketRequest): Promise<MemoryBucket> {
    return this.call(
      teamsServicePath('getMemoryBucket'),
      GetMemoryBucketRequestSchema,
      request,
      'getMemoryBucket',
    );
  }

  async updateMemoryBucket(request: MemoryBucketUpdateRequest): Promise<MemoryBucket> {
    return this.call(
      teamsServicePath('updateMemoryBucket'),
      MemoryBucketUpdateRequestSchema,
      request,
      'updateMemoryBucket',
    );
  }

  async deleteMemoryBucket(request: DeleteMemoryBucketRequest): Promise<void> {
    await this.call<DeleteMemoryBucketRequest, void>(
      teamsServicePath('deleteMemoryBucket'),
      DeleteMemoryBucketRequestSchema,
      request,
      'deleteMemoryBucket',
    );
  }

  async listAttachments(request: ListAttachmentsRequest): Promise<PaginatedAttachments> {
    return this.call(
      teamsServicePath('listAttachments'),
      ListAttachmentsRequestSchema,
      request,
      'listAttachments',
    );
  }

  async createAttachment(request: AttachmentCreateRequest): Promise<Attachment> {
    return this.call(
      teamsServicePath('createAttachment'),
      AttachmentCreateRequestSchema,
      request,
      'createAttachment',
    );
  }

  async deleteAttachment(request: DeleteAttachmentRequest): Promise<void> {
    await this.call<DeleteAttachmentRequest, void>(
      teamsServicePath('deleteAttachment'),
      DeleteAttachmentRequestSchema,
      request,
      'deleteAttachment',
    );
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
