import { describe, it, expect, vi } from 'vitest';
// Use dynamic imports with module mocks to avoid Prisma dependency during unit tests

// Mock persistence service to avoid prisma module load
vi.mock('../src/agents/agents.persistence.service', () => ({ AgentsPersistenceService: class {} }));

describe('Slack static config schemas', () => {
  it('SendSlackMessageToolStaticConfigSchema: accepts xoxb- tokens or reference field', async () => {
    const { SendSlackMessageToolStaticConfigSchema } = await import('../src/nodes/tools/send_slack_message/send_slack_message.tool');
    expect(() => SendSlackMessageToolStaticConfigSchema.parse({ bot_token: 'xoxb-123' })).not.toThrow();
    expect(() => SendSlackMessageToolStaticConfigSchema.parse({ bot_token: { value: 'xoxb-abc', source: 'static' } })).not.toThrow();
    // vault ref is allowed syntactically; deeper validation occurs in setConfig
    expect(() => SendSlackMessageToolStaticConfigSchema.parse({ bot_token: { value: 'secret/path/KEY', source: 'vault' } })).not.toThrow();
  }, 15000);

  it('SlackTriggerStaticConfigSchema: requires app_token and bot_token reference fields', async () => {
    const { SlackTriggerStaticConfigSchema } = await import('../src/nodes/slackTrigger/slackTrigger.node');
    expect(() => SlackTriggerStaticConfigSchema.parse({ app_token: { value: 'xapp-abc', source: 'static' }, bot_token: { value: 'xoxb-abc', source: 'static' } })).not.toThrow();
    expect(() => SlackTriggerStaticConfigSchema.parse({ app_token: { value: 'secret/path/APP', source: 'vault' }, bot_token: { value: 'secret/path/BOT', source: 'vault' } })).not.toThrow();
  }, 15000);
});
