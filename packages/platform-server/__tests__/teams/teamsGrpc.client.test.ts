import { describe, expect, it, vi } from 'vitest';
import { Metadata, status, type CallOptions, type ServiceError } from '@grpc/grpc-js';
import { HttpStatus } from '@nestjs/common';
import {
  ListAgentsRequestSchema,
  type ListAgentsRequest,
  type ListAgentsResponse,
} from '../../src/proto/gen/agynio/api/teams/v1/teams_pb.js';
import { TeamsGrpcClient } from '../../src/teams/teamsGrpc.client';
import {
  TEAMS_SERVICE_LIST_AGENTS_PATH,
  type TeamsServiceGrpcClientInstance,
} from '../../src/proto/teams-grpc.js';

const DEFAULT_ERROR_MESSAGE = 'Teams service request failed';

type TeamsGrpcClientPrivate = {
  grpcStatusToHttpStatus: (grpcCode: status) => HttpStatus;
  grpcStatusToErrorCode: (grpcCode: status) => string;
  extractServiceErrorMessage: (error: ServiceError) => string;
  call: <Req, Res>(
    path: string,
    schema: unknown,
    request: Req,
    method: keyof TeamsServiceGrpcClientInstance,
    timeoutMs?: number,
  ) => Promise<Res>;
};

describe('TeamsGrpcClient', () => {
  it('throws when address is blank', () => {
    expect(() => new TeamsGrpcClient({ address: '  ' })).toThrow('TeamsGrpcClient requires a valid address');
  });

  it.each([
    [status.INVALID_ARGUMENT, HttpStatus.BAD_REQUEST, 'teams_invalid_argument'],
    [status.UNAUTHENTICATED, HttpStatus.UNAUTHORIZED, 'teams_unauthenticated'],
    [status.PERMISSION_DENIED, HttpStatus.FORBIDDEN, 'teams_forbidden'],
    [status.NOT_FOUND, HttpStatus.NOT_FOUND, 'teams_not_found'],
    [status.ABORTED, HttpStatus.CONFLICT, 'teams_conflict'],
    [status.ALREADY_EXISTS, HttpStatus.CONFLICT, 'teams_conflict'],
    [status.FAILED_PRECONDITION, HttpStatus.PRECONDITION_FAILED, 'teams_failed_precondition'],
    [status.RESOURCE_EXHAUSTED, HttpStatus.TOO_MANY_REQUESTS, 'teams_resource_exhausted'],
    [status.UNIMPLEMENTED, HttpStatus.NOT_IMPLEMENTED, 'teams_unimplemented'],
    [status.INTERNAL, HttpStatus.INTERNAL_SERVER_ERROR, 'teams_internal_error'],
    [status.DATA_LOSS, HttpStatus.INTERNAL_SERVER_ERROR, 'teams_data_loss'],
    [status.UNAVAILABLE, HttpStatus.SERVICE_UNAVAILABLE, 'teams_unavailable'],
    [status.DEADLINE_EXCEEDED, HttpStatus.GATEWAY_TIMEOUT, 'teams_timeout'],
    [status.OUT_OF_RANGE, HttpStatus.BAD_REQUEST, 'teams_grpc_error'],
    [status.CANCELLED, 499, 'teams_cancelled'],
    [status.UNKNOWN, HttpStatus.BAD_GATEWAY, 'teams_grpc_error'],
  ])('maps gRPC status %s to HTTP status and error code', (grpc, http, errorCode) => {
    const client = new TeamsGrpcClient({ address: 'grpc://teams' });
    const internal = client as unknown as TeamsGrpcClientPrivate;

    expect(internal.grpcStatusToHttpStatus(grpc)).toBe(http);
    expect(internal.grpcStatusToErrorCode(grpc)).toBe(errorCode);
  });

  it('prefers gRPC error details when extracting message', () => {
    const client = new TeamsGrpcClient({ address: 'grpc://teams' });
    const internal = client as unknown as TeamsGrpcClientPrivate;
    const error = Object.assign(new Error('fallback message'), {
      details: 'detailed message',
    }) as ServiceError;

    expect(internal.extractServiceErrorMessage(error)).toBe('detailed message');
  });

  it('uses error message when details are blank', () => {
    const client = new TeamsGrpcClient({ address: 'grpc://teams' });
    const internal = client as unknown as TeamsGrpcClientPrivate;
    const error = Object.assign(new Error('  fallback message  '), {
      details: '   ',
    }) as ServiceError;

    expect(internal.extractServiceErrorMessage(error)).toBe('fallback message');
  });

  it('falls back to default message when details and message are empty', () => {
    const client = new TeamsGrpcClient({ address: 'grpc://teams' });
    const internal = client as unknown as TeamsGrpcClientPrivate;
    const error = Object.assign(new Error(''), {
      details: '',
    }) as ServiceError;

    expect(internal.extractServiceErrorMessage(error)).toBe(DEFAULT_ERROR_MESSAGE);
  });

  it('applies the default request timeout to gRPC calls', async () => {
    vi.useFakeTimers();
    const now = new Date('2026-03-09T00:00:00.000Z');
    vi.setSystemTime(now);

    try {
      const client = new TeamsGrpcClient({ address: 'grpc://teams', requestTimeoutMs: 5_000 });
      const captured: { options?: CallOptions } = {};

      const listAgentsStub = vi.fn(
        (
          _req: ListAgentsRequest,
          _metadata: Metadata,
          optionsOrCallback?: CallOptions | ((err: ServiceError | null, response?: ListAgentsResponse) => void),
          maybeCallback?: (err: ServiceError | null, response?: ListAgentsResponse) => void,
        ) => {
          const callback = typeof optionsOrCallback === 'function' ? optionsOrCallback : maybeCallback;
          const options = typeof optionsOrCallback === 'function' ? undefined : optionsOrCallback;
          captured.options = options;
          callback?.(null, { agents: [], nextPageToken: '' } as ListAgentsResponse);
        },
      );

      (client as unknown as { client: { listAgents: typeof listAgentsStub } }).client = {
        listAgents: listAgentsStub,
      } as TeamsServiceGrpcClientInstance;

      await client.listAgents({});

      expect(listAgentsStub).toHaveBeenCalledTimes(1);
      expect(captured.options?.deadline?.getTime()).toBe(now.getTime() + 5_000);
    } finally {
      vi.useRealTimers();
    }
  });

  it('honors per-call timeout overrides', async () => {
    vi.useFakeTimers();
    const now = new Date('2026-03-09T00:00:00.000Z');
    vi.setSystemTime(now);

    try {
      const client = new TeamsGrpcClient({ address: 'grpc://teams', requestTimeoutMs: 5_000 });
      const captured: { options?: CallOptions } = {};

      const listAgentsStub = vi.fn(
        (
          _req: ListAgentsRequest,
          _metadata: Metadata,
          optionsOrCallback?: CallOptions | ((err: ServiceError | null, response?: ListAgentsResponse) => void),
          maybeCallback?: (err: ServiceError | null, response?: ListAgentsResponse) => void,
        ) => {
          const callback = typeof optionsOrCallback === 'function' ? optionsOrCallback : maybeCallback;
          const options = typeof optionsOrCallback === 'function' ? undefined : optionsOrCallback;
          captured.options = options;
          callback?.(null, { agents: [], nextPageToken: '' } as ListAgentsResponse);
        },
      );

      (client as unknown as { client: { listAgents: typeof listAgentsStub } }).client = {
        listAgents: listAgentsStub,
      } as TeamsServiceGrpcClientInstance;

      const internal = client as unknown as TeamsGrpcClientPrivate;

      await internal.call(
        TEAMS_SERVICE_LIST_AGENTS_PATH,
        ListAgentsRequestSchema,
        {},
        'listAgents',
        12_500,
      );

      expect(listAgentsStub).toHaveBeenCalledTimes(1);
      expect(captured.options?.deadline?.getTime()).toBe(now.getTime() + 12_500);
    } finally {
      vi.useRealTimers();
    }
  });
});
