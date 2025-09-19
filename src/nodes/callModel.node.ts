import { BaseMessage, SystemMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { BaseTool } from "../tools/base.tool";
import { BaseNode } from "./base.node";

type CallModelNodeOpts = { systemPrompt: string };
export class CallModelNode extends BaseNode {
  private _opts?: CallModelNodeOpts;
  get opts() {
    if (!this._opts) throw new Error("CallModelNode not initialized");
    return this._opts;
  }

  constructor(
    private tools: BaseTool[],
    private llm: ChatOpenAI,
  ) {
    super();
  }

  init(opts: CallModelNodeOpts) {
    this._opts = opts;
    return this;
  }

  async action(state: { messages: BaseMessage[] }, config: any): Promise<{ messages: any[] }> {
    const tools = this.tools.map((tool) => tool.init(config));

    const boundLLM = this.llm.withConfig({
      tools: tools,
      tool_choice: "auto",
    });

    const result = await boundLLM.invoke([new SystemMessage(this.opts.systemPrompt), ...state.messages], {
      recursionLimit: 250,
    });

    // Return only delta; reducer in state will append
    return { messages: [result] };
  }
}
