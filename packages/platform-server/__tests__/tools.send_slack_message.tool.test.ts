import { describe, it, expect, vi } from 'vitest';
import { SendSlackMessageNode } from '../src/graph/nodes/tools/send_slack_message/send_slack_message.node';
import { SendSlackMessageFunctionTool } from '../src/graph/nodes/tools/send_slack_message/send_slack_message.tool';
import { LoggerService } from '../src/core/services/logger.service';

vi.mock('@slack/web-api', () => {
  const postEphemeral = vi.fn(async (_opts: { channel: string; user: string; text: string }) => ({ ok: true, message_ts: '999' }));
  const postMessage = vi.fn(async (_opts: { channel: string; text: string; thread_ts?: string }) => ({ ok: true, channel: 'C', ts: '101', message: { thread_ts: _opts.thread_ts ?? '101' } }));
  class WebClient {
    chat = { postEphemeral, postMessage };
    static __getMocks() {
      return { postEphemeral, postMessage };
    }
  }
  return { WebClient };
});

type VaultRef = import('../src/vault/vault.service').VaultRef;

describe('SendSlackMessageFunctionTool', () => {
  const makeVault = () =>
    ({
      getSecret: vi.fn(async (_ref: VaultRef) => 'xoxb-bot'),
    } satisfies Pick<import('../src/vault/vault.service').VaultService, 'getSecret'>) as import('../src/vault/vault.service').VaultService;

  it('omits thread_ts for ephemeral responses', async () => {
    const vault = makeVault();
    const node = new SendSlackMessageNode(new LoggerService(), vault);
    await node.setConfig({ bot_token: { value: 'xoxb-bot', source: 'static' } });
    const tool = new SendSlackMessageFunctionTool(node, new LoggerService(), vault);
    const res = await tool.execute({
      channel: 'C1',
      text: 'ephemeral',
      thread_ts: '1234.5',
      broadcast: null,
      ephemeral_user: 'U1',
    });
    const payload = JSON.parse(res);
    expect(payload).toEqual({ ok: true, channel: 'C1', message_ts: '999', ephemeral: true });
    const { WebClient } = await import('@slack/web-api');
    const { postEphemeral } = (WebClient as any).__getMocks();
    expect(postEphemeral).toHaveBeenCalledWith({ channel: 'C1', user: 'U1', text: 'ephemeral' });
  });
});
