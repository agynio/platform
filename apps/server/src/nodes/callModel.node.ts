import { BaseMessage, SystemMessage } from '@langchain/core/messages';
import { ChatOpenAI } from '@langchain/openai';
import { BaseTool } from '../tools/base.tool';
import { BaseNode } from './base.node';
import { buildContextForModel, type ChatState } from './summarization.node';

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

  addTool(tool: BaseTool) {
    if (!this.tools.includes(tool)) this.tools.push(tool);
  }

  removeTool(tool: BaseTool) {
    this.tools = this.tools.filter((t) => t !== tool);
  }

  setSystemPrompt(systemPrompt: string) {
    this.systemPrompt = systemPrompt;
  }

  setSummarizationOptions(opts: { keepLast?: number; maxTokens?: number }): void {
    this.summarizationKeepLast = opts.keepLast;
    this.summarizationMaxTokens = opts.maxTokens;
  }

  async action(state: { messages: BaseMessage[]; summary?: string }, config: any): Promise<{ messages: any[] }> {
    const tools = this.tools.map((tool) => tool.init(config));

    const boundLLM = this.llm.withConfig({
      tools: tools,
      tool_choice: 'auto',
    });

    let finalMessages: BaseMessage[];
    const shouldUseSummarization = !!(this.summarizationKeepLast && this.summarizationKeepLast > 0 && this.summarizationMaxTokens && this.summarizationMaxTokens > 0);
    if (shouldUseSummarization) {
      const context = await buildContextForModel(
        { messages: state.messages, summary: state.summary } as ChatState,
        {
          llm: this.llm,
          keepLast: this.summarizationKeepLast!,
          maxTokens: this.summarizationMaxTokens!,
          summarySystemNote: 'Conversation summary so far:',
        },
      );
      finalMessages = [new SystemMessage(this.systemPrompt), ...context];
    } else {
      finalMessages = [new SystemMessage(this.systemPrompt), ...(state.messages as BaseMessage[])];
    }

    const result = await boundLLM.invoke(finalMessages, {
      recursionLimit: 250,
    });

    // Return only delta; reducer in state will append
    return { messages: [result] };
  }
}
