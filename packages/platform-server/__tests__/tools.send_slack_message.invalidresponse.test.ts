import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SendSlackMessageNode } from '../src/nodes/tools/send_slack_message/send_slack_message.node';
import { SendSlackMessageFunctionTool } from '../src/nodes/tools/send_slack_message/send_slack_message.tool';
import { LoggerService } from '../src/core/services/logger.service';

const postMessageMock = vi.fn();
const postEphemeralMock = vi.fn();

vi.mock('@slack/web-api', () => {
  class WebClient {
    chat = {
      postMessage: (...args: unknown[]) => postMessageMock(...args),
      postEphemeral: (...args: unknown[]) => postEphemeralMock(...args),
    };
  }
  return { WebClient };
});

type VaultRef = import('../src/vault/vault.service').VaultRef;

const makeVault = () =>
  ({
    getSecret: vi.fn(async (_ref: VaultRef) => 'xoxb-token'),
  } satisfies Pick<import('../src/vault/vault.service').VaultService, 'getSecret'>) as import('../src/vault/vault.service').VaultService;

describe('SendSlackMessageFunctionTool invalid Slack responses', () => {
  beforeEach(() => {
    postMessageMock.mockReset();
    postEphemeralMock.mockReset();
  });

  it('returns slack_api_invalid_response when chat.postMessage resolves to undefined', async () => {
    postMessageMock.mockResolvedValueOnce(undefined);
    const vault = makeVault();
    const node = new SendSlackMessageNode(new LoggerService(), vault);
    await node.setConfig({ bot_token: { value: 'xoxb-token', source: 'static' } });
    const tool = new SendSlackMessageFunctionTool(node, new LoggerService(), vault);

    const res = await tool.execute({
      channel: 'C1',
      text: 'hello',
      thread_ts: '111.1',
      broadcast: false,
      ephemeral_user: null,
    });

    expect(JSON.parse(res)).toEqual({ ok: false, error: 'slack_api_invalid_response' });
  });

  it('returns slack_api_invalid_response when chat.postEphemeral responds with malformed payload', async () => {
    postEphemeralMock.mockResolvedValueOnce({ ok: false });
    const vault = makeVault();
    const node = new SendSlackMessageNode(new LoggerService(), vault);
    await node.setConfig({ bot_token: { value: 'xoxb-token', source: 'static' } });
    const tool = new SendSlackMessageFunctionTool(node, new LoggerService(), vault);

    const res = await tool.execute({
      channel: 'C1',
      text: 'hi there',
      thread_ts: '111.1',
      broadcast: false,
      ephemeral_user: 'U1',
    });

    expect(JSON.parse(res)).toEqual({ ok: false, error: 'slack_api_invalid_response' });
  });
});
