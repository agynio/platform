import { describe, expect, it } from 'vitest';
import { ShellCommandNode } from '../../src/nodes/tools/shell_command/shell_command.node';
import { EnvService } from '../../src/env/env.service';
import { LoggerService } from '../../src/core/services/logger.service';
import type { ContainerHandle } from '../../src/infra/container/container.handle';
import type { WorkspaceNode } from '../../src/nodes/workspace/workspace.node';

class RecordingContainer {
  public readonly calls: Array<{ command: string | string[]; workdir?: string }> = [];

  constructor(private readonly existingDirs: Set<string>) {}

  async exec(command: string | string[], options?: { workdir?: string; timeoutMs?: number; idleTimeoutMs?: number }) {
    this.calls.push({ command, workdir: options?.workdir });
    if (Array.isArray(command)) {
      const target = command[command.length - 1] ?? '';
      const ok = this.existingDirs.has(target);
      return { stdout: '', stderr: ok ? '' : 'missing', exitCode: ok ? 0 : 1 };
    }
    const wd = options?.workdir ?? '';
    return { stdout: `PWD=${wd}`, stderr: '', exitCode: 0 };
  }

  async putArchive(): Promise<void> {
    // not needed for these tests
  }
}

function createNodeWithContainer(container: RecordingContainer, workspaceRoot = '/workspace') {
  const vaultStub = { getSecret: async () => '' } as const;
  const envService = new EnvService(vaultStub as any);
  const logger = new LoggerService();
  const archiveStub = { createSingleFileTar: async () => Buffer.from('') } as const;
  const node = new ShellCommandNode(envService as any, logger as any, {} as any, archiveStub as any);
  const provider = {
    provide: async () => container as unknown as ContainerHandle,
    getWorkspaceRoot: () => workspaceRoot,
  } as unknown as WorkspaceNode;
  node.setContainerProvider(provider);
  return node;
}

const ctx = {
  threadId: 't1',
  finishSignal: { activate() {}, deactivate() {}, isActive: false },
  callerAgent: {},
} as const;

describe('ShellCommandTool cwd handling', () => {
  it('accepts absolute cwd inside workspace and overrides static workdir', async () => {
    const container = new RecordingContainer(new Set(['/workspace', '/workspace/app']));
    const node = createNodeWithContainer(container);
    await node.setConfig({ workdir: '/workspace/base' });
    const tool = node.getTool();

    const result = await tool.execute({ command: 'pwd', cwd: '/workspace/app' }, ctx as any);
    expect(result.trim()).toBe('PWD=/workspace/app');
    expect(container.calls).toHaveLength(2);
    expect(container.calls[0].command).toEqual(['test', '-d', '/workspace/app']);
    expect(container.calls[1].workdir).toBe('/workspace/app');
  });

  it('resolves relative cwd against static workdir', async () => {
    const container = new RecordingContainer(new Set(['/workspace', '/workspace/project', '/workspace/project/src']));
    const node = createNodeWithContainer(container);
    await node.setConfig({ workdir: '/workspace/project' });
    const tool = node.getTool();

    const result = await tool.execute({ command: 'pwd', cwd: 'src' }, ctx as any);
    expect(result.trim()).toBe('PWD=/workspace/project/src');
    expect(container.calls[0].command).toEqual(['test', '-d', '/workspace/project/src']);
    expect(container.calls[1].workdir).toBe('/workspace/project/src');
  });

  it('resolves relative cwd against workspace root when workdir is unset', async () => {
    const container = new RecordingContainer(new Set(['/workspace', '/workspace/tmp']));
    const node = createNodeWithContainer(container);
    await node.setConfig({});
    const tool = node.getTool();

    const result = await tool.execute({ command: 'pwd', cwd: 'tmp' }, ctx as any);
    expect(result.trim()).toBe('PWD=/workspace/tmp');
    expect(container.calls[0].command).toEqual(['test', '-d', '/workspace/tmp']);
    expect(container.calls[1].workdir).toBe('/workspace/tmp');
  });

  it('rejects non-existent cwd with clear error', async () => {
    const container = new RecordingContainer(new Set(['/workspace']));
    const node = createNodeWithContainer(container);
    await node.setConfig({});
    const tool = node.getTool();

    await expect(tool.execute({ command: 'pwd', cwd: '/workspace/missing' }, ctx as any)).rejects.toThrow(
      /directory "\/workspace\/missing" does not exist/i,
    );
    expect(container.calls).toHaveLength(1);
    expect(container.calls[0].command).toEqual(['test', '-d', '/workspace/missing']);
  });

  it('rejects cwd escaping the workspace root', async () => {
    const container = new RecordingContainer(new Set(['/workspace', '/workspace/app']));
    const node = createNodeWithContainer(container);
    await node.setConfig({ workdir: '/workspace/app' });
    const tool = node.getTool();

    await expect(tool.execute({ command: 'pwd', cwd: '/tmp' }, ctx as any)).rejects.toThrow(
      /workspace root "\/workspace"/i,
    );
    expect(container.calls).toHaveLength(0);
  });

  it('rejects cwd containing illegal characters', async () => {
    const container = new RecordingContainer(new Set(['/workspace']));
    const node = createNodeWithContainer(container);
    await node.setConfig({});
    const tool = node.getTool();

    await expect(tool.execute({ command: 'pwd', cwd: 'foo$bar' }, ctx as any)).rejects.toThrow(
      /only letters, numbers, ".", "-", "_" and "\/" are allowed/i,
    );
    expect(container.calls).toHaveLength(0);
  });
});
