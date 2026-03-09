import { create } from '@bufbuild/protobuf';
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
    const message = create(ListAgentsRequestSchema, request);
    return this.unary(
      TEAMS_SERVICE_LIST_AGENTS_PATH,
      message,
      (req, metadata, options, callback) => {
        if (options) {
          this.client.listAgents(req, metadata, options, callback);
          return;
        }
        this.client.listAgents(req, metadata, callback);
      },
    );
  }

  async createAgent(request: AgentCreateRequest): Promise<Agent> {
    const message = create(AgentCreateRequestSchema, request);
    return this.unary(
      TEAMS_SERVICE_CREATE_AGENT_PATH,
      message,
      (req, metadata, options, callback) => {
        if (options) {
          this.client.createAgent(req, metadata, options, callback);
          return;
        }
        this.client.createAgent(req, metadata, callback);
      },
    );
  }

  async getAgent(request: GetAgentRequest): Promise<Agent> {
    const message = create(GetAgentRequestSchema, request);
    return this.unary(
      TEAMS_SERVICE_GET_AGENT_PATH,
      message,
      (req, metadata, options, callback) => {
        if (options) {
          this.client.getAgent(req, metadata, options, callback);
          return;
        }
        this.client.getAgent(req, metadata, callback);
      },
    );
  }

  async updateAgent(request: AgentUpdateRequest): Promise<Agent> {
    const message = create(AgentUpdateRequestSchema, request);
    return this.unary(
      TEAMS_SERVICE_UPDATE_AGENT_PATH,
      message,
      (req, metadata, options, callback) => {
        if (options) {
          this.client.updateAgent(req, metadata, options, callback);
          return;
        }
        this.client.updateAgent(req, metadata, callback);
      },
    );
  }

  async deleteAgent(request: DeleteAgentRequest): Promise<void> {
    const message = create(DeleteAgentRequestSchema, request);
    await this.unary<DeleteAgentRequest, Empty>(
      TEAMS_SERVICE_DELETE_AGENT_PATH,
      message,
      (req, metadata, options, callback) => {
        if (options) {
          this.client.deleteAgent(req, metadata, options, callback);
          return;
        }
        this.client.deleteAgent(req, metadata, callback);
      },
    );
  }

  async listTools(request: ListToolsRequest): Promise<PaginatedTools> {
    const message = create(ListToolsRequestSchema, request);
    return this.unary(
      TEAMS_SERVICE_LIST_TOOLS_PATH,
      message,
      (req, metadata, options, callback) => {
        if (options) {
          this.client.listTools(req, metadata, options, callback);
          return;
        }
        this.client.listTools(req, metadata, callback);
      },
    );
  }

  async createTool(request: ToolCreateRequest): Promise<Tool> {
    const message = create(ToolCreateRequestSchema, request);
    return this.unary(
      TEAMS_SERVICE_CREATE_TOOL_PATH,
      message,
      (req, metadata, options, callback) => {
        if (options) {
          this.client.createTool(req, metadata, options, callback);
          return;
        }
        this.client.createTool(req, metadata, callback);
      },
    );
  }

  async getTool(request: GetToolRequest): Promise<Tool> {
    const message = create(GetToolRequestSchema, request);
    return this.unary(
      TEAMS_SERVICE_GET_TOOL_PATH,
      message,
      (req, metadata, options, callback) => {
        if (options) {
          this.client.getTool(req, metadata, options, callback);
          return;
        }
        this.client.getTool(req, metadata, callback);
      },
    );
  }

  async updateTool(request: ToolUpdateRequest): Promise<Tool> {
    const message = create(ToolUpdateRequestSchema, request);
    return this.unary(
      TEAMS_SERVICE_UPDATE_TOOL_PATH,
      message,
      (req, metadata, options, callback) => {
        if (options) {
          this.client.updateTool(req, metadata, options, callback);
          return;
        }
        this.client.updateTool(req, metadata, callback);
      },
    );
  }

  async deleteTool(request: DeleteToolRequest): Promise<void> {
    const message = create(DeleteToolRequestSchema, request);
    await this.unary<DeleteToolRequest, Empty>(
      TEAMS_SERVICE_DELETE_TOOL_PATH,
      message,
      (req, metadata, options, callback) => {
        if (options) {
          this.client.deleteTool(req, metadata, options, callback);
          return;
        }
        this.client.deleteTool(req, metadata, callback);
      },
    );
  }

  async listMcpServers(request: ListMcpServersRequest): Promise<PaginatedMcpServers> {
    const message = create(ListMcpServersRequestSchema, request);
    return this.unary(
      TEAMS_SERVICE_LIST_MCP_SERVERS_PATH,
      message,
      (req, metadata, options, callback) => {
        if (options) {
          this.client.listMcpServers(req, metadata, options, callback);
          return;
        }
        this.client.listMcpServers(req, metadata, callback);
      },
    );
  }

  async createMcpServer(request: McpServerCreateRequest): Promise<McpServer> {
    const message = create(McpServerCreateRequestSchema, request);
    return this.unary(
      TEAMS_SERVICE_CREATE_MCP_SERVER_PATH,
      message,
      (req, metadata, options, callback) => {
        if (options) {
          this.client.createMcpServer(req, metadata, options, callback);
          return;
        }
        this.client.createMcpServer(req, metadata, callback);
      },
    );
  }

  async getMcpServer(request: GetMcpServerRequest): Promise<McpServer> {
    const message = create(GetMcpServerRequestSchema, request);
    return this.unary(
      TEAMS_SERVICE_GET_MCP_SERVER_PATH,
      message,
      (req, metadata, options, callback) => {
        if (options) {
          this.client.getMcpServer(req, metadata, options, callback);
          return;
        }
        this.client.getMcpServer(req, metadata, callback);
      },
    );
  }

  async updateMcpServer(request: McpServerUpdateRequest): Promise<McpServer> {
    const message = create(McpServerUpdateRequestSchema, request);
    return this.unary(
      TEAMS_SERVICE_UPDATE_MCP_SERVER_PATH,
      message,
      (req, metadata, options, callback) => {
        if (options) {
          this.client.updateMcpServer(req, metadata, options, callback);
          return;
        }
        this.client.updateMcpServer(req, metadata, callback);
      },
    );
  }

  async deleteMcpServer(request: DeleteMcpServerRequest): Promise<void> {
    const message = create(DeleteMcpServerRequestSchema, request);
    await this.unary<DeleteMcpServerRequest, Empty>(
      TEAMS_SERVICE_DELETE_MCP_SERVER_PATH,
      message,
      (req, metadata, options, callback) => {
        if (options) {
          this.client.deleteMcpServer(req, metadata, options, callback);
          return;
        }
        this.client.deleteMcpServer(req, metadata, callback);
      },
    );
  }

  async listWorkspaceConfigurations(
    request: ListWorkspaceConfigurationsRequest,
  ): Promise<PaginatedWorkspaceConfigurations> {
    const message = create(ListWorkspaceConfigurationsRequestSchema, request);
    return this.unary(
      TEAMS_SERVICE_LIST_WORKSPACE_CONFIGURATIONS_PATH,
      message,
      (req, metadata, options, callback) => {
        if (options) {
          this.client.listWorkspaceConfigurations(req, metadata, options, callback);
          return;
        }
        this.client.listWorkspaceConfigurations(req, metadata, callback);
      },
    );
  }

  async createWorkspaceConfiguration(
    request: WorkspaceConfigurationCreateRequest,
  ): Promise<WorkspaceConfiguration> {
    const message = create(WorkspaceConfigurationCreateRequestSchema, request);
    return this.unary(
      TEAMS_SERVICE_CREATE_WORKSPACE_CONFIGURATION_PATH,
      message,
      (req, metadata, options, callback) => {
        if (options) {
          this.client.createWorkspaceConfiguration(req, metadata, options, callback);
          return;
        }
        this.client.createWorkspaceConfiguration(req, metadata, callback);
      },
    );
  }

  async getWorkspaceConfiguration(
    request: GetWorkspaceConfigurationRequest,
  ): Promise<WorkspaceConfiguration> {
    const message = create(GetWorkspaceConfigurationRequestSchema, request);
    return this.unary(
      TEAMS_SERVICE_GET_WORKSPACE_CONFIGURATION_PATH,
      message,
      (req, metadata, options, callback) => {
        if (options) {
          this.client.getWorkspaceConfiguration(req, metadata, options, callback);
          return;
        }
        this.client.getWorkspaceConfiguration(req, metadata, callback);
      },
    );
  }

  async updateWorkspaceConfiguration(
    request: WorkspaceConfigurationUpdateRequest,
  ): Promise<WorkspaceConfiguration> {
    const message = create(WorkspaceConfigurationUpdateRequestSchema, request);
    return this.unary(
      TEAMS_SERVICE_UPDATE_WORKSPACE_CONFIGURATION_PATH,
      message,
      (req, metadata, options, callback) => {
        if (options) {
          this.client.updateWorkspaceConfiguration(req, metadata, options, callback);
          return;
        }
        this.client.updateWorkspaceConfiguration(req, metadata, callback);
      },
    );
  }

  async deleteWorkspaceConfiguration(request: DeleteWorkspaceConfigurationRequest): Promise<void> {
    const message = create(DeleteWorkspaceConfigurationRequestSchema, request);
    await this.unary<DeleteWorkspaceConfigurationRequest, Empty>(
      TEAMS_SERVICE_DELETE_WORKSPACE_CONFIGURATION_PATH,
      message,
      (req, metadata, options, callback) => {
        if (options) {
          this.client.deleteWorkspaceConfiguration(req, metadata, options, callback);
          return;
        }
        this.client.deleteWorkspaceConfiguration(req, metadata, callback);
      },
    );
  }

  async listMemoryBuckets(request: ListMemoryBucketsRequest): Promise<PaginatedMemoryBuckets> {
    const message = create(ListMemoryBucketsRequestSchema, request);
    return this.unary(
      TEAMS_SERVICE_LIST_MEMORY_BUCKETS_PATH,
      message,
      (req, metadata, options, callback) => {
        if (options) {
          this.client.listMemoryBuckets(req, metadata, options, callback);
          return;
        }
        this.client.listMemoryBuckets(req, metadata, callback);
      },
    );
  }

  async createMemoryBucket(request: MemoryBucketCreateRequest): Promise<MemoryBucket> {
    const message = create(MemoryBucketCreateRequestSchema, request);
    return this.unary(
      TEAMS_SERVICE_CREATE_MEMORY_BUCKET_PATH,
      message,
      (req, metadata, options, callback) => {
        if (options) {
          this.client.createMemoryBucket(req, metadata, options, callback);
          return;
        }
        this.client.createMemoryBucket(req, metadata, callback);
      },
    );
  }

  async getMemoryBucket(request: GetMemoryBucketRequest): Promise<MemoryBucket> {
    const message = create(GetMemoryBucketRequestSchema, request);
    return this.unary(
      TEAMS_SERVICE_GET_MEMORY_BUCKET_PATH,
      message,
      (req, metadata, options, callback) => {
        if (options) {
          this.client.getMemoryBucket(req, metadata, options, callback);
          return;
        }
        this.client.getMemoryBucket(req, metadata, callback);
      },
    );
  }

  async updateMemoryBucket(request: MemoryBucketUpdateRequest): Promise<MemoryBucket> {
    const message = create(MemoryBucketUpdateRequestSchema, request);
    return this.unary(
      TEAMS_SERVICE_UPDATE_MEMORY_BUCKET_PATH,
      message,
      (req, metadata, options, callback) => {
        if (options) {
          this.client.updateMemoryBucket(req, metadata, options, callback);
          return;
        }
        this.client.updateMemoryBucket(req, metadata, callback);
      },
    );
  }

  async deleteMemoryBucket(request: DeleteMemoryBucketRequest): Promise<void> {
    const message = create(DeleteMemoryBucketRequestSchema, request);
    await this.unary<DeleteMemoryBucketRequest, Empty>(
      TEAMS_SERVICE_DELETE_MEMORY_BUCKET_PATH,
      message,
      (req, metadata, options, callback) => {
        if (options) {
          this.client.deleteMemoryBucket(req, metadata, options, callback);
          return;
        }
        this.client.deleteMemoryBucket(req, metadata, callback);
      },
    );
  }

  async listAttachments(request: ListAttachmentsRequest): Promise<PaginatedAttachments> {
    const message = create(ListAttachmentsRequestSchema, request);
    return this.unary(
      TEAMS_SERVICE_LIST_ATTACHMENTS_PATH,
      message,
      (req, metadata, options, callback) => {
        if (options) {
          this.client.listAttachments(req, metadata, options, callback);
          return;
        }
        this.client.listAttachments(req, metadata, callback);
      },
    );
  }

  async createAttachment(request: AttachmentCreateRequest): Promise<Attachment> {
    const message = create(AttachmentCreateRequestSchema, request);
    return this.unary(
      TEAMS_SERVICE_CREATE_ATTACHMENT_PATH,
      message,
      (req, metadata, options, callback) => {
        if (options) {
          this.client.createAttachment(req, metadata, options, callback);
          return;
        }
        this.client.createAttachment(req, metadata, callback);
      },
    );
  }

  async deleteAttachment(request: DeleteAttachmentRequest): Promise<void> {
    const message = create(DeleteAttachmentRequestSchema, request);
    await this.unary<DeleteAttachmentRequest, Empty>(
      TEAMS_SERVICE_DELETE_ATTACHMENT_PATH,
      message,
      (req, metadata, options, callback) => {
        if (options) {
          this.client.deleteAttachment(req, metadata, options, callback);
          return;
        }
        this.client.deleteAttachment(req, metadata, callback);
      },
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
