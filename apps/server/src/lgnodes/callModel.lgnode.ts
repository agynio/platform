import { AIMessage, BaseMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';
import { ChatOpenAI } from '@langchain/openai';
import { BaseTool } from '../tools/base.tool';
import { BaseNode } from './base.lgnode';
import { NodeOutput } from '../types';
import { withLLM } from '@hautech/obs-sdk';

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

    // Diagnostic hook: if the last HumanMessage content is a JSON string with
    // shape { content: string } and matches "diag memory_dump [path]",
    // synthesize a tool call and skip LLM invocation.
    try {
      const lastHuman = [...state.messages].reverse().find((m) => m instanceof HumanMessage) as
        | HumanMessage
        | undefined;
      const raw = lastHuman?.content;
      if (typeof raw === 'string') {
        const parsed = JSON.parse(raw);
        const text = parsed?.content;
        if (typeof text === 'string') {
          const match = text.match(/^diag\s+memory_dump(?:\s+(.+))?$/i);
          if (match) {
            const path = match[1]?.trim();
            const ai = new AIMessage({
              content: '',
              tool_calls: [
                {
                  name: 'memory_dump',
                  args: path ? { path } : {},
                },
              ],
            } as any);
            return { messages: { method: 'append', items: [ai] } };
          }
        }
      }
    } catch {
      // ignore parse errors and continue with normal LLM flow
    }

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

    const result = await withLLM({ newMessages: finalMessages.slice(-10), context: {} }, async () => {
      const r = await boundLLM.invoke(finalMessages, { recursionLimit: 2500 });
      // Map ChatOpenAI result to expected shape with text/toolCalls for obs-sdk augmentation
      const toolCalls: any[] = (r as any).tool_calls || [];
      const text = typeof (r as any).content === 'string' ? (r as any).content : JSON.stringify((r as any).content);
      return { ...(r as any), text, toolCalls } as any;
    });

    // Return only delta; reducer in state will append
    return { messages: { method: 'append', items: [result] } };
  }
}
