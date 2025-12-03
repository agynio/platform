import { describe, it, expect, vi } from 'vitest';
import { SendSlackMessageNode } from '../src/nodes/tools/send_slack_message/send_slack_message.node';
import { SendSlackMessageFunctionTool } from '../src/nodes/tools/send_slack_message/send_slack_message.tool';
import { createReferenceResolverStub } from './helpers/reference-resolver.stub';

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

describe('SendSlackMessageFunctionTool', () => {
  it('omits thread_ts for ephemeral responses', async () => {
    const { stub: referenceResolver } = createReferenceResolverStub();
    const node = new SendSlackMessageNode(referenceResolver);
    await node.setConfig({ bot_token: 'xoxb-bot' });
    const tool = new SendSlackMessageFunctionTool(node);
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
