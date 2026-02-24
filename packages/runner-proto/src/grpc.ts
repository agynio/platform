import { makeGenericClientConstructor } from '@grpc/grpc-js';
import type { MethodDefinition, ServiceDefinition } from '@grpc/grpc-js';
import {
  CancelExecutionRequestSchema,
  CancelExecutionResponseSchema,
  ExecRequestSchema,
  ExecResponseSchema,
  ReadyRequestSchema,
  ReadyResponseSchema,
} from './gen/agynio/api/runner/v1/runner_pb.js';

type MessageSchema = {
  fromBinary: (bytes: Uint8Array) => unknown;
  toBinary: (value: unknown) => Uint8Array;
};

const unaryDefinition = (
  path: string,
  input: MessageSchema,
  output: MessageSchema,
): MethodDefinition<unknown, unknown> => ({
  path,
  requestStream: false,
  responseStream: false,
  requestSerialize: (value: unknown) => Buffer.from(input.toBinary(value)),
  responseSerialize: (value: unknown) => Buffer.from(output.toBinary(value)),
  requestDeserialize: (buffer: Buffer) => input.fromBinary(buffer),
  responseDeserialize: (buffer: Buffer) => output.fromBinary(buffer),
  originalName: path.split('/').pop() ?? path,
});

const bidiDefinition = (
  path: string,
  input: MessageSchema,
  output: MessageSchema,
): MethodDefinition<unknown, unknown> => ({
  path,
  requestStream: true,
  responseStream: true,
  requestSerialize: (value: unknown) => Buffer.from(input.toBinary(value)),
  responseSerialize: (value: unknown) => Buffer.from(output.toBinary(value)),
  requestDeserialize: (buffer: Buffer) => input.fromBinary(buffer),
  responseDeserialize: (buffer: Buffer) => output.fromBinary(buffer),
  originalName: path.split('/').pop() ?? path,
});

export const RUNNER_SERVICE_READY_PATH = '/agynio.api.runner.v1.RunnerService/Ready';
export const RUNNER_SERVICE_EXEC_PATH = '/agynio.api.runner.v1.RunnerService/Exec';
export const RUNNER_SERVICE_CANCEL_EXEC_PATH = '/agynio.api.runner.v1.RunnerService/CancelExecution';

export const runnerServiceGrpcDefinition: ServiceDefinition = {
  ready: unaryDefinition(RUNNER_SERVICE_READY_PATH, ReadyRequestSchema as unknown as MessageSchema, ReadyResponseSchema as unknown as MessageSchema),
  exec: bidiDefinition(RUNNER_SERVICE_EXEC_PATH, ExecRequestSchema as unknown as MessageSchema, ExecResponseSchema as unknown as MessageSchema),
  cancelExecution: unaryDefinition(
    RUNNER_SERVICE_CANCEL_EXEC_PATH,
    CancelExecutionRequestSchema as unknown as MessageSchema,
    CancelExecutionResponseSchema as unknown as MessageSchema,
  ),
};

export const RunnerServiceGrpcClient = makeGenericClientConstructor(
  runnerServiceGrpcDefinition,
  'agynio.api.runner.v1.RunnerService',
);

export type RunnerServiceGrpcClientInstance = InstanceType<typeof RunnerServiceGrpcClient>;
