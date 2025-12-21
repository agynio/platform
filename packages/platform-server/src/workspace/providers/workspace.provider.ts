import type { Platform } from '../../core/constants';

export type WorkspaceKey = {
  threadId: string;
  role: 'workspace';
  platform?: Platform;
  nodeId?: string;
};

export type WorkspaceStatus = 'starting' | 'running' | 'stopped' | 'deleted' | 'error';

export type WorkspaceSpec = {
  image?: string;
  workingDir?: string;
  env?: Record<string, string>;
  persistentVolume?: {
    mountPath: string;
  };
  network?: {
    name: string;
    aliases?: string[];
  };
  dockerInDocker?: {
    enabled: boolean;
    mirrorUrl?: string;
  };
  resources?: {
    cpuNano?: number;
    memoryBytes?: number;
  };
  ttlSeconds?: number;
};

export type WorkspaceProviderCapabilities = {
  persistentVolume: boolean;
  network: boolean;
  networkAliases: boolean;
  dockerInDocker: boolean;
  interactiveExec: boolean;
  execResize: boolean;
};

export type ExecRequest = {
  command: string | string[];
  workdir?: string;
  env?: Record<string, string> | string[];
  timeoutMs?: number;
  idleTimeoutMs?: number;
  killOnTimeout?: boolean;
  tty?: boolean;
  signal?: AbortSignal;
  onOutput?: (source: 'stdout' | 'stderr', chunk: Buffer) => void;
  logToPid1?: boolean;
};

export type ExecResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

export type InteractiveExecRequest = {
  command: string | string[];
  workdir?: string;
  env?: Record<string, string> | string[];
  tty?: boolean;
  demuxStderr?: boolean;
};

export type InteractiveExecSession = {
  execId: string;
  stdin: NodeJS.WritableStream;
  stdout: NodeJS.ReadableStream;
  stderr?: NodeJS.ReadableStream;
  close: () => Promise<{ exitCode: number }>;
};

export type DestroyWorkspaceOptions = {
  force?: boolean;
  removePersistentVolume?: boolean;
};

/**
 * Base abstraction for workspace providers.
 * Acts as the Nest injection token so alternative implementations or routers
 * can extend this class without changing consumers.
 */
export abstract class WorkspaceProvider {
  abstract capabilities(): WorkspaceProviderCapabilities;
  abstract ensureWorkspace(key: WorkspaceKey, spec: WorkspaceSpec): Promise<{ workspaceId: string; created: boolean }>;
  abstract exec(workspaceId: string, request: ExecRequest): Promise<ExecResult>;
  abstract openInteractiveExec(workspaceId: string, request: InteractiveExecRequest): Promise<InteractiveExecSession>;
  abstract destroyWorkspace(workspaceId: string, options?: DestroyWorkspaceOptions): Promise<void>;

  resize?(execId: string, size: { cols: number; rows: number }): Promise<void>;
  putArchive?(workspaceId: string, data: Buffer | NodeJS.ReadableStream, options?: { path?: string }): Promise<void>;
  touchWorkspace?(workspaceId: string): Promise<void>;
}
