import { describe, it, expect, vi } from 'vitest';
import { ShellCommandTool } from '../../src/nodes/tools/shell_command/shell_command.tool';
import { ExecIdleTimeoutError, ExecTimeoutError } from '../../src/utils/execTimeout';
import type { RunEventsService } from '../../src/events/run-events.service';
import type { EventsBusService } from '../../src/events/events-bus.service';
import type { PrismaService } from '../../src/core/services/prisma.service';
import type { ContainerHandle } from '@agyn/docker-runner';

const baseCtx = {
  threadId: 'thread-error-tests',
  finishSignal: { activate() {}, deactivate() {}, isActive: false },
  callerAgent: {},
} as const;

const createTool = (containerImpl: ContainerHandle) => {
  const archive = { createSingleFileTar: vi.fn(async () => Buffer.from('tarball')) };
  const runEvents = {
    appendToolOutputChunk: vi.fn(),
    finalizeToolOutputTerminal: vi.fn(),
  } as unknown as RunEventsService;
  const eventsBus = {
    emitToolOutputChunk: vi.fn(),
    emitToolOutputTerminal: vi.fn(),
  } as unknown as EventsBusService;
  const prisma = {
    getClient: vi.fn(() => ({
      container: { findUnique: vi.fn(async () => null) },
      containerEvent: { findFirst: vi.fn(async () => null) },
    })),
  } as unknown as PrismaService;

  const tool = new ShellCommandTool(archive as any, runEvents, eventsBus, prisma);
  (tool as any).logger = { log: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn(), info: vi.fn() };
  const nodeStub = {
    config: {},
    provider: { provide: async () => containerImpl },
    resolveEnv: async () => ({} as Record<string, string>),
  };
  tool.init(nodeStub as any);
  return { tool, archive };
};

describe('ShellCommandTool.execute plain-text error formatting', () => {
  it('returns idle timeout message with combined stdout+stderr tail', async () => {
    const container = {
      async exec() {
        throw new ExecIdleTimeoutError(7000, 'stdout chunk\n', 'stderr chunk\n');
      },
      async putArchive() {
        return;
      },
    } as unknown as ContainerHandle;

    const { tool } = createTool(container);
    const result = await tool.execute({ command: 'sleep' } as any, baseCtx as any);
    expect(result).toBe('[exit code 408] Exec idle timed out after 7000ms\n---\nstdout chunk\nstderr chunk\n');
  });

  it('returns wall-clock timeout message with combined output tail', async () => {
    const container = {
      async exec() {
        throw new ExecTimeoutError(5000, 'partial stdout\n', 'partial stderr\n');
      },
      async putArchive() {
        return;
      },
    } as unknown as ContainerHandle;

    const { tool } = createTool(container);
    const result = await tool.execute({ command: 'long' } as any, baseCtx as any);
    expect(result).toBe('[exit code 408] Exec timed out after 5000ms\n---\npartial stdout\npartial stderr\n');
  });

  it('wraps generic failures with exit code 500 and output tail', async () => {
    const container = {
      async exec(_cmd: string, opts?: { onOutput?: (source: string, chunk: Buffer) => void }) {
        opts?.onOutput?.('stdout', Buffer.from('trace line\n'));
        throw new Error('fatal: permission denied');
      },
      async putArchive() {
        return;
      },
    } as unknown as ContainerHandle;

    const { tool } = createTool(container);
    const result = await tool.execute({ command: 'ls' } as any, baseCtx as any);
    expect(result).toBe('[exit code 500] fatal: permission denied\n---\ntrace line\n');
  });
});

describe('ShellCommandTool.formatExitCodeErrorMessage plain-text payload', () => {
  it('persists oversized output and returns tail snippet without path hints', async () => {
    const container = {
      async exec() {
        throw new Error('unused');
      },
      async putArchive() {
        return;
      },
    } as unknown as ContainerHandle;

    const { tool, archive } = createTool(container);
    const combined = 'X'.repeat(1500);
    const result = await (tool as unknown as {
      formatExitCodeErrorMessage(params: {
        exitCode: number;
        combinedOutput: string;
        limit: number;
        container: ContainerHandle;
      }): Promise<{ message: string; savedPath: string | null }>;
    }).formatExitCodeErrorMessage({ exitCode: 9, combinedOutput: combined, limit: 1000, container });

    expect(result.message).toBe(`[exit code 9] Process exited with code 9\n---\n${combined.slice(-1000)}`);
    expect(archive.createSingleFileTar).toHaveBeenCalledTimes(1);
    expect(result.savedPath).toMatch(/^\/tmp\//);
    expect(result.message).not.toContain('Full output saved to');
  });
});
