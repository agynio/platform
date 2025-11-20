import { describe, it, expect, vi } from 'vitest';
// Use dynamic imports with module mocks to avoid Prisma dependency during unit tests

// Mock persistence service to avoid prisma module load
vi.mock('../src/agents/agents.persistence.service', () => ({ AgentsPersistenceService: class {} }));

describe('Slack static config schemas', () => {
  it('SendSlackMessageToolStaticConfigSchema: accepts xoxb- tokens or reference field', async () => {
    const { SendSlackMessageToolStaticConfigSchema } = await import('../src/nodes/tools/send_slack_message/send_slack_message.tool');
    expect(() => SendSlackMessageToolStaticConfigSchema.parse({ bot_token: 'xoxb-123' })).not.toThrow();
    expect(() =>
      SendSlackMessageToolStaticConfigSchema.parse({
        bot_token: { kind: 'vault', path: 'secret/path', key: 'BOT' },
      }),
    ).not.toThrow();
    expect(() => SendSlackMessageToolStaticConfigSchema.parse({ bot_token: { kind: 'var', name: 'SLACK_BOT_TOKEN' } })).not.toThrow();
  }, 15000);

  it('SlackTriggerStaticConfigSchema: requires app_token and bot_token reference fields', async () => {
    const { SlackTriggerStaticConfigSchema } = await import('../src/nodes/slackTrigger/slackTrigger.node');
    expect(() => SlackTriggerStaticConfigSchema.parse({ app_token: 'xapp-abc', bot_token: 'xoxb-abc' })).not.toThrow();
    expect(() =>
      SlackTriggerStaticConfigSchema.parse({
        app_token: { kind: 'vault', path: 'secret/path', key: 'APP' },
        bot_token: { kind: 'vault', path: 'secret/path', key: 'BOT' },
      }),
    ).not.toThrow();
    expect(() =>
      SlackTriggerStaticConfigSchema.parse({
        app_token: { kind: 'var', name: 'SLACK_APP' },
        bot_token: { kind: 'var', name: 'SLACK_BOT' },
      }),
    ).not.toThrow();
  }, 15000);
});
