import { describe, it, expect } from 'vitest';
import { SendSlackMessageToolStaticConfigSchema } from '../src/graph/nodes/tools/send_slack_message/send_slack_message.tool';
import { SlackTriggerStaticConfigSchema } from '../src/graph/nodes/slackTrigger/slackTrigger.node';

describe('Slack static config schemas', () => {
  it('SendSlackMessageToolStaticConfigSchema: accepts xoxb- tokens or reference field', () => {
    expect(() => SendSlackMessageToolStaticConfigSchema.parse({ bot_token: 'xoxb-123' })).not.toThrow();
    expect(() => SendSlackMessageToolStaticConfigSchema.parse({ bot_token: { value: 'xoxb-abc', source: 'static' } })).not.toThrow();
    // vault ref is allowed syntactically; deeper validation occurs in setConfig
    expect(() => SendSlackMessageToolStaticConfigSchema.parse({ bot_token: { value: 'secret/path/KEY', source: 'vault' } })).not.toThrow();
  });

  it('SlackTriggerStaticConfigSchema: accepts reference field only', () => {
    expect(() => SlackTriggerStaticConfigSchema.parse({ app_token: { value: 'xapp-abc', source: 'static' } })).not.toThrow();
    expect(() => SlackTriggerStaticConfigSchema.parse({ app_token: { value: 'secret/path/KEY', source: 'vault' } })).not.toThrow();
  });
});
