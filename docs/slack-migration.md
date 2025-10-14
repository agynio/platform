# Slack integration migration (Issue #144)

Summary
- Global SLACK_* env and SlackService were removed.
- Slack is now configured per node via static config on each node.

Nodes
- SlackTrigger: static config
  - { app_token: 'xapp-...' }
  - app_token is required and must start with xapp- (Socket Mode token).
- SendSlackMessageTool: static config
  - { bot_token: 'xoxb-...', default_channel?: 'C...' }
  - bot_token is required and must start with xoxb- (bot token). default_channel is optional and used when the tool call omits channel.

Behavioral notes
- SlackTrigger filters only human message events (ignores bot messages and message subtypes) and relays them to subscribers.
- SendSlackMessageTool supports posting to channels, thread replies (thread_ts), reply_broadcast, and ephemeral messages (ephemeral_user).

Migration
- Remove SLACK_APP_TOKEN and SLACK_BOT_TOKEN from any .env files; they are no longer read globally.
- When creating nodes via the templates API/UI, supply staticConfig:
  - SlackTrigger: { app_token: 'xapp-...' }
  - SendSlackMessageTool: { bot_token: 'xoxb-...', default_channel?: 'C...' }

Security
- Tokens are not logged. Do not include tokens in logs or error messages.

