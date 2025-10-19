import { AIMessage, BaseMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';
import { ChatOpenAI } from '@langchain/openai';
import { BaseTool } from '../tools/base.tool';
import { BaseNode } from './base.lgnode';
import { NodeOutput } from '../types';
import { ChatMessageInput, LLMResponse, withLLM } from '@agyn/tracing';

// Minimal connector contract used by CallModelNode for memory injection
export interface MemoryConnector {
  renderMessage: (opts: { threadId?: string; path?: string }) => Promise<SystemMessage | null>;
  getPlacement: () => 'after_system' | 'last_message';
}

export class CallModelNode extends BaseNode {
  private systemPrompt: string = '';
  private memoryConnector?: MemoryConnector;

  constructor(
    private tools: BaseTool[],
    private llm: ChatOpenAI,
  ) {
    super();
    // Copy to decouple from external array literal; we manage our own list.
    this.tools = [...tools];
  }

  addTool(tool: BaseTool) {
    if (!this.tools.includes(tool)) this.tools.push(tool);
  }

  removeTool(tool: BaseTool) {
    this.tools = this.tools.filter((t) => t !== tool);
  }

  setSystemPrompt(systemPrompt: string) {
    this.systemPrompt = systemPrompt;
  }

  // Inject/clear memory connector at runtime via ports wiring
  setMemoryConnector(connector?: MemoryConnector) {
    this.memoryConnector = connector;
  }

  async action(state: { messages: BaseMessage[]; summary?: string }, config: any): Promise<NodeOutput> {
    const tools = this.tools.map((tool) => tool.init(config));

    const boundLLM = this.llm.withConfig({
      tools: tools,
      tool_choice: 'auto',
    });

    // Removed temporary diagnostic memory_dump path (Issue #125)

    const finalMessages: BaseMessage[] = [
      new SystemMessage(this.systemPrompt),
      ...(state.summary ? [new SystemMessage(`Summary of the previous conversation:\n${state.summary}`)] : []),
      ...(state.messages as BaseMessage[]),
    ];

    // Optionally inject memory as a SystemMessage per connector placement
    if (this.memoryConnector) {
      const threadId = config?.configurable?.thread_id;
      const memMsg = await this.memoryConnector.renderMessage({ threadId });
      if (memMsg) {
        if (this.memoryConnector.getPlacement() === 'after_system') {
          // insert after the first SystemMessage (systemPrompt)
          finalMessages.splice(1, 0, memMsg);
        } else {
          finalMessages.push(memMsg);
        }
      }
    }

    const abortSignal: AbortSignal | undefined = config?.configurable?.abort_signal;
    // Convert LangChain messages to the SDK's ChatMessageInput shape to avoid casts
    const context: ChatMessageInput[] = finalMessages.slice(-10).map((m) => {
      if (m instanceof SystemMessage) return { role: 'system', content: String((m as any).content ?? '') };
      if (m instanceof HumanMessage) return { role: 'human', content: String((m as any).content ?? '') };
      if (m instanceof AIMessage) {
        const content = String((m as any).content ?? '');
        const toolCalls = (m as any).toolCalls || (m as any).tool_calls;
        return { role: 'ai', content, toolCalls } as ChatMessageInput;
      }
      const role = (m as any).role || (m as any)._getType?.() || 'system';
      return { role, content: String((m as any).content ?? '') } as ChatMessageInput;
    });
    const result = await withLLM({ context }, async () => {
      const raw = await boundLLM.invoke(finalMessages, { recursionLimit: 2500, signal: abortSignal });
      // Attempt to normalize output: LangChain ChatModel responses often expose .content and .tool_calls
      const content = raw.text;
      const toolCalls = raw.tool_calls?.map((tc: any, idx: number) => ({
        id: tc.id || `tc_${idx}`,
        name: tc.name,
        arguments: tc.args,
      }));
      // Return LLMResponse so instrumentation extracts attributes while caller receives raw
      return new LLMResponse({ raw, content, toolCalls });
    });

    // Return only delta; reducer in state will append
    return { messages: { method: 'append', items: [result] } };
  }
}
