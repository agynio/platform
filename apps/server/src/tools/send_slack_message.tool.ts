import { tool, DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { BaseTool } from "./base.tool";
import { LoggerService } from "../services/logger.service";
import { WebClient, type ChatPostMessageResponse, type ChatPostEphemeralResponse } from '@slack/web-api';

const sendSlackMessageSchema = z.object({
  channel: z.string().min(1).optional().describe("Slack channel ID (e.g. C123..., D123... for DM)."),
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

// Static config schema for per-node Slack bot token and optional default channel
export const SendSlackMessageToolStaticConfigSchema = z.object({
  bot_token: z.string().min(1).startsWith('xoxb-', { message: 'Slack bot token must start with xoxb-' }).describe('Slack bot token (xoxb-...) for sending messages.'),
  default_channel: z.string().optional().describe('Default Slack channel ID to use when not provided in the call.'),
}).strict();

export class SendSlackMessageTool extends BaseTool {
  private cfg: z.infer<typeof SendSlackMessageToolStaticConfigSchema> | null = null;

  constructor(
    logger: LoggerService,
  ) {
    super(logger);
  }

  init(): DynamicStructuredTool {
    return tool(
      async (rawInput) => {
        const { channel: channelInput, text, thread_ts, broadcast, ephemeral_user } = sendSlackMessageSchema.parse(rawInput);
        const cfg = this.cfg;
        if (!cfg) throw new Error('SendSlackMessageTool not configured: bot_token is required');
        const channel = channelInput || cfg.default_channel;
        if (!channel) throw new Error('channel is required (or set default_channel in static config)');
        this.logger.info("Tool called", "send_slack_message", { channel, hasThread: !!thread_ts, broadcast });

        try {
          const client = new WebClient(cfg.bot_token, { logLevel: undefined });
          if (ephemeral_user) {
            const resp: ChatPostEphemeralResponse = await client.chat.postEphemeral({ channel, user: ephemeral_user, text, thread_ts });
            if (!resp.ok) return `Failed to send message: ${resp.error}`;
            return JSON.stringify({ ok: true, channel, message_ts: resp.message_ts, ephemeral: true });
          }
          const resp: ChatPostMessageResponse = await client.chat.postMessage({
            channel,
            text,
            ...(thread_ts ? { thread_ts } : {}),
            ...(thread_ts && broadcast ? { reply_broadcast: true } : {}),
          });
          if (!resp.ok) return `Failed to send message: ${resp.error}`;
          const thread = (resp.message && 'thread_ts' in resp.message ? (resp.message as { thread_ts?: string }).thread_ts : undefined) || thread_ts || resp.ts;
          return JSON.stringify({ ok: true, channel: resp.channel, ts: resp.ts, thread_ts: thread, broadcast: !!broadcast });
        } catch (err: unknown) {
          const msg = (err && typeof err === 'object' && 'message' in err) ? String((err as any).message) : String(err);
          this.logger.error("Error sending Slack message", msg);
          return `Error sending Slack message: ${msg}`;
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

  async setConfig(_cfg: Record<string, unknown>): Promise<void> {
    // Validate and apply static config (bot_token & optional default_channel)
    const parsed = SendSlackMessageToolStaticConfigSchema.parse(_cfg || {});
    // Do not log tokens; mask length only
    this.cfg = { ...parsed, bot_token: parsed.bot_token };
  }
}
