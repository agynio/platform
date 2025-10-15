# Slack integration migration (Issue #144, #162)

Summary
- Global SLACK_* env and SlackService were removed.
- Slack is now configured per node via static config on each node.

Nodes
- SlackTrigger: static config
  - app_token now supports a vault-backed reference via ReferenceField
  - Internal schema accepts union: string | { value, source? }
  - Exposed UI schema always renders ReferenceField with help text
  - Examples:
    - Literal: { app_token: 'xapp-...' }
    - Vault: { app_token: { source: 'vault', value: 'secret/slack/APP_TOKEN' } }
  - app_token must start with xapp- when literal or when resolved from Vault.
- SendSlackMessageTool: static config
  - bot_token now supports ReferenceField (string | { value, source? })
  - default_channel unchanged
  - Examples:
    - Literal: { bot_token: 'xoxb-...', default_channel: 'C...' }
    - Vault: { bot_token: { source: 'vault', value: 'secret/slack/BOT_TOKEN' }, default_channel: 'C...' }
  - bot_token must start with xoxb- when literal or when resolved from Vault.

Behavioral notes
- SlackTrigger filters only human message events (ignores bot messages and message subtypes) and relays them to subscribers.
- SendSlackMessageTool supports posting to channels, thread replies (thread_ts), reply_broadcast, and ephemeral messages (ephemeral_user).

Migration
- Remove SLACK_APP_TOKEN and SLACK_BOT_TOKEN from any .env files; they are no longer read globally.
- When creating nodes via the templates API/UI, supply staticConfig using the new ReferenceField:
  - SlackTrigger: { app_token: 'xapp-...' } or { app_token: { source: 'vault', value: 'mount/path/key' } }
  - SendSlackMessageTool: { bot_token: 'xoxb-...' } or { bot_token: { source: 'vault', value: 'mount/path/key' }, default_channel?: 'C...' }
  - Backward compatibility: literal strings for tokens continue to work.

Security
- Tokens are not logged. Do not include tokens in logs or error messages.
- When a vault reference is provided but Vault is disabled, configuration fails fast with a clear error.
