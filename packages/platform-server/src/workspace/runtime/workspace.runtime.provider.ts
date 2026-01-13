import type { Platform } from '../../core/constants';

export type WorkspaceRuntimeProviderType = 'docker';

export type WorkspaceStatus = 'starting' | 'running' | 'stopped' | 'deleted' | 'error';

export type WorkspaceKey = {
  threadId: string;
  role: 'workspace';
  platform?: Platform;
  nodeId?: string;
};

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

export type WorkspaceRuntimeCapabilities = {
  persistentVolume: boolean;
  network: boolean;
  networkAliases: boolean;
  dockerInDocker: boolean;
  stdioSession: boolean;
  terminalSession: boolean;
  logsSession: boolean;
};

export type WorkspaceExecRequest = {
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

export type WorkspaceExecResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

export type WorkspaceStdioSessionRequest = {
  command: string | string[];
  workdir?: string;
  env?: Record<string, string> | string[];
  tty?: boolean;
  demuxStderr?: boolean;
};

export type WorkspaceStdioSession = {
  stdin: NodeJS.WritableStream;
  stdout: NodeJS.ReadableStream;
  stderr?: NodeJS.ReadableStream;
  close: () => Promise<WorkspaceExecResult>;
};

export type WorkspaceTerminalSessionRequest = WorkspaceStdioSessionRequest & {
  size?: { cols: number; rows: number };
};

export type WorkspaceTerminalSession = WorkspaceStdioSession & {
  sessionId: string;
  execId: string;
  resize: (size: { cols: number; rows: number }) => Promise<void>;
};

export type WorkspaceLogsRequest = {
  follow?: boolean;
  since?: number;
  tail?: number;
  stdout?: boolean;
  stderr?: boolean;
  timestamps?: boolean;
};

export type WorkspaceLogsSession = {
  stream: NodeJS.ReadableStream;
  close: () => Promise<void>;
};

export type DestroyWorkspaceOptions = {
  force?: boolean;
  removePersistentVolume?: boolean;
};

export type EnsureWorkspaceResult = {
  workspaceId: string;
  created: boolean;
  providerType: WorkspaceRuntimeProviderType;
  status: WorkspaceStatus;
};

export abstract class WorkspaceRuntimeProvider {
  abstract capabilities(): WorkspaceRuntimeCapabilities;
  abstract ensureWorkspace(key: WorkspaceKey, spec: WorkspaceSpec): Promise<EnsureWorkspaceResult>;
  abstract exec(workspaceId: string, request: WorkspaceExecRequest): Promise<WorkspaceExecResult>;
  abstract openStdioSession(workspaceId: string, request: WorkspaceStdioSessionRequest): Promise<WorkspaceStdioSession>;
  abstract openTerminalSession(
    workspaceId: string,
    request: WorkspaceTerminalSessionRequest,
  ): Promise<WorkspaceTerminalSession>;
  abstract openLogsSession(workspaceId: string, request: WorkspaceLogsRequest): Promise<WorkspaceLogsSession>;
  abstract destroyWorkspace(workspaceId: string, options?: DestroyWorkspaceOptions): Promise<void>;
  abstract putArchive(
    workspaceId: string,
    data: Buffer | NodeJS.ReadableStream,
    options?: { path?: string },
  ): Promise<void>;
  abstract touchWorkspace(workspaceId: string): Promise<void>;
}
