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
