import { BaseMessage, SystemMessage } from '@langchain/core/messages';
import { ChatOpenAI } from '@langchain/openai';
import { BaseTool } from '../tools/base.tool';
import { BaseNode } from './base.lgnode';
import { NodeOutput } from '../types';
import { withTask } from '@traceloop/node-server-sdk';

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

    const result = await withTask({ name: 'llm', inputParameters: [finalMessages.slice(-10)] }, async () => {
      return await boundLLM.invoke(finalMessages, {
        recursionLimit: 2500,
      });
    });

    // Return only delta; reducer in state will append
    return { messages: { method: 'append', items: [result] } };
  }
}
