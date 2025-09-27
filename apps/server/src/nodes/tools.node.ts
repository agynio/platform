import { AIMessage, BaseMessage, ToolMessage } from '@langchain/core/messages';
import { LangGraphRunnableConfig } from '@langchain/langgraph';
import { withTool } from '@traceloop/node-server-sdk';
import { BaseTool } from '../tools/base.tool';
import { NodeOutput } from '../types';
import { BaseNode } from './base.node';
import { TerminateResponse } from '../tools/terminateResponse';

// Narrowed view of a tool call extracted from AIMessage to avoid loose casting
type ToolCall = { id?: string; name: string; args: unknown };
// Config shape we rely on at runtime (thread_id + optional caller_agent passthrough)
type WithRuntime = LangGraphRunnableConfig & { configurable?: { thread_id?: string; caller_agent?: unknown } };

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

  async action(state: { messages: BaseMessage[] }, config: WithRuntime): Promise<NodeOutput> {
    const lastMessage = state.messages[state.messages.length - 1] as AIMessage;
    const toolCalls = (lastMessage.tool_calls as ToolCall[]) || [];
    if (!toolCalls.length) return {};

    const tools = this.tools.map((tool) => tool.init(config));

    let terminated = false;

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
            const output = await tool.invoke(tc.args, {
              configurable: {
                thread_id: config?.configurable?.thread_id,
                // pass through the caller agent if provided by the parent agent's runtime
                caller_agent: config?.configurable?.caller_agent,
              },
            });
            if (output instanceof TerminateResponse) {
              terminated = true;
              const msg = output.message || 'Finished';
              return createMessage(msg);
            }
            const content = typeof output === 'string' ? output : JSON.stringify(output);
            if (content.length > 50000) {
              return createMessage(`Error (output too long: ${content.length} characters).`);
            } else {
              return createMessage(content);
            }
          } catch (e) {
            const err = e as Error;
            return createMessage(`Error executing tool '${tc.name}': ${err?.message || String(err)}`);
          }
        });
      }),
    );

    return { messages: { method: 'append', items: toolMessages }, done: terminated };
  }
}
