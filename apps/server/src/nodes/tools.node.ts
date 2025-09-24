<<<<<<< HEAD
import { AIMessage, BaseMessage, ToolMessage } from '@langchain/core/messages';
import { LangGraphRunnableConfig } from '@langchain/langgraph';
import { BaseTool } from '../tools/base.tool';
import { NodeOutput } from '../types';
import { BaseNode } from './base.node';
=======
import { AIMessage, BaseMessage, ToolMessage } from "@langchain/core/messages";
import { LangGraphRunnableConfig } from "@langchain/langgraph";
>>>>>>> 207a5ac (fix(ci): resolve ESLint errors in UI, split non-component exports; add module type for ESLint v9; implement summarization options in CallModelNode; adjust shouldSummarize logic; remove duplicate TemplatesContext)

import { BaseTool } from "../tools/base.tool";

import { BaseNode } from "./base.node";

export class ToolsNode extends BaseNode {
  constructor(private tools: BaseTool[]) {
    super();
    this.tools = [...tools];
  }

  addTool(tool: BaseTool) {
    if (!this.tools.includes(tool)) this.tools.push(tool);
  }

  removeTool(tool: BaseTool) {
    this.tools = this.tools.filter((t) => t !== tool);
  }

  async action(state: { messages: BaseMessage[] }, config: LangGraphRunnableConfig): Promise<NodeOutput> {
    const lastMessage = state.messages[state.messages.length - 1] as AIMessage;
    const toolCalls = lastMessage.tool_calls || [];
    if (!toolCalls.length) return {};

    const tools = this.tools.map((tool) => tool.init(config));

    const toolMessages: ToolMessage[] = await Promise.all(
      toolCalls.map(async (tc) => {
        const callId = tc.id ?? `missing_id_${Math.random().toString(36).slice(2)}`;
        const tool = tools.find((t) => t.name === tc.name);
        const createMessage = (content: string) =>
          new ToolMessage({
            tool_call_id: callId,
            name: tc.name,
            content,
          });

        if (!tool) {
          return createMessage(`Tool '${tc.name}' not found.`);
        }
        try {
          const output = await tool.invoke(tc, { configurable: { thread_id: config?.configurable?.thread_id } });
          const content = typeof output === 'string' ? output : JSON.stringify(output);
          if (content.length > 50000) {
            return createMessage(`Error (output too long: ${content.length} characters).`);
          } else {
            return createMessage(content);
          }
        } catch (err: any) {
          return createMessage(`Error executing tool '${tc.name}': ${err?.message || String(err)}`);
        }
      }),
    );

    return { messages: { method: 'append', items: toolMessages } };
  }
}
