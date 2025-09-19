# Bash Agent

A TypeScript agent using `@langchain/langgraph` to interact with bash and files.

## Features

- Execute bash commands
- Read files
- Write files
- Edit files (find and replace)

## Setup

1. Install dependencies:
   ```bash
   pnpm install
   ```
2. Set your OpenAI API key in `.env`:
   ```env
   OPENAI_API_KEY=your-key-here
   ```
3. (Optional) Configure GitHub credentials for PR/file operations:

   ```env
   # Personal access token (classic or fine-grained) used for commenting, user-scoped actions
   GH_TOKEN=ghp_yourtoken             # or use GITHUB_TOKEN

   # GitHub App credentials (needed if using app-based auth flows)
   GITHUB_APP_ID=123456
   # Store the PEM with literal newlines or escaped \n sequences
   GITHUB_APP_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...lines...\n-----END PRIVATE KEY-----\n"
   GITHUB_INSTALLATION_ID=987654321
   ```

   Notes:
   - `GITHUB_APP_PRIVATE_KEY` may be supplied either with actual newlines or with `\n` escape sequences; the config service normalizes it.
   - If you only need simple authenticated REST calls or PR comments, a personal token (`GH_TOKEN` / `GITHUB_TOKEN`) is sufficient.
   - For organization-wide or installation-scoped access, provide the App credentials.

4. Run the agent:

   ```bash
   pnpm start
   ```

5. (Optional) Enable Slack trigger (Socket Mode) and messaging:

   ```env
   SLACK_BOT_TOKEN=xoxb-your-bot-token
   SLACK_APP_TOKEN=xapp-your-app-level-token
   ```

   Then you can instantiate and start the trigger and use the send_slack_message tool:

   ```ts
    import { SlackTrigger } from "./src/triggers";
    import { ConfigService } from "./src/services/config.service";
    import { LoggerService } from "./src/services/logger.service";
    import { SlackService } from "./src/services/slack.service";
    import { SendSlackMessageTool } from "./src/tools/send_slack_message.tool";

    const config = ConfigService.fromEnv();
    const logger = new LoggerService();
    const slackService = new SlackService(config, logger);
    const trigger = new SlackTrigger(slackService, logger);
    await trigger.start();
    await trigger.subscribe(async (thread, messages) => {
       console.log("Slack thread:", thread, messages);
    });

    const sendTool = new SendSlackMessageTool(slackService, logger).init();
    await sendTool.invoke({ channel: "C12345678", text: "Hello from the agent" });
   ```

   Any user messages (non-bot) the bot can see will be forwarded to subscribers. Use the tool to send replies or new messages.

## Tools

- `bash_command(command: string)`
- `read_file(path: string)`
- `write_file(path: string, content: string)`
- `edit_file(path: string, old_content: string, new_content: string)`

## Stack

- TypeScript
- pnpm
- @langchain/langgraph
