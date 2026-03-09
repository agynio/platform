import { create, type DescMessage } from '@bufbuild/protobuf';
import type { Empty } from '@bufbuild/protobuf/wkt';
import { HttpException, HttpStatus, Logger } from '@nestjs/common';
import { credentials, Metadata, status, type CallOptions, type ServiceError } from '@grpc/grpc-js';
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
import {
  TeamsServiceGrpcClient,
  type TeamsServiceGrpcClientInstance,
  TEAMS_SERVICE_CREATE_AGENT_PATH,
  TEAMS_SERVICE_CREATE_ATTACHMENT_PATH,
  TEAMS_SERVICE_CREATE_MCP_SERVER_PATH,
  TEAMS_SERVICE_CREATE_MEMORY_BUCKET_PATH,
  TEAMS_SERVICE_CREATE_TOOL_PATH,
  TEAMS_SERVICE_CREATE_WORKSPACE_CONFIGURATION_PATH,
  TEAMS_SERVICE_DELETE_AGENT_PATH,
  TEAMS_SERVICE_DELETE_ATTACHMENT_PATH,
  TEAMS_SERVICE_DELETE_MCP_SERVER_PATH,
  TEAMS_SERVICE_DELETE_MEMORY_BUCKET_PATH,
  TEAMS_SERVICE_DELETE_TOOL_PATH,
  TEAMS_SERVICE_DELETE_WORKSPACE_CONFIGURATION_PATH,
  TEAMS_SERVICE_GET_AGENT_PATH,
  TEAMS_SERVICE_GET_MCP_SERVER_PATH,
  TEAMS_SERVICE_GET_MEMORY_BUCKET_PATH,
  TEAMS_SERVICE_GET_TOOL_PATH,
  TEAMS_SERVICE_GET_WORKSPACE_CONFIGURATION_PATH,
  TEAMS_SERVICE_LIST_AGENTS_PATH,
  TEAMS_SERVICE_LIST_ATTACHMENTS_PATH,
  TEAMS_SERVICE_LIST_MCP_SERVERS_PATH,
  TEAMS_SERVICE_LIST_MEMORY_BUCKETS_PATH,
  TEAMS_SERVICE_LIST_TOOLS_PATH,
  TEAMS_SERVICE_LIST_WORKSPACE_CONFIGURATIONS_PATH,
  TEAMS_SERVICE_UPDATE_AGENT_PATH,
  TEAMS_SERVICE_UPDATE_MCP_SERVER_PATH,
  TEAMS_SERVICE_UPDATE_MEMORY_BUCKET_PATH,
  TEAMS_SERVICE_UPDATE_TOOL_PATH,
  TEAMS_SERVICE_UPDATE_WORKSPACE_CONFIGURATION_PATH,
} from '../proto/grpc.js';

type TeamsGrpcClientConfig = {
  address: string;
  requestTimeoutMs?: number;
};

type UnaryRpcCall<Req, Res> = {
  (request: Req, metadata: Metadata, callback: (err: ServiceError | null, response?: Res) => void): void;
  (
    request: Req,
    metadata: Metadata,
    options: CallOptions,
    callback: (err: ServiceError | null, response?: Res) => void,
  ): void;
};

const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
const DEFAULT_ERROR_MESSAGE = 'Teams service request failed';

export class TeamsGrpcRequestError extends HttpException {
  constructor(
    statusCode: number,
    readonly grpcCode: status,
    readonly errorCode: string,
    message: string,
  ) {
    super({ error: errorCode, message, grpcCode }, statusCode);
    this.name = 'TeamsGrpcRequestError';
  }
}

export class TeamsGrpcClient {
  private readonly client: TeamsServiceGrpcClientInstance;
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
    this.client = new TeamsServiceGrpcClient(address, credentials.createInsecure());
  }

  getEndpoint(): string {
    return this.endpoint;
  }

  async listAgents(request: ListAgentsRequest): Promise<PaginatedAgents> {
    return this.call(
      TEAMS_SERVICE_LIST_AGENTS_PATH,
      ListAgentsRequestSchema,
      request,
      'listAgents',
    );
  }

  async createAgent(request: AgentCreateRequest): Promise<Agent> {
    return this.call(
      TEAMS_SERVICE_CREATE_AGENT_PATH,
      AgentCreateRequestSchema,
      request,
      'createAgent',
    );
  }

  async getAgent(request: GetAgentRequest): Promise<Agent> {
    return this.call(
      TEAMS_SERVICE_GET_AGENT_PATH,
      GetAgentRequestSchema,
      request,
      'getAgent',
    );
  }

  async updateAgent(request: AgentUpdateRequest): Promise<Agent> {
    return this.call(
      TEAMS_SERVICE_UPDATE_AGENT_PATH,
      AgentUpdateRequestSchema,
      request,
      'updateAgent',
    );
  }

  async deleteAgent(request: DeleteAgentRequest): Promise<void> {
    await this.call<DeleteAgentRequest, Empty>(
      TEAMS_SERVICE_DELETE_AGENT_PATH,
      DeleteAgentRequestSchema,
      request,
      'deleteAgent',
    );
  }

  async listTools(request: ListToolsRequest): Promise<PaginatedTools> {
    return this.call(
      TEAMS_SERVICE_LIST_TOOLS_PATH,
      ListToolsRequestSchema,
      request,
      'listTools',
    );
  }

  async createTool(request: ToolCreateRequest): Promise<Tool> {
    return this.call(
      TEAMS_SERVICE_CREATE_TOOL_PATH,
      ToolCreateRequestSchema,
      request,
      'createTool',
    );
  }

  async getTool(request: GetToolRequest): Promise<Tool> {
    return this.call(
      TEAMS_SERVICE_GET_TOOL_PATH,
      GetToolRequestSchema,
      request,
      'getTool',
    );
  }

  async updateTool(request: ToolUpdateRequest): Promise<Tool> {
    return this.call(
      TEAMS_SERVICE_UPDATE_TOOL_PATH,
      ToolUpdateRequestSchema,
      request,
      'updateTool',
    );
  }

  async deleteTool(request: DeleteToolRequest): Promise<void> {
    await this.call<DeleteToolRequest, Empty>(
      TEAMS_SERVICE_DELETE_TOOL_PATH,
      DeleteToolRequestSchema,
      request,
      'deleteTool',
    );
  }

  async listMcpServers(request: ListMcpServersRequest): Promise<PaginatedMcpServers> {
    return this.call(
      TEAMS_SERVICE_LIST_MCP_SERVERS_PATH,
      ListMcpServersRequestSchema,
      request,
      'listMcpServers',
    );
  }

  async createMcpServer(request: McpServerCreateRequest): Promise<McpServer> {
    return this.call(
      TEAMS_SERVICE_CREATE_MCP_SERVER_PATH,
      McpServerCreateRequestSchema,
      request,
      'createMcpServer',
    );
  }

  async getMcpServer(request: GetMcpServerRequest): Promise<McpServer> {
    return this.call(
      TEAMS_SERVICE_GET_MCP_SERVER_PATH,
      GetMcpServerRequestSchema,
      request,
      'getMcpServer',
    );
  }

  async updateMcpServer(request: McpServerUpdateRequest): Promise<McpServer> {
    return this.call(
      TEAMS_SERVICE_UPDATE_MCP_SERVER_PATH,
      McpServerUpdateRequestSchema,
      request,
      'updateMcpServer',
    );
  }

  async deleteMcpServer(request: DeleteMcpServerRequest): Promise<void> {
    await this.call<DeleteMcpServerRequest, Empty>(
      TEAMS_SERVICE_DELETE_MCP_SERVER_PATH,
      DeleteMcpServerRequestSchema,
      request,
      'deleteMcpServer',
    );
  }

  async listWorkspaceConfigurations(
    request: ListWorkspaceConfigurationsRequest,
  ): Promise<PaginatedWorkspaceConfigurations> {
    return this.call(
      TEAMS_SERVICE_LIST_WORKSPACE_CONFIGURATIONS_PATH,
      ListWorkspaceConfigurationsRequestSchema,
      request,
      'listWorkspaceConfigurations',
    );
  }

  async createWorkspaceConfiguration(
    request: WorkspaceConfigurationCreateRequest,
  ): Promise<WorkspaceConfiguration> {
    return this.call(
      TEAMS_SERVICE_CREATE_WORKSPACE_CONFIGURATION_PATH,
      WorkspaceConfigurationCreateRequestSchema,
      request,
      'createWorkspaceConfiguration',
    );
  }

  async getWorkspaceConfiguration(
    request: GetWorkspaceConfigurationRequest,
  ): Promise<WorkspaceConfiguration> {
    return this.call(
      TEAMS_SERVICE_GET_WORKSPACE_CONFIGURATION_PATH,
      GetWorkspaceConfigurationRequestSchema,
      request,
      'getWorkspaceConfiguration',
    );
  }

  async updateWorkspaceConfiguration(
    request: WorkspaceConfigurationUpdateRequest,
  ): Promise<WorkspaceConfiguration> {
    return this.call(
      TEAMS_SERVICE_UPDATE_WORKSPACE_CONFIGURATION_PATH,
      WorkspaceConfigurationUpdateRequestSchema,
      request,
      'updateWorkspaceConfiguration',
    );
  }

  async deleteWorkspaceConfiguration(request: DeleteWorkspaceConfigurationRequest): Promise<void> {
    await this.call<DeleteWorkspaceConfigurationRequest, Empty>(
      TEAMS_SERVICE_DELETE_WORKSPACE_CONFIGURATION_PATH,
      DeleteWorkspaceConfigurationRequestSchema,
      request,
      'deleteWorkspaceConfiguration',
    );
  }

  async listMemoryBuckets(request: ListMemoryBucketsRequest): Promise<PaginatedMemoryBuckets> {
    return this.call(
      TEAMS_SERVICE_LIST_MEMORY_BUCKETS_PATH,
      ListMemoryBucketsRequestSchema,
      request,
      'listMemoryBuckets',
    );
  }

  async createMemoryBucket(request: MemoryBucketCreateRequest): Promise<MemoryBucket> {
    return this.call(
      TEAMS_SERVICE_CREATE_MEMORY_BUCKET_PATH,
      MemoryBucketCreateRequestSchema,
      request,
      'createMemoryBucket',
    );
  }

  async getMemoryBucket(request: GetMemoryBucketRequest): Promise<MemoryBucket> {
    return this.call(
      TEAMS_SERVICE_GET_MEMORY_BUCKET_PATH,
      GetMemoryBucketRequestSchema,
      request,
      'getMemoryBucket',
    );
  }

  async updateMemoryBucket(request: MemoryBucketUpdateRequest): Promise<MemoryBucket> {
    return this.call(
      TEAMS_SERVICE_UPDATE_MEMORY_BUCKET_PATH,
      MemoryBucketUpdateRequestSchema,
      request,
      'updateMemoryBucket',
    );
  }

  async deleteMemoryBucket(request: DeleteMemoryBucketRequest): Promise<void> {
    await this.call<DeleteMemoryBucketRequest, Empty>(
      TEAMS_SERVICE_DELETE_MEMORY_BUCKET_PATH,
      DeleteMemoryBucketRequestSchema,
      request,
      'deleteMemoryBucket',
    );
  }

  async listAttachments(request: ListAttachmentsRequest): Promise<PaginatedAttachments> {
    return this.call(
      TEAMS_SERVICE_LIST_ATTACHMENTS_PATH,
      ListAttachmentsRequestSchema,
      request,
      'listAttachments',
    );
  }

  async createAttachment(request: AttachmentCreateRequest): Promise<Attachment> {
    return this.call(
      TEAMS_SERVICE_CREATE_ATTACHMENT_PATH,
      AttachmentCreateRequestSchema,
      request,
      'createAttachment',
    );
  }

  async deleteAttachment(request: DeleteAttachmentRequest): Promise<void> {
    await this.call<DeleteAttachmentRequest, Empty>(
      TEAMS_SERVICE_DELETE_ATTACHMENT_PATH,
      DeleteAttachmentRequestSchema,
      request,
      'deleteAttachment',
    );
  }

  private call<Req, Res>(
    path: string,
    schema: DescMessage,
    request: Req,
    method: keyof TeamsServiceGrpcClientInstance,
    timeoutMs?: number,
  ): Promise<Res> {
    const message = create(schema, request as never) as Req;
    const fn = this.client[method] as unknown as UnaryRpcCall<Req, Res>;
    return this.unary(
      path,
      message,
      (req, metadata, options, callback) => {
        if (options) {
          fn(req, metadata, options, callback);
          return;
        }
        fn(req, metadata, callback);
      },
      timeoutMs,
    );
  }

  private unary<Request, Response>(
    path: string,
    request: Request,
    invoke: (
      request: Request,
      metadata: Metadata,
      options: CallOptions | undefined,
      callback: (err: ServiceError | null, response?: Response) => void,
    ) => void,
    timeoutMs?: number,
  ): Promise<Response> {
    const metadata = this.createMetadata();
    const callOptions = this.buildCallOptions(timeoutMs);
    return new Promise((resolve, reject) => {
      const callback = (err: ServiceError | null, response?: Response) => {
        if (err) {
          reject(this.translateServiceError(err, { path }));
          return;
        }
        resolve(response as Response);
      };
      invoke(request, metadata, callOptions, callback);
    });
  }

  private buildCallOptions(timeoutMs?: number): CallOptions | undefined {
    const timeout = typeof timeoutMs === 'number' && timeoutMs > 0 ? timeoutMs : this.requestTimeoutMs;
    if (!timeout || timeout <= 0) return undefined;
    return { deadline: new Date(Date.now() + timeout) };
  }

  private createMetadata(): Metadata {
    return new Metadata();
  }

  private translateServiceError(error: ServiceError, context?: { path?: string }): HttpException {
    const grpcCode = typeof error.code === 'number' ? error.code : status.UNKNOWN;
    const statusName = (status as unknown as Record<number, string>)[grpcCode] ?? 'UNKNOWN';
    const message = this.extractServiceErrorMessage(error);
    const httpStatus = this.grpcStatusToHttpStatus(grpcCode);
    const errorCode = this.grpcStatusToErrorCode(grpcCode);
    const path = context?.path ?? 'unknown';
    if (grpcCode === status.UNIMPLEMENTED) {
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

  private grpcStatusToHttpStatus(grpcCode: status): HttpStatus {
    switch (grpcCode) {
      case status.INVALID_ARGUMENT:
        return HttpStatus.BAD_REQUEST;
      case status.UNAUTHENTICATED:
        return HttpStatus.UNAUTHORIZED;
      case status.PERMISSION_DENIED:
        return HttpStatus.FORBIDDEN;
      case status.NOT_FOUND:
        return HttpStatus.NOT_FOUND;
      case status.ABORTED:
      case status.ALREADY_EXISTS:
        return HttpStatus.CONFLICT;
      case status.FAILED_PRECONDITION:
        return HttpStatus.PRECONDITION_FAILED;
      case status.RESOURCE_EXHAUSTED:
        return HttpStatus.TOO_MANY_REQUESTS;
      case status.UNIMPLEMENTED:
        return HttpStatus.NOT_IMPLEMENTED;
      case status.INTERNAL:
      case status.DATA_LOSS:
        return HttpStatus.INTERNAL_SERVER_ERROR;
      case status.UNAVAILABLE:
        return HttpStatus.SERVICE_UNAVAILABLE;
      case status.DEADLINE_EXCEEDED:
        return HttpStatus.GATEWAY_TIMEOUT;
      case status.OUT_OF_RANGE:
        return HttpStatus.BAD_REQUEST;
      case status.CANCELLED:
        return 499 as HttpStatus;
      default:
        return HttpStatus.BAD_GATEWAY;
    }
  }

  private grpcStatusToErrorCode(grpcCode: status): string {
    switch (grpcCode) {
      case status.INVALID_ARGUMENT:
        return 'teams_invalid_argument';
      case status.UNAUTHENTICATED:
        return 'teams_unauthenticated';
      case status.PERMISSION_DENIED:
        return 'teams_forbidden';
      case status.NOT_FOUND:
        return 'teams_not_found';
      case status.ABORTED:
      case status.ALREADY_EXISTS:
        return 'teams_conflict';
      case status.FAILED_PRECONDITION:
        return 'teams_failed_precondition';
      case status.RESOURCE_EXHAUSTED:
        return 'teams_resource_exhausted';
      case status.UNIMPLEMENTED:
        return 'teams_unimplemented';
      case status.INTERNAL:
        return 'teams_internal_error';
      case status.DATA_LOSS:
        return 'teams_data_loss';
      case status.UNAVAILABLE:
        return 'teams_unavailable';
      case status.DEADLINE_EXCEEDED:
        return 'teams_timeout';
      case status.CANCELLED:
        return 'teams_cancelled';
      default:
        return 'teams_grpc_error';
    }
  }

  private extractServiceErrorMessage(error: ServiceError): string {
    const details = typeof error.details === 'string' ? error.details.trim() : '';
    const message = details || error.message || DEFAULT_ERROR_MESSAGE;
    return message.trim() || DEFAULT_ERROR_MESSAGE;
  }
}
