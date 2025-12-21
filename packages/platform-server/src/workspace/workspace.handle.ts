import type {
  WorkspaceProvider,
  ExecRequest,
  ExecResult,
  InteractiveExecRequest,
  InteractiveExecSession,
} from './providers/workspace.provider';

export class WorkspaceHandle {
  constructor(
    private readonly provider: WorkspaceProvider,
    private readonly workspaceId: string,
  ) {}

  get id(): string {
    return this.workspaceId;
  }

  get shortId(): string {
    return this.workspaceId.substring(0, 12);
  }

  async exec(command: string | string[], options: Omit<ExecRequest, 'command'> = {}): Promise<ExecResult> {
    return this.provider.exec(this.workspaceId, { ...options, command });
  }

  async openInteractiveExec(
    command: string | string[],
    options: Omit<InteractiveExecRequest, 'command'> = {},
  ): Promise<InteractiveExecSession> {
    return this.provider.openInteractiveExec(this.workspaceId, { ...options, command });
  }

  async resizeExec(execId: string, size: { cols: number; rows: number }): Promise<void> {
    if (!this.provider.resize) throw new Error('Workspace provider does not support resize');
    await this.provider.resize(execId, size);
  }

  async destroy(options?: { force?: boolean; removePersistentVolume?: boolean }): Promise<void> {
    await this.provider.destroyWorkspace(this.workspaceId, options);
  }

  async putArchive(data: Buffer | NodeJS.ReadableStream, options: { path?: string } = { path: '/tmp' }): Promise<void> {
    if (!this.provider.putArchive) throw new Error('Workspace provider does not support putArchive');
    await this.provider.putArchive(this.workspaceId, data, options);
  }

  async touch(): Promise<void> {
    if (this.provider.touchWorkspace) {
      await this.provider.touchWorkspace(this.workspaceId);
    }
  }

  async openInteractive(
    command: string | string[],
    options: Omit<InteractiveExecRequest, 'command'> = {},
  ): Promise<{
    execId: string;
    stdin: NodeJS.WritableStream;
    stdout: NodeJS.ReadableStream;
    stderr?: NodeJS.ReadableStream;
    close: () => Promise<{ exitCode: number }>;
  }> {
    return this.openInteractiveExec(command, options);
  }
}
