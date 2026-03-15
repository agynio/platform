import { describe, expect, it, vi } from 'vitest';
import { Code, ConnectError, type CallOptions, type Client } from '@connectrpc/connect';
import { HttpStatus } from '@nestjs/common';
import {
  ListAgentsRequestSchema,
  type ListAgentsRequest,
  type PaginatedAgents,
  TeamsService,
} from '../../src/proto/gen/agynio/api/teams/v1/teams_pb.js';
import { TeamsGrpcClient } from '../../src/teams/teamsGrpc.client';

const DEFAULT_ERROR_MESSAGE = 'Teams service request failed';

const teamsServicePath = (method: keyof typeof TeamsService.method): string =>
  `/${TeamsService.typeName}/${TeamsService.method[method].name}`;

type TeamsServiceClient = Client<typeof TeamsService>;

type TeamsGrpcClientPrivate = {
  grpcStatusToHttpStatus: (grpcCode: Code) => HttpStatus;
  grpcStatusToErrorCode: (grpcCode: Code) => string;
  extractServiceErrorMessage: (error: ConnectError) => string;
  call: <Req, Res>(
    path: string,
    schema: unknown,
    request: Req,
    method: keyof TeamsServiceClient,
    timeoutMs?: number,
  ) => Promise<Res>;
};

describe('TeamsGrpcClient', () => {
  it('throws when address is blank', () => {
    expect(() => new TeamsGrpcClient({ address: '  ' })).toThrow('TeamsGrpcClient requires a valid address');
  });

  it.each([
    [Code.InvalidArgument, HttpStatus.BAD_REQUEST, 'teams_invalid_argument'],
    [Code.Unauthenticated, HttpStatus.UNAUTHORIZED, 'teams_unauthenticated'],
    [Code.PermissionDenied, HttpStatus.FORBIDDEN, 'teams_forbidden'],
    [Code.NotFound, HttpStatus.NOT_FOUND, 'teams_not_found'],
    [Code.Aborted, HttpStatus.CONFLICT, 'teams_conflict'],
    [Code.AlreadyExists, HttpStatus.CONFLICT, 'teams_conflict'],
    [Code.FailedPrecondition, HttpStatus.PRECONDITION_FAILED, 'teams_failed_precondition'],
    [Code.ResourceExhausted, HttpStatus.TOO_MANY_REQUESTS, 'teams_resource_exhausted'],
    [Code.Unimplemented, HttpStatus.NOT_IMPLEMENTED, 'teams_unimplemented'],
    [Code.Internal, HttpStatus.INTERNAL_SERVER_ERROR, 'teams_internal_error'],
    [Code.DataLoss, HttpStatus.INTERNAL_SERVER_ERROR, 'teams_data_loss'],
    [Code.Unavailable, HttpStatus.SERVICE_UNAVAILABLE, 'teams_unavailable'],
    [Code.DeadlineExceeded, HttpStatus.GATEWAY_TIMEOUT, 'teams_timeout'],
    [Code.OutOfRange, HttpStatus.BAD_REQUEST, 'teams_grpc_error'],
    [Code.Canceled, 499, 'teams_cancelled'],
    [Code.Unknown, HttpStatus.BAD_GATEWAY, 'teams_grpc_error'],
  ])('maps gRPC status %s to HTTP status and error code', (grpc, http, errorCode) => {
    const client = new TeamsGrpcClient({ address: 'grpc://teams' });
    const internal = client as unknown as TeamsGrpcClientPrivate;

    expect(internal.grpcStatusToHttpStatus(grpc)).toBe(http);
    expect(internal.grpcStatusToErrorCode(grpc)).toBe(errorCode);
  });

  it('prefers gRPC error details when extracting message', () => {
    const client = new TeamsGrpcClient({ address: 'grpc://teams' });
    const internal = client as unknown as TeamsGrpcClientPrivate;
    const error = new ConnectError('detailed message', Code.InvalidArgument);

    expect(internal.extractServiceErrorMessage(error)).toBe('detailed message');
  });

  it('uses error message when details are blank', () => {
    const client = new TeamsGrpcClient({ address: 'grpc://teams' });
    const internal = client as unknown as TeamsGrpcClientPrivate;
    const error = new ConnectError('  fallback message  ', Code.Unknown);

    expect(internal.extractServiceErrorMessage(error)).toBe('fallback message');
  });

  it('falls back to default message when details and message are empty', () => {
    const client = new TeamsGrpcClient({ address: 'grpc://teams' });
    const internal = client as unknown as TeamsGrpcClientPrivate;
    const error = new ConnectError('', Code.Unknown);

    expect(internal.extractServiceErrorMessage(error)).toBe(DEFAULT_ERROR_MESSAGE);
  });

  it('applies the default request timeout to gRPC calls', async () => {
    const client = new TeamsGrpcClient({ address: 'grpc://teams', requestTimeoutMs: 5_000 });
    const captured: { options?: CallOptions } = {};

    const listAgentsStub = vi.fn(async (_req: ListAgentsRequest, options?: CallOptions) => {
      captured.options = options;
      return { items: [], page: 0, perPage: 0, total: 0n } as PaginatedAgents;
    });

    (client as unknown as { client: { listAgents: typeof listAgentsStub } }).client = {
      listAgents: listAgentsStub,
    } as TeamsServiceClient;

    await client.listAgents({});

    expect(listAgentsStub).toHaveBeenCalledTimes(1);
    expect(captured.options?.timeoutMs).toBe(5_000);
  });

  it('honors per-call timeout overrides', async () => {
    const client = new TeamsGrpcClient({ address: 'grpc://teams', requestTimeoutMs: 5_000 });
    const captured: { options?: CallOptions } = {};

    const listAgentsStub = vi.fn(async (_req: ListAgentsRequest, options?: CallOptions) => {
      captured.options = options;
      return { items: [], page: 0, perPage: 0, total: 0n } as PaginatedAgents;
    });

    (client as unknown as { client: { listAgents: typeof listAgentsStub } }).client = {
      listAgents: listAgentsStub,
    } as TeamsServiceClient;

    const internal = client as unknown as TeamsGrpcClientPrivate;

    await internal.call(teamsServicePath('listAgents'), ListAgentsRequestSchema, {}, 'listAgents', 12_500);

    expect(listAgentsStub).toHaveBeenCalledTimes(1);
    expect(captured.options?.timeoutMs).toBe(12_500);
  });
});
