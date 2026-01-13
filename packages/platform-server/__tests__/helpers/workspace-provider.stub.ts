import { PassThrough } from 'node:stream';
import {
  WorkspaceProvider,
  type WorkspaceProviderCapabilities,
  type WorkspaceKey,
  type WorkspaceSpec,
  type ExecRequest,
  type ExecResult,
  type DestroyWorkspaceOptions,
  type InteractiveExecRequest,
  type WorkspaceLogsRequestCompat,
  type WorkspaceLogsSessionCompat,
  type WorkspaceTerminalSessionCompat,
  type WorkspaceTerminalSessionRequestCompat,
} from '../../src/workspace/providers/workspace.provider';
import type {
  WorkspaceStdioSessionRequest,
  WorkspaceStdioSession,
} from '../../src/workspace/runtime/workspace.runtime.provider';
import { WorkspaceHandle } from '../../src/workspace/workspace.handle';

export class WorkspaceProviderStub extends WorkspaceProvider {
  public readonly workspaceId: string;
  public readonly execRequests: ExecRequest[] = [];
  public readonly stdioRequests: WorkspaceStdioSessionRequest[] = [];
  public readonly terminalRequests: WorkspaceTerminalSessionRequestCompat[] = [];
  public readonly interactiveRequests: WorkspaceStdioSessionRequest[] = [];
  public readonly logsRequests: WorkspaceLogsRequestCompat[] = [];
  public readonly touchWorkspaceCalls: string[] = [];
  public readonly ensureCalls: Array<{ key: WorkspaceKey; spec: WorkspaceSpec }> = [];
  public readonly resizeCalls: Array<{ sessionId: string; size: { cols: number; rows: number } }> = [];

  constructor(private readonly baseEnv: Record<string, string> = {}, workspaceId = 'workspace-stub') {
    super();
    this.workspaceId = workspaceId;
  }

  capabilities(): WorkspaceProviderCapabilities {
    return {
      persistentVolume: true,
      network: true,
      networkAliases: true,
      dockerInDocker: true,
      stdioSession: true,
      terminalSession: true,
      logsSession: true,
    };
  }

  async ensureWorkspace(key: WorkspaceKey, spec: WorkspaceSpec) {
    this.ensureCalls.push({ key, spec });
    return { workspaceId: this.workspaceId, created: false, providerType: 'docker', status: 'running' as const };
  }

  async exec(_workspaceId: string, request: ExecRequest): Promise<ExecResult> {
    this.execRequests.push(request);
    const envOverrides = Array.isArray(request.env)
      ? request.env.reduce<Record<string, string>>((acc, entry) => {
          const idx = entry.indexOf('=');
          if (idx > 0) acc[entry.slice(0, idx)] = entry.slice(idx + 1);
          return acc;
        }, {})
      : request.env ?? {};
    const effectiveEnv = { ...this.baseEnv, ...envOverrides };
    const stdout = Object.entries(effectiveEnv)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');
    return { stdout, stderr: '', exitCode: 0 };
  }

  async openStdioSession(
    _workspaceId: string,
    request: WorkspaceStdioSessionRequest,
  ): Promise<WorkspaceStdioSession> {
    this.stdioRequests.push(request);
    this.interactiveRequests.push(request);
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    setImmediate(() => stdout.end());
    return { stdin, stdout, stderr: undefined, close: async () => ({ exitCode: 0, stdout: '', stderr: '' }) };
  }

  async openTerminalSession(
    _workspaceId: string,
    request: WorkspaceTerminalSessionRequestCompat,
  ): Promise<WorkspaceTerminalSessionCompat> {
    this.terminalRequests.push(request);
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    const sessionId = `terminal-${this.terminalRequests.length}`;
    setImmediate(() => stdout.end());
    return {
      sessionId,
      execId: sessionId,
      stdin,
      stdout,
      stderr: undefined,
      resize: async (size: { cols: number; rows: number }) => {
        this.resizeCalls.push({ sessionId, size });
      },
      close: async () => ({ exitCode: 0, stdout: '', stderr: '' }),
    };
  }

  async openLogsSession(
    _workspaceId: string,
    request: WorkspaceLogsRequestCompat,
  ): Promise<WorkspaceLogsSessionCompat> {
    this.logsRequests.push(request);
    const stream = new PassThrough();
    setImmediate(() => stream.end());
    return { stream, close: async () => { stream.end(); } };
  }

  async putArchive(): Promise<void> {
    return;
  }

  async destroyWorkspace(_workspaceId: string, _options?: DestroyWorkspaceOptions): Promise<void> {
    return;
  }

  async touchWorkspace(workspaceId: string): Promise<void> {
    this.touchWorkspaceCalls.push(workspaceId);
  }

  createHandle(): WorkspaceHandle {
    return new WorkspaceHandle(this, this.workspaceId);
  }
}

export class WorkspaceNodeStub {
  private readonly handle: WorkspaceHandle;

  constructor(provider: WorkspaceProviderStub) {
    this.handle = provider.createHandle();
  }

  async provide(_threadId: string): Promise<WorkspaceHandle> {
    return this.handle;
  }
}
