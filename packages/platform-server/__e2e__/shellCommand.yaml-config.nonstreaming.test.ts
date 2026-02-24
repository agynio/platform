import { describe, it, expect } from 'vitest';
import { Signal } from '../src/signal';
import type { LLMContext } from '../src/llm/types';

import { createShellCommandTestHarness } from './shellCommand.yaml-config.testHarness';

const NON_STREAM_COMMAND = 'pnpm --filter @agyn/platform-server test';
const COMPARISON_COMMAND = 'yes X | head -c 188795';

const PNPM_SIM_OUTPUT = createRepeatedOutput('[pnpm] running test suite...', 6200);
const YES_SIM_OUTPUT = 'X'.repeat(188_795);

function createRepeatedOutput(line: string, count: number): string {
  return Array.from({ length: count }, (_, idx) => `${line} #${idx + 1}`).join('\n');
}

async function runNonStreamingScenario(label: string, command: string, simulatedOutput: string) {
  const harness = await createShellCommandTestHarness({
    execImplementation: async (receivedCommand, options) => {
      expect(receivedCommand).toBe(command);
      const chunkSize = 16384;
      for (let offset = 0; offset < simulatedOutput.length; offset += chunkSize) {
        const slice = simulatedOutput.slice(offset, offset + chunkSize);
        options?.onOutput?.('stdout', Buffer.from(slice));
      }
      return { stdout: '', stderr: '', exitCode: 0 };
    },
  });
  const { tool, shellNode, fakeHandle, archiveStub } = harness;

  try {
    const nodeConfig = (shellNode as unknown as { config?: { outputLimitChars?: unknown } }).config ?? {};
    console.log(`[${label}] node.config.outputLimitChars`, typeof nodeConfig.outputLimitChars, nodeConfig.outputLimitChars);
    const resolvedCfg = (tool as unknown as { getResolvedConfig?: () => { outputLimitChars: number } }).getResolvedConfig?.();
    if (resolvedCfg) {
      console.log(`[${label}] tool.getResolvedConfig.outputLimitChars`, typeof resolvedCfg.outputLimitChars, resolvedCfg.outputLimitChars);
    }

    console.log(`[${label}] simulated stdout length`, simulatedOutput.length);

    const ctx: LLMContext = {
      threadId: `${label}-thread`,
      runId: `${label}-run`,
      finishSignal: new Signal(),
      terminateSignal: new Signal(),
      callerAgent: { getAgentNodeId: () => `${label}-agent` },
    };

    const message = await tool.execute({ command }, ctx);

    console.log(`[${label}] message length`, message.length);
    console.log(`[${label}] message preview`, message.slice(0, 120));
    console.log(`[${label}] message saved indicator`, message.includes('It was saved on disk: /tmp/'));

    expect(message).toContain('Error: output length exceeds 50000 characters.');
    expect(message).toContain('It was saved on disk: /tmp/');
    expect(message).not.toContain('TOOL_OUTPUT_TOO_LARGE');

    const savedArchive = fakeHandle.lastArchive;
    expect(savedArchive?.path).toBe('/tmp');
    console.log(`[${label}] archive.savedPath`, savedArchive?.path);
    console.log(`[${label}] archive.bytes`, savedArchive?.data.length ?? 0);

    expect(archiveStub.createSingleFileTar).toHaveBeenCalled();
  } finally {
    await harness.cleanup();
  }
}

describe('ShellCommandTool YAML graph non-streaming spillover (FsGraphRepository)', () => {
  it('handles pnpm test output via direct execute', async () => {
    await runNonStreamingScenario('pnpm-nonstream', NON_STREAM_COMMAND, PNPM_SIM_OUTPUT);
  });

  it('handles yes command comparison via direct execute', async () => {
    await runNonStreamingScenario('yes-nonstream', COMPARISON_COMMAND, YES_SIM_OUTPUT);
  });
});
