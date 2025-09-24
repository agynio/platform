import { BaseMessage, SystemMessage } from '@langchain/core/messages';
import { ChatOpenAI } from '@langchain/openai';

import { BaseTool } from '../tools/base.tool';

import { BaseNode } from './base.node';
import { NodeOutput } from '../types';

export class CallModelNode extends BaseNode {
  private systemPrompt: string = '';
  private summarizationKeepLast?: number;
  private summarizationMaxTokens?: number;

  constructor(
    private tools: BaseTool[],
    private llm: ChatOpenAI,
  ) {
    super();
    // Copy to decouple from external array literal; we manage our own list.
    this.tools = [...tools];
  }

  setSummarizationOptions(opts: { keepLast?: number; maxTokens?: number }) {
    if (opts.keepLast !== undefined) this.summarizationKeepLast = opts.keepLast;
    if (opts.maxTokens !== undefined) this.summarizationMaxTokens = opts.maxTokens;
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

  async action(state: { messages: BaseMessage[]; summary?: string }, config: any): Promise<NodeOutput> {
    const tools = this.tools.map((tool) => tool.init(config));

    const boundLLM = this.llm.withConfig({
      tools: tools,
      tool_choice: 'auto',
    });

    // If summarization options configured, build context via helper
    let finalMessages: BaseMessage[];
    if (this.summarizationKeepLast !== undefined && this.summarizationMaxTokens !== undefined) {
      const { buildContextForModel } = await import('./summarization.node');
      finalMessages = await buildContextForModel(
        { messages: state.messages, summary: state.summary },
        {
          llm: this.llm,
          keepLast: this.summarizationKeepLast,
          maxTokens: this.summarizationMaxTokens,
        } as any,
      );
      if (this.systemPrompt) finalMessages.unshift(new SystemMessage(this.systemPrompt));
    } else {
      finalMessages = [new SystemMessage(this.systemPrompt), ...state.messages];
    }

    const result = await boundLLM.invoke(finalMessages, {
      recursionLimit: 250,
    });

    // Return only delta; reducer in state will append
    return { messages: { method: 'append', items: [result] } };
  }
}
