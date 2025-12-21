import { PassThrough } from 'node:stream';
import { WorkspaceProvider } from '../../src/workspace/providers/workspace.provider';
import type {
  WorkspaceProviderCapabilities,
  WorkspaceKey,
  WorkspaceSpec,
  ExecRequest,
  ExecResult,
  InteractiveExecRequest,
  InteractiveExecSession,
  DestroyWorkspaceOptions,
} from '../../src/workspace/providers/workspace.provider';
import { WorkspaceHandle } from '../../src/workspace/workspace.handle';

export class WorkspaceProviderStub extends WorkspaceProvider {
  public readonly workspaceId: string;
  public readonly execRequests: ExecRequest[] = [];
  public readonly interactiveRequests: InteractiveExecRequest[] = [];
  public readonly touchWorkspaceCalls: string[] = [];
  public readonly ensureCalls: Array<{ key: WorkspaceKey; spec: WorkspaceSpec }> = [];

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
      interactiveExec: true,
      execResize: true,
    };
  }

  async ensureWorkspace(key: WorkspaceKey, spec: WorkspaceSpec): Promise<{ workspaceId: string; created: boolean }> {
    this.ensureCalls.push({ key, spec });
    return { workspaceId: this.workspaceId, created: false };
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

  async openInteractiveExec(_workspaceId: string, request: InteractiveExecRequest): Promise<InteractiveExecSession> {
    this.interactiveRequests.push(request);
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    setImmediate(() => stdout.end());
    return { execId: 'interactive-stub', stdin, stdout, stderr: undefined, close: async () => ({ exitCode: 0 }) };
  }

  async resize(_execId: string, _size: { cols: number; rows: number }): Promise<void> {
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
