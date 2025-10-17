import { describe, it, expect } from 'vitest';
import { SendSlackMessageToolStaticConfigSchema } from '../src/nodes/tools/send-slack-message-tool.node';
import { SlackTriggerStaticConfigSchema } from '../src/triggers/slack.trigger';

describe('Slack static config schemas', () => {
  it('SendSlackMessageToolStaticConfigSchema: accepts xoxb- tokens or reference field', () => {
    expect(() => SendSlackMessageToolStaticConfigSchema.parse({ bot_token: 'xoxb-123', default_channel: 'C1' })).not.toThrow();
    expect(() => SendSlackMessageToolStaticConfigSchema.parse({ bot_token: { value: 'xoxb-abc', source: 'static' } })).not.toThrow();
    // vault ref is allowed syntactically; deeper validation occurs in configure
    expect(() => SendSlackMessageToolStaticConfigSchema.parse({ bot_token: { value: 'secret/path/KEY', source: 'vault' } })).not.toThrow();
  });

  it('SlackTriggerStaticConfigSchema: accepts xapp- tokens or reference field', () => {
    expect(() => SlackTriggerStaticConfigSchema.parse({ app_token: 'xapp-abc' })).not.toThrow();
    expect(() => SlackTriggerStaticConfigSchema.parse({ app_token: { value: 'xapp-abc', source: 'static' } })).not.toThrow();
    expect(() => SlackTriggerStaticConfigSchema.parse({ app_token: { value: 'secret/path/KEY', source: 'vault' } })).not.toThrow();
  });
});
