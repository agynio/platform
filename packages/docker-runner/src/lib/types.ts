import type { ContainerCreateOptions } from 'dockerode';

export const SUPPORTED_PLATFORMS = ['linux/amd64', 'linux/arm64'] as const;
export type Platform = (typeof SUPPORTED_PLATFORMS)[number];

export const PLATFORM_LABEL = 'hautech.ai/platform';

export type SidecarOpts = {
  image: string;
  cmd?: string[];
  env?: Record<string, string> | string[];
  privileged?: boolean;
  autoRemove?: boolean;
  anonymousVolumes?: string[];
  labels?: Record<string, string>;
  createExtras?: Partial<ContainerCreateOptions>;
  networkMode?: string;
};

export type ContainerOpts = {
  image?: string;
  name?: string;
  cmd?: string[];
  entrypoint?: string;
  env?: Record<string, string> | string[];
  workingDir?: string;
  autoRemove?: boolean;
  binds?: string[];
  networkMode?: string;
  tty?: boolean;
  labels?: Record<string, string>;
  platform?: Platform;
  privileged?: boolean;
  anonymousVolumes?: string[];
  createExtras?: Partial<ContainerCreateOptions>;
  ttlSeconds?: number;
  sidecars?: SidecarOpts[];
};

export type ExecOptions = {
  workdir?: string;
  env?: Record<string, string> | string[];
  timeoutMs?: number;
  idleTimeoutMs?: number;
  tty?: boolean;
  killOnTimeout?: boolean;
  signal?: AbortSignal;
  onOutput?: (source: 'stdout' | 'stderr', chunk: Buffer) => void;
  logToPid1?: boolean;
};

export type ExecResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
};

export type InteractiveExecOptions = {
  workdir?: string;
  env?: Record<string, string> | string[];
  tty?: boolean;
  demuxStderr?: boolean;
};

export type InteractiveExecSession = {
  stdin: NodeJS.WritableStream;
  stdout: NodeJS.ReadableStream;
  stderr?: NodeJS.ReadableStream;
  close: () => Promise<ExecResult>;
  execId: string;
  terminateProcessGroup: (reason: 'timeout' | 'idle_timeout') => Promise<void>;
};

export type LogsStreamOptions = {
  follow?: boolean;
  since?: number;
  tail?: number;
  stdout?: boolean;
  stderr?: boolean;
  timestamps?: boolean;
};

export type LogsStreamSession = {
  stream: NodeJS.ReadableStream;
  close: () => Promise<void>;
};

export type ContainerInspectMount = {
  Type?: string;
  Source?: string;
  Destination?: string;
  RW?: boolean;
  ReadOnly?: boolean;
  Name?: string;
};

export type ContainerInspectState = {
  Status?: string;
  Running?: boolean;
};

export type ContainerInspectNetworkSettings = {
  Networks?: Record<string, Record<string, unknown>>;
};

export type ContainerInspectInfo = {
  Id?: string;
  Name?: string;
  Image?: string;
  Config?: {
    Image?: string;
    Labels?: Record<string, string>;
  };
  Mounts?: ContainerInspectMount[];
  State?: ContainerInspectState;
  NetworkSettings?: ContainerInspectNetworkSettings;
};
