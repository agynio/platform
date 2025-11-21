export type ContainerExecOptions = {
  workdir?: string;
  env?: Record<string, string> | string[];
  timeoutMs?: number;
  idleTimeoutMs?: number;
  killOnTimeout?: boolean;
  tty?: boolean;
  signal?: AbortSignal;
  onOutput?: (source: 'stdout' | 'stderr', chunk: Buffer) => void;
};

export type ContainerArchiveOptions = {
  path: string;
};

export interface ContainerHandleDelegate {
  execContainer(
    containerId: string,
    command: string[] | string,
    options?: ContainerExecOptions,
  ): Promise<{ stdout: string; stderr: string; exitCode: number }>;

  stopContainer(containerId: string, timeoutSec?: number): Promise<void>;

  removeContainer(containerId: string, force?: boolean): Promise<void>;

  putArchive(
    containerId: string,
    data: Buffer | NodeJS.ReadableStream,
    options: ContainerArchiveOptions,
  ): Promise<void>;
}
