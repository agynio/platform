import { BaseMessage, SystemMessage } from '@langchain/core/messages';
import { ChatOpenAI } from '@langchain/openai';
import { BaseTool } from '../tools/base.tool';
import { BaseNode } from './base.node';
import { NodeOutput } from '../types';
import { withTask } from '@traceloop/node-server-sdk';
import type { InjectionProvider } from '../agents/base.agent';

export class CallModelNode extends BaseNode {
  private systemPrompt: string = '';

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

  async action(
    state: { messages: BaseMessage[]; summary?: string },
    config: { configurable?: { thread_id?: string; caller_agent?: InjectionProvider } },
  ): Promise<NodeOutput> {
    const tools = this.tools.map((tool) => tool.init(config));

    const boundLLM = this.llm.withConfig({
      tools: tools,
      tool_choice: 'auto',
    });

    // Agent-controlled injection: ask provider for any messages to include in this turn (type-safe)
    const injected: BaseMessage[] = (() => {
      const agent = config?.configurable?.caller_agent;
      const threadId = config?.configurable?.thread_id;
      if (agent && threadId && typeof agent.getInjectedMessages === 'function') {
        try {
          const extra = agent.getInjectedMessages(threadId);
          return Array.isArray(extra) ? extra : [];
        } catch {
          return [];
        }
      }
      return [];
    })();

    const finalMessages: BaseMessage[] = [
      new SystemMessage(this.systemPrompt),
      ...(state.summary ? [new SystemMessage(`Summary of the previous conversation:\n${state.summary}`)] : []),
      ...(state.messages as BaseMessage[]),
      ...injected,
    ];

    const result = await withTask({ name: 'llm', inputParameters: [finalMessages.slice(-10)] }, async () => {
      return await boundLLM.invoke(finalMessages, {
        recursionLimit: 2500,
      });
    });

    // Persist the injection in state alongside the model response
    return { messages: { method: 'append', items: [...injected, result] } };
  }
}
