import { AIMessage, BaseMessage, ToolMessage } from '@langchain/core/messages';
import { LangGraphRunnableConfig } from '@langchain/langgraph';
import { withTool } from '@traceloop/node-server-sdk';
import { BaseTool } from '../tools/base.tool';
import { NodeOutput } from '../types';
import { BaseNode } from './base.node';

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

  listTools() {
    return this.tools;
  }

  async action(state: { messages: BaseMessage[] }, config: LangGraphRunnableConfig): Promise<NodeOutput> {
    const lastMessage = state.messages[state.messages.length - 1] as AIMessage;
    const toolCalls = lastMessage.tool_calls || [];
    if (!toolCalls.length) return {};

    const tools = this.tools.map((tool) => tool.init(config));

    const toolMessages: ToolMessage[] = await Promise.all(
      toolCalls.map(async (tc) => {
        return await withTool({ name: tc.name, inputParameters: [tc.args] }, async () => {
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
            const output = await tool.invoke(tc, {
              configurable: {
                thread_id: config?.configurable?.thread_id,
                // pass through the caller agent if provided by the parent agent's runtime
                caller_agent: (config as any)?.configurable?.caller_agent,
              },
            });
            const content = typeof output === 'string' ? output : JSON.stringify(output);
            if (content.length > 50000) {
              return createMessage(`Error (output too long: ${content.length} characters).`);
            } else {
              return createMessage(content);
            }
          } catch (err: any) {
            return createMessage(`Error executing tool '${tc.name}': ${err?.message || String(err)}`);
          }
        });
      }),
    );

    return { messages: { method: 'append', items: toolMessages } };
  }
}
