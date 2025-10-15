import { AIMessage, BaseMessage, ToolMessage } from '@langchain/core/messages';
import { LangGraphRunnableConfig } from '@langchain/langgraph';
import { ToolCallResponse, withToolCall } from '@hautech/obs-sdk';
import { BaseTool } from '../tools/base.tool';
import { NodeOutput } from '../types';
import { BaseNode } from './base.lgnode';
import { TerminateResponse } from '../tools/terminateResponse';

// ToolsNode appends ToolMessage(s) produced by executing tool calls present in the preceding AIMessage.
// Any HumanMessage injection (agent-side buffering) is handled upstream in CallModelNode.

// Narrowed view of a tool call extracted from AIMessage to avoid loose casting
type ToolCall = { id?: string; name: string; args: unknown };
// Config shape we rely on at runtime (thread_id + optional caller_agent passthrough, nodeId variants)
type WithRuntime = LangGraphRunnableConfig & { configurable?: { thread_id?: string; caller_agent?: unknown; nodeId?: string; node_id?: string } };

export class ToolsNode extends BaseNode {
  constructor(private tools: BaseTool[], private nodeId?: string) {
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
        const callId = tc.id ?? `missing_id_${Math.random().toString(36).slice(2)}`;
        const cfgToolNodeId = config?.configurable?.nodeId ?? config?.configurable?.node_id;
        // Attribution model (Issue #171):
        // - nodeId (top-level) is the Tool node id from config.configurable.nodeId/node_id
        // - Do not emit attributes.toolNodeId anymore.
        // - If missing Tool node id, proceed without nodeId to expose gaps.
        if (!cfgToolNodeId) {
          try { console.warn('[ToolsNode] Missing Tool node id in config.configurable.nodeId/node_id; emitting tool_call span without nodeId'); } catch {}
        }
        return await withToolCall(
          { toolCallId: callId, name: tc.name, input: tc.args, ...(cfgToolNodeId ? { nodeId: cfgToolNodeId } : {}) },
          async () => {
          const tool = tools.find((t) => t.name === tc.name);
          const createMessage = (content: string, success = true) => {
            const toolMessage = new ToolMessage({
              tool_call_id: callId,
              name: tc.name,
              content,
            });
            return new ToolCallResponse({
              raw: toolMessage,
              output: content,
              status: success ? 'success' : 'error',
            });
          };

          if (!tool) {
            return createMessage(`Tool '${tc.name}' not found.`, false);
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
              return createMessage(`Error (output too long: ${content.length} characters).`, false);
            } else {
              return createMessage(content);
            }
          } catch (e: unknown) {
            // Prefer readable error strings to avoid "[object Object]"; don't interpolate objects directly
            let errStr = 'Unknown error';
            if (e instanceof Error) errStr = `${e.name}: ${e.message}`;
            else {
              try { errStr = JSON.stringify(e); } catch { errStr = String(e); }
            }
            return createMessage(`Error executing tool '${tc.name}': ${errStr}`, false);
          }
        },
        );
      }),
    );

    // Return only tool results here; any agent-side injections are handled by CallModelNode
    return { messages: { method: 'append', items: toolMessages }, done: terminated };
  }
}
