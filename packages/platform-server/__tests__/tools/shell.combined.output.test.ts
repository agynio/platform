import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EnvService } from '../../src/env/env.service';
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
  const moduleRefStub = {};
  const archiveStub = { createSingleFileTar: vi.fn(async () => Buffer.from('tar')) } as const;
  const runEvents = {
    appendToolOutputChunk: vi.fn(async (payload) => payload),
    finalizeToolOutputTerminal: vi.fn(async (payload) => payload),
  };
  const eventsBus = {
    emitToolOutputChunk: vi.fn(),
    emitToolOutputTerminal: vi.fn(),
  };
  const prismaStub = {
    getClient: vi.fn(() => ({
      container: {
        findUnique: vi.fn(async () => null),
      },
      containerEvent: {
        findFirst: vi.fn(async () => null),
      },
    })),
  };
  const node = new ShellCommandNode(
    envService as any,
    moduleRefStub as any,
    archiveStub as any,
    runEvents as any,
    eventsBus as any,
    prismaStub as any,
  );
  node.setContainerProvider({
    provide: async () => container,
  } as any);

  return { tool: node.getTool(), runEvents, node, eventsBus, prismaStub };
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
    const { tool, runEvents } = createToolWithContainer(container);

    const result = await tool.executeStreaming({ command: 'mixed' }, ctx as any, streamingOptions);

    expect(result).toBe('alpha\nbeta\ngamma\n');
    expect(runEvents.finalizeToolOutputTerminal).toHaveBeenCalledTimes(1);
    const terminalArgs = runEvents.finalizeToolOutputTerminal.mock.calls[0][0];
    expect(terminalArgs).toMatchObject({ status: 'success', exitCode: 0 });
    expect(terminalArgs.bytesStdout).toBe(Buffer.byteLength('alpha\ngamma\n', 'utf8'));
    expect(terminalArgs.bytesStderr).toBe(Buffer.byteLength('beta\n', 'utf8'));
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

  it('executeStreaming throws with exit code and tail for stderr-only failure', async () => {
    const chunks: OutputChunk[] = [{ source: 'stderr', data: 'fatal: repo not found\n' }];
    const container = new SequenceContainer(chunks, 128);
    const { tool, runEvents } = createToolWithContainer(container);

    let error: Error | null = null;
    try {
      await tool.executeStreaming({ command: 'failing' }, ctx as any, streamingOptions);
    } catch (err) {
      error = err as Error;
    }

    expect(error).toBeInstanceOf(Error);
    const message = (error as Error).message;
    expect(message).toMatch(/\[exit code 128]/);
    expect(message).toContain('fatal: repo not found');

    expect(runEvents.finalizeToolOutputTerminal).toHaveBeenCalledTimes(1);
    const terminalArgs = runEvents.finalizeToolOutputTerminal.mock.calls[0][0];
    expect(terminalArgs).toMatchObject({ status: 'error', exitCode: 128, bytesStdout: 0 });
    expect(terminalArgs.bytesStderr).toBe(Buffer.byteLength('fatal: repo not found\n', 'utf8'));
  });

  it('execute throws with exit code and tail when command fails', async () => {
    const chunks: OutputChunk[] = [
      { source: 'stdout', data: 'starting\n' },
      { source: 'stderr', data: 'boom\n' },
    ];
    const container = new SequenceContainer(chunks, 2);
    const { tool } = createToolWithContainer(container);

    let error: Error | null = null;
    try {
      await tool.execute({ command: 'fail' }, ctx as any);
    } catch (err) {
      error = err as Error;
    }

    expect(error).toBeInstanceOf(Error);
    const message = (error as Error).message;
    expect(message).toMatch(/\[exit code 2]/);
    expect(message).toContain('starting');
    expect(message).toContain('boom');
  });

  it('execute throws exit-coded error with full output when under limit', async () => {
    const chunks: OutputChunk[] = [
      { source: 'stdout', data: 'alpha\n' },
      { source: 'stderr', data: 'omega\n' },
    ];
    const container = new SequenceContainer(chunks, 7);
    const { tool } = createToolWithContainer(container);

    let error: Error | null = null;
    try {
      await tool.execute({ command: 'fails' }, ctx as any);
    } catch (err) {
      error = err as Error;
    }

    expect(error).toBeInstanceOf(Error);
    const message = (error as Error).message;
    expect(message.split('\n')[0]).toBe('[exit code 7]');
    expect(message).toContain('alpha');
    expect(message).toContain('omega');
  });

  it('executeStreaming throws and references saved output when failure exceeds limit', async () => {
    const largeOutput = Array.from({ length: 30 }, (_, idx) => `line-${idx}`).join('\n');
    const container = new SequenceContainer([{ source: 'stdout', data: largeOutput }], 3);
    const { tool, runEvents, node } = createToolWithContainer(container);
    await node.setConfig({ outputLimitChars: 20 } as any);

    let error: Error | null = null;
    try {
      await tool.executeStreaming({ command: 'huge' }, ctx as any, streamingOptions);
    } catch (err) {
      error = err as Error;
    }

    expect(error).toBeInstanceOf(Error);
    const message = (error as Error).message;
    expect(message.split('\n')[0]).toBe('[exit code 3]');
    expect(message).toContain('Full output saved to:');

    expect(runEvents.finalizeToolOutputTerminal).toHaveBeenCalledTimes(1);
    const terminalArgs = runEvents.finalizeToolOutputTerminal.mock.calls[0][0];
    expect(terminalArgs.status).toBe('error');
    expect(typeof terminalArgs.savedPath).toBe('string');
    const savedPath = terminalArgs.savedPath as string | null;
    expect(savedPath).not.toBeNull();
    if (savedPath) {
      expect(message).toContain(savedPath);
    }
    expect(terminalArgs.message).toContain('Full output saved to');
  });

  it('executeStreaming throws and includes 10k tail when oversized output is truncated', async () => {
    const prefix = 'H'.repeat(2000);
    const tailSegment = 'T'.repeat(10_000);
    const combinedOutput = `${prefix}${tailSegment}`;
    const container = new SequenceContainer([{ source: 'stderr', data: combinedOutput }], 9);
    const { tool, runEvents, node } = createToolWithContainer(container);
    await node.setConfig({ outputLimitChars: 1000 } as any);

    let error: Error | null = null;
    try {
      await tool.executeStreaming({ command: 'fail-large' }, ctx as any, streamingOptions);
    } catch (err) {
      error = err as Error;
    }

    expect(error).toBeInstanceOf(Error);
    const message = (error as Error).message;
    expect(message).toMatch(/\[exit code 9]/);
    expect(message).toMatch(/Full output saved to \/tmp\/.+\.txt/);
    expect(message.toLowerCase()).toContain('output tail');
    const tailMatch = message.match(/--- output tail ---\n([\s\S]+)$/);
    expect(tailMatch).not.toBeNull();
    expect(tailMatch?.[1].length).toBe(10_000);
    expect(tailMatch?.[1]).toBe(tailSegment);

    expect(runEvents.finalizeToolOutputTerminal).toHaveBeenCalledTimes(1);
    const terminalArgs = runEvents.finalizeToolOutputTerminal.mock.calls[0][0];
    expect(terminalArgs).toMatchObject({ status: 'error', exitCode: 9 });
    expect(typeof terminalArgs.savedPath).toBe('string');
    expect(terminalArgs.savedPath).toMatch(/^\/tmp\/.+\.txt$/);
    expect(typeof terminalArgs.message).toBe('string');
    expect(terminalArgs.message).toContain('Output truncated');
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
