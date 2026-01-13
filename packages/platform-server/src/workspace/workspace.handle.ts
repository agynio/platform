import type {
  DestroyWorkspaceOptions,
  WorkspaceExecRequest,
  WorkspaceExecResult,
  WorkspaceLogsRequest,
  WorkspaceLogsSession,
  WorkspaceRuntimeProvider,
  WorkspaceStdioSession,
  WorkspaceStdioSessionRequest,
  WorkspaceTerminalSession,
  WorkspaceTerminalSessionRequest,
} from './runtime/workspace.runtime.provider';

type LegacyInteractiveExecSession = {
  execId: string;
  stdin: NodeJS.WritableStream;
  stdout: NodeJS.ReadableStream;
  stderr?: NodeJS.ReadableStream;
  close: () => Promise<WorkspaceExecResult>;
};

type LegacyInteractiveExecRequest = {
  command: string | string[];
  workdir?: string;
  env?: Record<string, string> | string[];
  tty?: boolean;
  demuxStderr?: boolean;
};

export class WorkspaceRuntimeHandle {
  constructor(
    protected readonly provider: WorkspaceRuntimeProvider,
    protected readonly workspaceId: string,
  ) {}

  get id(): string {
    return this.workspaceId;
  }

  get shortId(): string {
    return this.workspaceId.substring(0, 12);
  }

  async exec(
    command: string | string[],
    options: Omit<WorkspaceExecRequest, 'command'> = {},
  ): Promise<WorkspaceExecResult> {
    return this.provider.exec(this.workspaceId, { ...options, command });
  }

  async openStdioSession(
    command: string | string[],
    options: Omit<WorkspaceStdioSessionRequest, 'command'> = {},
  ): Promise<WorkspaceStdioSession> {
    return this.provider.openStdioSession(this.workspaceId, { ...options, command });
  }

  async openTerminalSession(
    command: string | string[],
    options: Omit<WorkspaceTerminalSessionRequest, 'command'> = {},
  ): Promise<WorkspaceTerminalSession> {
    return this.provider.openTerminalSession(this.workspaceId, { ...options, command });
  }

  async openLogsSession(options: WorkspaceLogsRequest = {}): Promise<WorkspaceLogsSession> {
    return this.provider.openLogsSession(this.workspaceId, options);
  }

  async putArchive(
    data: Buffer | NodeJS.ReadableStream,
    options: { path?: string } = { path: '/tmp' },
  ): Promise<void> {
    await this.provider.putArchive(this.workspaceId, data, options);
  }

  async touch(): Promise<void> {
    await this.provider.touchWorkspace(this.workspaceId);
  }

  async destroy(options?: DestroyWorkspaceOptions): Promise<void> {
    await this.provider.destroyWorkspace(this.workspaceId, options);
  }
}

export class WorkspaceHandle extends WorkspaceRuntimeHandle {
  private readonly terminalSessions = new Map<string, WorkspaceTerminalSession>();

  async openInteractiveExec(
    command: string | string[],
    options: Omit<LegacyInteractiveExecRequest, 'command'> = {},
  ): Promise<LegacyInteractiveExecSession> {
    const providerAny = this.provider as {
      openInteractiveExec?: (
        workspaceId: string,
        request: LegacyInteractiveExecRequest,
      ) => Promise<LegacyInteractiveExecSession>;
    };
    const supportsTerminal = typeof (this.provider as { openTerminalSession?: unknown }).openTerminalSession === 'function';
    const supportsStdio = typeof (this.provider as { openStdioSession?: unknown }).openStdioSession === 'function';

    const useTty = options.tty ?? false;

    if ((!supportsTerminal || (!supportsStdio && !useTty)) && providerAny.openInteractiveExec) {
      return providerAny.openInteractiveExec(this.workspaceId, { ...options, command });
    }

    if (!useTty) {
      const session = await this.openStdioSession(command, {
        workdir: options.workdir,
        env: options.env,
        demuxStderr: options.demuxStderr ?? true,
        tty: false,
      });

      const execId = `stdio-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      return {
        execId,
        stdin: session.stdin,
        stdout: session.stdout,
        stderr: session.stderr,
        close: session.close,
      };
    }

    const session = await this.openTerminalSession(command, {
      workdir: options.workdir,
      env: options.env,
      demuxStderr: options.demuxStderr ?? false,
    });

    this.terminalSessions.set(session.execId, session);

    return {
      execId: session.execId,
      stdin: session.stdin,
      stdout: session.stdout,
      stderr: session.stderr,
      close: async () => {
        try {
          return await session.close();
        } finally {
          this.terminalSessions.delete(session.execId);
        }
      },
    };
  }

  async resizeExec(execId: string, size: { cols: number; rows: number }): Promise<void> {
    const session = this.terminalSessions.get(execId);
    if (session) {
      await session.resize(size);
      return;
    }

    const providerAny = this.provider as {
      resize?: (execId: string, size: { cols: number; rows: number }) => Promise<void>;
    };

    if (providerAny.resize) {
      await providerAny.resize(execId, size);
      return;
    }

    throw new Error('terminal_session_not_found');
  }

  async openInteractive(
    command: string | string[],
    options: Omit<LegacyInteractiveExecRequest, 'command'> = {},
  ): Promise<LegacyInteractiveExecSession> {
    return this.openInteractiveExec(command, options);
  }

  override async destroy(options?: DestroyWorkspaceOptions): Promise<void> {
    this.terminalSessions.clear();
    await super.destroy(options);
  }
}
