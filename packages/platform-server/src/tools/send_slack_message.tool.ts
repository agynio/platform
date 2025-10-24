// Back-compat shim: re-export Send Slack Message tool
// Re-export class name for tests expecting SendSlackMessageTool named export
export { SendSlackMessageTool } from '../nodes/tools/send_slack_message/send_slack_message.tool';
export { SendSlackMessageToolStaticConfigSchema } from '../nodes/tools/send_slack_message/send_slack_message.tool';
