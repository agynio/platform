import { AIMessage, BaseMessage, ToolMessage } from "@langchain/core/messages";
import { BaseTool } from "../tools/base.tool";
import { BaseNode } from "./base.node";
import { ToolRunnableConfig } from "@langchain/core/tools";
import { LangGraphRunnableConfig } from "@langchain/langgraph";

export class ToolsNode extends BaseNode {
  constructor(private tools: BaseTool[]) {
    super();
  }

  async action(state: { messages: BaseMessage[] }, config: LangGraphRunnableConfig): Promise<{ messages: any[] }> {
    const lastMessage = state.messages[state.messages.length - 1] as AIMessage;
    const toolCalls = lastMessage.tool_calls || [];
    if (!toolCalls.length) return { messages: [] }; // no delta

    const tools = this.tools.map((tool) => tool.init(config));

    const toolMessages: ToolMessage[] = [];
    for (const tc of toolCalls) {
      const callId = tc.id ?? `missing_id_${Math.random().toString(36).slice(2)}`;
      const tool = tools.find((t) => t.name === tc.name);
      if (!tool) {
        toolMessages.push(
          new ToolMessage({
            tool_call_id: callId,
            name: tc.name,
            content: `Tool '${tc.name}' not found.`,
          }),
        );
        continue;
      }
      try {
        const output = await tool.invoke(tc, { configurable: { thread_id: config?.configurable?.thread_id } });
        toolMessages.push(
          new ToolMessage({
            tool_call_id: callId,
            name: tc.name,
            content: typeof output === "string" ? output : JSON.stringify(output),
          }),
        );
      } catch (err: any) {
        toolMessages.push(
          new ToolMessage({
            tool_call_id: callId,
            name: tc.name,
            content: `Error executing tool '${tc.name}': ${err?.message || String(err)}`,
          }),
        );
      }
    }

    // Return only the new tool messages; reducer will append
    return { messages: toolMessages };
  }
}
