import type { ContainerHandle } from './container.handle';
import type {
  ContainerOpts,
  ExecOptions,
  ExecResult,
  InteractiveExecOptions,
  InteractiveExecSession,
  LogsStreamOptions,
  LogsStreamSession,
  Platform,
} from './types';

export type DockerEventFilters = Record<string, Array<string | number>>;

export interface DockerClientPort {
  touchLastUsed(containerId: string): Promise<void>;
  ensureImage(image: string, platform?: Platform): Promise<void>;
  start(opts?: ContainerOpts): Promise<ContainerHandle>;
  execContainer(containerId: string, command: string[] | string, options?: ExecOptions): Promise<ExecResult>;
  openInteractiveExec(
    containerId: string,
    command: string[] | string,
    options?: InteractiveExecOptions,
  ): Promise<InteractiveExecSession>;
  streamContainerLogs(containerId: string, options?: LogsStreamOptions): Promise<LogsStreamSession>;
  resizeExec(execId: string, size: { cols: number; rows: number }): Promise<void>;
  stopContainer(containerId: string, timeoutSec?: number): Promise<void>;
  removeContainer(
    containerId: string,
    options?: boolean | { force?: boolean; removeVolumes?: boolean },
  ): Promise<void>;
  getContainerLabels(containerId: string): Promise<Record<string, string> | undefined>;
  getContainerNetworks(containerId: string): Promise<string[]>;
  findContainersByLabels(labels: Record<string, string>, options?: { all?: boolean }): Promise<ContainerHandle[]>;
  listContainersByVolume(volumeName: string): Promise<string[]>;
  removeVolume(volumeName: string, options?: { force?: boolean }): Promise<void>;
  findContainerByLabels(labels: Record<string, string>, options?: { all?: boolean }): Promise<ContainerHandle | undefined>;
  putArchive(containerId: string, data: Buffer | NodeJS.ReadableStream, options: { path: string }): Promise<void>;
  inspectContainer(containerId: string): Promise<import('dockerode').ContainerInspectInfo>;
  getEventsStream(options: { since?: number; filters?: DockerEventFilters }): Promise<NodeJS.ReadableStream>;
}
