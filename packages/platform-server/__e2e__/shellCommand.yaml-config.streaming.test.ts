import { describe, it, expect } from 'vitest';
import { ToolCallMessage, ResponseMessage, ToolCallOutputMessage } from '@agyn/llm';
import { CallToolsLLMReducer } from '../src/llm/reducers/callTools.llm.reducer';
import type { LLMContext, LLMState } from '../src/llm/types';
import { Signal } from '../src/signal';

import { createShellCommandTestHarness } from './shellCommand.yaml-config.testHarness';

const STREAM_COMMAND = 'pnpm --filter @agyn/platform-server test';
const COMPARISON_COMMAND = 'yes X | head -c 188795';

const PNPM_SIM_OUTPUT = createRepeatedOutput('[pnpm] running test suite...', 6200);
const YES_SIM_OUTPUT = 'X'.repeat(188_795);

function createRepeatedOutput(line: string, count: number): string {
  return Array.from({ length: count }, (_, idx) => `${line} #${idx + 1}`).join('\n');
}

async function runStreamingScenario(label: string, command: string, simulatedOutput: string) {
  let chunkCount = 0;
  const harness = await createShellCommandTestHarness({
    execImplementation: async (receivedCommand, options) => {
      expect(receivedCommand).toBe(command);
      const chunkSize = 8192;
      for (let offset = 0; offset < simulatedOutput.length; offset += chunkSize) {
        const slice = simulatedOutput.slice(offset, offset + chunkSize);
        options?.onOutput?.('stdout', Buffer.from(slice));
        chunkCount += 1;
      }
      return { stdout: '', stderr: '', exitCode: 0 };
    },
  });
  const { tool, runEvents, eventsBus, finalizeToolOutputTerminal, shellNode, appendToolOutputChunk } = harness;

  try {
    const reducer = new CallToolsLLMReducer(runEvents, eventsBus).init({ tools: [tool] });

    const callMessage = new ToolCallMessage({
      type: 'function_call',
      call_id: `${label}-call`,
      name: tool.name,
      arguments: JSON.stringify({ command }),
    } as any);

    const response = new ResponseMessage({ output: [callMessage.toPlain() as any] } as any);
    const state: LLMState = {
      messages: [response],
      context: { messageIds: [], memory: [] },
      meta: { lastLLMEventId: `${label}-evt` },
    };

    const ctx: LLMContext = {
      threadId: `${label}-thread`,
      runId: `${label}-run`,
      finishSignal: new Signal(),
      terminateSignal: new Signal(),
      callerAgent: { getAgentNodeId: () => `${label}-agent` },
    };

    const nodeConfig = (shellNode as unknown as { config?: { outputLimitChars?: unknown } }).config ?? {};
    console.log(`[${label}] node.config.outputLimitChars`, typeof nodeConfig.outputLimitChars, nodeConfig.outputLimitChars);
    const resolvedCfg = (tool as unknown as { getResolvedConfig?: () => { outputLimitChars: number } }).getResolvedConfig?.();
    if (resolvedCfg) {
      console.log(`[${label}] tool.getResolvedConfig.outputLimitChars`, typeof resolvedCfg.outputLimitChars, resolvedCfg.outputLimitChars);
    }

    console.log(`[${label}] simulated stdout length`, simulatedOutput.length);

    const result = await reducer.invoke(state, ctx);

    const message = result.messages.at(-1) as ToolCallOutputMessage;
    expect(message).toBeInstanceOf(ToolCallOutputMessage);
    expect(message.text).toContain('Full output saved to /tmp/');
    expect(message.text).toContain('Output truncated after 50000 characters.');
    expect(message.text).not.toContain('TOOL_OUTPUT_TOO_LARGE');

    console.log(`[${label}] message length`, message.text.length);
    console.log(`[${label}] message preview`, message.text.slice(0, 120));

    expect(finalizeToolOutputTerminal).toHaveBeenCalledTimes(1);
    const [terminalPayload] = finalizeToolOutputTerminal.mock.calls[0] as [{ savedPath: string | null; message: string }];
    console.log(`[${label}] finalize.savedPath`, terminalPayload.savedPath);
    console.log(`[${label}] finalize.message truncated?`, terminalPayload.message.includes('Output truncated'));

    expect(terminalPayload.savedPath).toMatch(/^\/tmp\/[0-9a-f-]{36}\.txt$/i);
    expect(terminalPayload.message).toContain('Full output saved to');

    expect(appendToolOutputChunk).toHaveBeenCalled();
    console.log(`[${label}] appendToolOutputChunk calls`, appendToolOutputChunk.mock.calls.length);
    console.log(`[${label}] emitted chunk count`, chunkCount);
  } finally {
    await harness.cleanup();
  }
}

describe('ShellCommandTool YAML graph streaming spillover (FsGraphRepository)', () => {
  it('handles pnpm test output via streaming reducer path', async () => {
    await runStreamingScenario('pnpm-streaming', STREAM_COMMAND, PNPM_SIM_OUTPUT);
  });

  it('handles yes command comparison via streaming reducer path', async () => {
    await runStreamingScenario('yes-streaming', COMPARISON_COMMAND, YES_SIM_OUTPUT);
  });
});
