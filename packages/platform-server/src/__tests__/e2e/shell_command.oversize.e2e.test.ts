import { describe, it, expect, vi } from 'vitest';
import { ToolsNode } from '../../lgnodes/tools.lgnode';
import { AIMessage } from '@langchain/core/messages';
import { ShellTool } from '../../nodes/tools/shell_command/shell_command.node';
import { LoggerService } from '../../core/services/logger.service';

describe('shell_command oversize output e2e (mocked putArchive)', () => {
  it('returns saved path message when output exceeds limit', async () => {
    const logger = new LoggerService();
    const tool = new ShellTool(undefined, logger);
    // Inject a fake container provider via getContainerForThread override
    (tool as any).getContainerForThread = async () => ({
      putArchive: vi.fn(async () => {}),
    });
    const node = new ToolsNode([tool as any]);
    // Build a command that would produce >50k output; here we bypass and directly simulate via tool.invoke hook
    // by monkey-patching tool.init to return a function producing large output.
    const large = 'A'.repeat(60_000);
    const origInit = tool.init.bind(tool);
    (tool as any).init = () => ({
      name: 'shell_command',
      description: '',
      schema: ({} as any),
      invoke: async () => large,
    });

    const ai = new AIMessage({ content: '', tool_calls: [{ id: '1', name: 'shell_command', args: { command: 'echo' } }] });
    const res = await node.action({ messages: [ai] } as any, { configurable: { thread_id: 't' } } as any);
    const msg = (res.messages?.items?.[0] as any).content as string;
    expect(msg.startsWith('Error: output is too long (60000 characters). The output has been saved to /tmp/')).toBe(true);
    expect(msg.endsWith('.txt')).toBe(true);
    // restore
    (tool as any).init = origInit;
  });
});

