import { BaseMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { BaseTool } from "../tools/base.tool";
import { BaseNode } from "./base.node";

export class CallModelNode extends BaseNode {
  constructor(
    private tools: BaseTool[],
    private llm: ChatOpenAI,
  ) {
    super();
  }

  async action(state: { messages: BaseMessage[] }, config: any): Promise<{ messages: any[] }> {
    const tools = this.tools.map((tool) => tool.init(config));

    const boundLLM = this.llm.withConfig({
      tools: tools,
      tool_choice: "auto",
    });

    const result = await boundLLM.invoke([...state.messages], {
      recursionLimit: 250,
    });

    return { messages: [result] };
  }
}
