import { describe, it, expect } from 'vitest';
import { SendSlackMessageToolStaticConfigSchema } from '../src/tools/send_slack_message.tool';
import { SlackTriggerStaticConfigSchema } from '../src/triggers/slack.trigger';

describe('Slack static config schemas', () => {
  it('SendSlackMessageToolStaticConfigSchema: accepts xoxb- tokens, rejects others', () => {
    expect(() => SendSlackMessageToolStaticConfigSchema.parse({ bot_token: 'xoxb-123', default_channel: 'C1' })).not.toThrow();
    expect(() => SendSlackMessageToolStaticConfigSchema.parse({ bot_token: 'xapp-123' })).toThrow();
    expect(() => SendSlackMessageToolStaticConfigSchema.parse({ bot_token: '' })).toThrow();
  });

  it('SlackTriggerStaticConfigSchema: accepts xapp- tokens, rejects others', () => {
    expect(() => SlackTriggerStaticConfigSchema.parse({ app_token: 'xapp-abc' })).not.toThrow();
    expect(() => SlackTriggerStaticConfigSchema.parse({ app_token: 'xoxb-abc' })).toThrow();
    expect(() => SlackTriggerStaticConfigSchema.parse({ app_token: '' })).toThrow();
  });
});

