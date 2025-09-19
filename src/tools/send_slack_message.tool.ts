import { tool, DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { BaseTool } from "./base.tool";
import { LoggerService } from "../services/logger.service";
import { SlackService } from "../services/slack.service";

const sendSlackMessageSchema = z.object({
  channel: z.string().min(1).describe("Slack channel ID (e.g. C123..., D123... for DM)."),
  thread_ts: z.string().optional().describe("Timestamp of thread root to reply in (if replying)."),
  text: z.string().min(1).describe("Message text to send."),
  broadcast: z
    .boolean()
    .optional()
    .describe("If true when replying in thread, broadcast to channel (reply_broadcast)."),
  ephemeral_user: z
    .string()
    .optional()
    .describe(
      "If provided, send an ephemeral message visible only to this user (user ID). Ignored when also providing broadcast.",
    ),
});

export class SendSlackMessageTool extends BaseTool {
  constructor(
    private slack: SlackService,
    private logger: LoggerService,
  ) {
    super();
  }

  init(): DynamicStructuredTool {
    return tool(
      async (rawInput) => {
        const { channel, text, thread_ts, broadcast, ephemeral_user } = sendSlackMessageSchema.parse(rawInput);
        this.logger.info("Tool called", "send_slack_message", { channel, hasThread: !!thread_ts, broadcast });

        try {
          const resp = await this.slack.sendMessage({ channel, text, thread_ts, broadcast, ephemeral_user });
          if (!resp.ok) return `Failed to send message: ${resp.error}`;
          return JSON.stringify(resp);
        } catch (err: any) {
          this.logger.error("Error sending Slack message", err);
          return `Error sending Slack message: ${err.message || String(err)}`;
        }
      },
      {
        name: "send_slack_message",
        description:
          "Send a Slack message to a channel or DM. Provide channel and text. Optionally provide thread_ts to reply in a thread. Set broadcast=true to also broadcast the threaded reply. Provide ephemeral_user to send an ephemeral message to a specific user.",
        schema: sendSlackMessageSchema,
      },
    );
  }
}
