import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EnvService } from '../../src/env/env.service';
import { LoggerService } from '../../src/core/services/logger.service';
import { ShellCommandNode } from '../../src/nodes/tools/shell_command/shell_command.node';
import type { ContainerHandle } from '../../src/infra/container/container.handle';

type OutputChunk = { source: 'stdout' | 'stderr'; data: string };

class SequenceContainer implements ContainerHandle {
  constructor(private readonly chunks: OutputChunk[], private readonly exitCode = 0) {}

  async exec(
    _command: string,
    options?: { onOutput?: (source: 'stdout' | 'stderr', chunk: Buffer) => void },
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const stdoutParts: string[] = [];
    const stderrParts: string[] = [];
    for (const chunk of this.chunks) {
      if (chunk.source === 'stdout') stdoutParts.push(chunk.data);
      else stderrParts.push(chunk.data);
      options?.onOutput?.(chunk.source, Buffer.from(chunk.data, 'utf8'));
    }
    return { stdout: stdoutParts.join(''), stderr: stderrParts.join(''), exitCode: this.exitCode };
  }

  async putArchive(): Promise<void> {}

  async stop(_timeoutSec?: number): Promise<void> {}

  async remove(_force?: boolean): Promise<void> {}
}

function createToolWithContainer(container: ContainerHandle) {
  const vaultStub = { getSecret: async () => '' } as const;
  const envService = new EnvService(vaultStub as any);
  const logger = new LoggerService();
  const archiveStub = { createSingleFileTar: async () => Buffer.from('tar') } as const;
  const runEvents = {
    appendToolOutputChunk: vi.fn(async (payload) => payload),
    finalizeToolOutputTerminal: vi.fn(async (payload) => payload),
  };
  const node = new ShellCommandNode(envService as any, logger as any, {} as any, archiveStub as any, runEvents as any);
  node.setContainerProvider({
    provide: async () => container,
  } as any);

  return { tool: node.getTool(), runEvents };
}

const ctx = {
  threadId: 'thread-1',
  finishSignal: { activate() {}, deactivate() {}, isActive: false },
  callerAgent: {},
} as const;

const streamingOptions = {
  runId: 'run-1',
  threadId: 'thread-1',
  eventId: 'event-1',
};

const CSI_GREEN = '\x1b[32m';
const CSI_RESET = '\x1b[0m';
const OSC_LINK_PREFIX = '\x1b]8;;https://example.com';
const OSC_LINK_SUFFIX = '\x1b]8;;';
const OSC_ST = '\x1b\\';

describe('ShellCommandTool combined output', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('execute returns combined stdout and stderr in order', async () => {
    const chunks: OutputChunk[] = [
      { source: 'stdout', data: 'start\n' },
      { source: 'stderr', data: 'warn\n' },
      { source: 'stdout', data: 'done\n' },
    ];
    const container = new SequenceContainer(chunks);
    const { tool } = createToolWithContainer(container);

    const result = await tool.execute({ command: 'mixed' }, ctx as any);

    expect(result).toBe('start\nwarn\ndone\n');
  });

  it('returns stdout-only output unchanged', async () => {
    const container = new SequenceContainer([{ source: 'stdout', data: 'hello stdout' }]);
    const { tool, runEvents } = createToolWithContainer(container);

    const result = await tool.executeStreaming({ command: 'test' }, ctx as any, streamingOptions);

    expect(result).toBe('hello stdout');
    expect(runEvents.appendToolOutputChunk).toHaveBeenCalledTimes(1);
    expect(runEvents.appendToolOutputChunk.mock.calls[0][0]?.data).toBe('hello stdout');
  });

  it('returns stderr-only output when exit code is zero', async () => {
    const container = new SequenceContainer([{ source: 'stderr', data: 'git warning' }]);
    const { tool, runEvents } = createToolWithContainer(container);

    const result = await tool.executeStreaming({ command: 'git checkout' }, ctx as any, streamingOptions);

    expect(result).toBe('git warning');
    expect(runEvents.finalizeToolOutputTerminal).toHaveBeenCalledTimes(1);
    const terminalArgs = runEvents.finalizeToolOutputTerminal.mock.calls[0][0];
    expect(terminalArgs).toMatchObject({
      status: 'success',
      bytesStdout: 0,
      bytesStderr: Buffer.byteLength('git warning', 'utf8'),
    });
  });

  it('preserves stdout and stderr ordering in combined streaming output', async () => {
    const chunks: OutputChunk[] = [
      { source: 'stdout', data: 'alpha\n' },
      { source: 'stderr', data: 'beta\n' },
      { source: 'stdout', data: 'gamma\n' },
    ];
    const container = new SequenceContainer(chunks);
    const { tool } = createToolWithContainer(container);

    const result = await tool.executeStreaming({ command: 'mixed' }, ctx as any, streamingOptions);

    expect(result).toBe('alpha\nbeta\ngamma\n');
  });

  it('removes CSI sequences that span chunk boundaries (streaming)', async () => {
    const chunks: OutputChunk[] = [
      { source: 'stdout', data: 'color: ' },
      { source: 'stdout', data: '\x1b[' },
      { source: 'stdout', data: '31mred' },
      { source: 'stdout', data: `${CSI_RESET}\n` },
    ];
    const container = new SequenceContainer(chunks);
    const { tool } = createToolWithContainer(container);

    const result = await tool.executeStreaming({ command: 'ansi' }, ctx as any, streamingOptions);

    expect(result).toBe('color: red\n');
    expect(result).not.toContain('\x1b');
  });

  it('removes OSC sequences that span chunk boundaries (streaming)', async () => {
    const chunks: OutputChunk[] = [
      { source: 'stderr', data: 'launch ' },
      { source: 'stderr', data: '\x1b]' },
      { source: 'stderr', data: '0;My Title' },
      { source: 'stderr', data: '\x07' },
      { source: 'stderr', data: 'done\n' },
    ];
    const container = new SequenceContainer(chunks);
    const { tool } = createToolWithContainer(container);

    const result = await tool.executeStreaming({ command: 'osc' }, ctx as any, streamingOptions);

    expect(result).toBe('launch done\n');
    expect(result).not.toContain('\x1b');
  });

  it('drops trailing incomplete escape fragments in streaming mode', async () => {
    const chunks: OutputChunk[] = [
      { source: 'stdout', data: 'output line\n' },
      { source: 'stdout', data: '\x1b[' },
    ];
    const container = new SequenceContainer(chunks);
    const { tool } = createToolWithContainer(container);

    const result = await tool.executeStreaming({ command: 'partial' }, ctx as any, streamingOptions);

    expect(result).toBe('output line\n');
    expect(result).not.toContain('\x1b');
  });

  it('returns combined output even when exit code is non-zero', async () => {
    const chunks: OutputChunk[] = [
      { source: 'stdout', data: 'run started\n' },
      { source: 'stderr', data: 'failure details\n' },
    ];
    const container = new SequenceContainer(chunks, 2);
    const { tool, runEvents } = createToolWithContainer(container);

    const result = await tool.executeStreaming({ command: 'failing' }, ctx as any, streamingOptions);

    expect(result).toBe('run started\nfailure details\n');
    expect(runEvents.finalizeToolOutputTerminal).toHaveBeenCalledTimes(1);
    expect(runEvents.finalizeToolOutputTerminal.mock.calls[0][0]).toMatchObject({ status: 'error', exitCode: 2 });
  });

  it('removes CSI sequences split across chunks in non-streaming execute', async () => {
    const chunks: OutputChunk[] = [
      { source: 'stdout', data: 'deploy ' },
      { source: 'stdout', data: `${CSI_GREEN}` },
      { source: 'stdout', data: 'ok' },
      { source: 'stdout', data: `${CSI_RESET}\n` },
    ];
    const container = new SequenceContainer(chunks);
    const { tool } = createToolWithContainer(container);

    const result = await tool.execute({ command: 'ansi' }, ctx as any);

    expect(result).toBe('deploy ok\n');
    expect(result).not.toContain('\x1b');
  });

  it('removes OSC hyperlinks split across chunks in non-streaming execute', async () => {
    const chunks: OutputChunk[] = [
      { source: 'stderr', data: 'visit ' },
      { source: 'stderr', data: `${OSC_LINK_PREFIX}` },
      { source: 'stderr', data: `${OSC_ST}docs` },
      { source: 'stderr', data: `${OSC_LINK_SUFFIX}${OSC_ST}\n` },
    ];
    const container = new SequenceContainer(chunks);
    const { tool } = createToolWithContainer(container);

    const result = await tool.execute({ command: 'osc' }, ctx as any);

    expect(result).toBe('visit docs\n');
    expect(result).not.toContain('\x1b');
  });

  it('drops trailing incomplete ANSI fragments in non-streaming execute', async () => {
    const chunks: OutputChunk[] = [
      { source: 'stdout', data: 'logs\n' },
      { source: 'stdout', data: '\x1b[' },
    ];
    const container = new SequenceContainer(chunks);
    const { tool } = createToolWithContainer(container);

    const result = await tool.execute({ command: 'partial' }, ctx as any);

    expect(result).toBe('logs\n');
    expect(result).not.toContain('\x1b');
  });
});
