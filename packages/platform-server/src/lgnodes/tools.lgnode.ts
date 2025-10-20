import { AIMessage, BaseMessage, ToolMessage } from '@langchain/core/messages';
import { LangGraphRunnableConfig } from '@langchain/langgraph';
import { ToolCallResponse, withToolCall } from '@agyn/tracing';
import { BaseTool } from '../tools/base.tool';
import { NodeOutput } from '../types';
import { BaseNode } from './base.lgnode';
import { TerminateResponse } from '../tools/terminateResponse';
import { createSingleFileTar } from '../utils/archive';
import { randomUUID } from 'node:crypto';

// ToolsNode appends ToolMessage(s) produced by executing tool calls present in the preceding AIMessage.
// Any HumanMessage injection (agent-side buffering) is handled upstream in CallModelNode.

// Narrowed view of a tool call extracted from AIMessage to avoid loose casting
type ToolCall = { id?: string; name: string; args: unknown };
// Config shape we rely on at runtime (thread_id + optional caller_agent passthrough, nodeId variants)
type WithRuntime = LangGraphRunnableConfig & { configurable?: { thread_id?: string; caller_agent?: unknown; nodeId?: string; node_id?: string; abort_signal?: AbortSignal } };

export class ToolsNode extends BaseNode {
  constructor(private tools: BaseTool[], private nodeId?: string) {
    super();
    this.tools = [...tools];
  }

  private async handleOversizedOutput(content: string, config: WithRuntime | undefined, pair: { base: BaseTool } | undefined) {
    const threadId = config?.configurable?.thread_id;
    const baseTool = pair?.base;
    const canSave = threadId && baseTool && typeof (baseTool as any).getContainerForThread === 'function';
    if (!canSave) return new ToolCallResponse({ raw: new ToolMessage({ content: '' }), output: `Error (output too long: ${content.length} characters).`, status: 'error' });
    try {
      const container = await (baseTool as any).getContainerForThread(threadId);
      const hasPut = !!container && typeof container.putArchive === 'function';
      if (!hasPut) return new ToolCallResponse({ raw: new ToolMessage({ content: '' }), output: `Error (output too long: ${content.length} characters).`, status: 'error' });
      const uuid = randomUUID();
      const filename = `${uuid}.txt`;
      const tarBuf = await createSingleFileTar(filename, content);
      await container.putArchive(tarBuf, { path: '/tmp' });
      const msg = `Error: output is too long (${content.length} characters). The output has been saved to /tmp/${filename}`;
      return new ToolCallResponse({ raw: new ToolMessage({ content: msg }), output: msg, status: 'error' });
    } catch {
      const msg = `Error (output too long: ${content.length} characters).`;
      return new ToolCallResponse({ raw: new ToolMessage({ content: msg }), output: msg, status: 'error' });
    }
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

    const toolPairs = this.tools.map((base) => ({ base, dyn: base.init(config) }));

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
          const pair = toolPairs.find((p) => p.dyn.name === tc.name);
          const tool = pair?.dyn;
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
                abort_signal: config?.configurable?.abort_signal,
              },
            });
            if (output instanceof TerminateResponse) {
              terminated = true;
              const msg = output.message || 'Finished';
              return createMessage(msg);
            }
            const content = typeof output === 'string' ? output : JSON.stringify(output);
            const MAX_TOOL_OUTPUT = 50_000;
            if (content.length > MAX_TOOL_OUTPUT) return await this.handleOversizedOutput(content, config, pair);
            return createMessage(content);
          } catch (e: unknown) {
            // Prefer readable error strings to avoid "[object Object]"; don't interpolate objects directly
            if (e instanceof Error && e.name === 'AbortError') {
              // Propagate abort to terminate the run instead of swallowing as a tool error
              throw e;
            }
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
