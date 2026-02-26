export type ExecRunStreamReadyFrame = {
  type: 'ready';
  execId: string;
};

export type ExecRunStreamChunkFrame = {
  type: 'stdout' | 'stderr';
  seq: number;
  data: string;
};

export type ExecRunStreamTerminalFrame = {
  type: 'terminal';
  seq: number;
  exitCode: number | null;
  signal?: string | null;
};

export type ExecRunStreamErrorFrame = {
  type: 'error';
  seq: number;
  code: string;
  message: string;
  retryable?: boolean;
};

export type ExecRunStreamFrame =
  | ExecRunStreamReadyFrame
  | ExecRunStreamChunkFrame
  | ExecRunStreamTerminalFrame
  | ExecRunStreamErrorFrame;
