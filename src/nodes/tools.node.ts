import { AIMessage, BaseMessage } from "@langchain/core/messages";
import { BaseTool } from "../tools/base.tool";
import { BaseNode } from "./base.node";

export class ToolsNode extends BaseNode {
  constructor(private tools: BaseTool[]) {
    super();
  }

  async action(state: { messages: BaseMessage[] }, config: any): Promise<{ messages: any[] }> {
    const lastMessage = state.messages[state.messages.length - 1] as AIMessage;
    const toolCalls = lastMessage.tool_calls || [];

    const tools = this.tools.map((tool) => tool.init(config));

    const responses = await Promise.all(
      toolCalls.map(async (tc) => {
        return await tools.find((tool) => tool.name === tc.name)!.invoke(tc);
      }),
    );

    return { messages: [...state.messages, ...responses] };
  }
}
