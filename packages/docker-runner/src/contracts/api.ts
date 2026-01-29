import type Docker from 'dockerode';
import type { ContainerOpts, ExecOptions, ExecResult, Platform } from '../lib/types';

export type ErrorPayload = {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
    retryable?: boolean;
  };
};

export type EnsureImageRequest = { image: string; platform?: Platform };
export type StartContainerRequest = ContainerOpts;
export type StartContainerResponse = { containerId: string; name?: string; status?: string };
export type StopContainerRequest = { containerId: string; timeoutSec?: number };
export type RemoveContainerRequest = {
  containerId: string;
  force?: boolean;
  removeVolumes?: boolean;
};
export type InspectContainerResponse = Docker.ContainerInspectInfo;
export type FindByLabelsRequest = { labels: Record<string, string>; all?: boolean };
export type FindByLabelsResponse = { containerIds: string[] };
export type ExecRunRequest = { containerId: string; command: string[] | string; options?: ExecOptions };
export type ExecRunResponse = ExecResult;
export type ResizeExecRequest = { execId: string; size: { cols: number; rows: number } };
export type LogsStreamQuery = {
  containerId: string;
  follow?: boolean;
  since?: number;
  tail?: number;
  stdout?: boolean;
  stderr?: boolean;
  timestamps?: boolean;
};
export type TouchRequest = { containerId: string };
export type PutArchiveRequest = { containerId: string; path: string; payloadBase64: string };
export type ListByVolumeResponse = { containerIds: string[] };
export type RemoveVolumeRequest = { volumeName: string; force?: boolean };
