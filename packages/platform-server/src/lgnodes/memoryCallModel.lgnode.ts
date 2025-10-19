import { BaseMessage } from '@langchain/core/messages';
import { BaseMessage as ObsBaseMessage } from '@agyn/tracing';
import { BaseStore, LangGraphRunnableConfig } from '@langchain/langgraph';
import { ChatOpenAI } from '@langchain/openai';
import { BaseTool } from '../tools/base.tool';
import { BaseNode } from './base.lgnode';
import { NodeOutput } from '../types';
import { LLMResponse, withLLM } from '@agyn/tracing';

export const SYSTEM_PROMPT = `You are a helpful and friendly chatbot. Get to know the user! \
Ask questions! Be spontaneous! 
{user_info}

System Time: {time}`;

export class MemoryCallModelNode extends BaseNode {
  constructor(
    private tools: BaseTool[],
    private llm: ChatOpenAI,
  ) {
    super();
  }

  getStoreFromConfigOrThrow(config: LangGraphRunnableConfig): BaseStore {
    if (!config.store) throw new Error('Store not found in configuration');
    return config.store;
  }

  ensureConfiguration(config?: LangGraphRunnableConfig) {
    const configurable = config?.configurable || {};
    return {
      userId: configurable?.userId || 'default',
      model: configurable?.model || 'anthropic/claude-3-5-sonnet-20240620',
      systemPrompt: configurable?.systemPrompt || SYSTEM_PROMPT,
    };
  }

  splitModelAndProvider(fullySpecifiedName: string): {
    model: string;
    provider?: string;
  } {
    let provider: string | undefined;
    let model: string;

    if (fullySpecifiedName.includes('/')) {
      [provider, model] = fullySpecifiedName.split('/', 2);
    } else {
      model = fullySpecifiedName;
    }

    return { model, provider };
  }

  async action(state: { messages: BaseMessage[] }, config: any): Promise<NodeOutput> {
    const store = this.getStoreFromConfigOrThrow(config);
    const configurable = this.ensureConfiguration(config);
    const memories = await store.search(['memories', configurable.userId], {
      limit: 10,
    });

    let formatted = memories?.map((mem) => `[${mem.key}]: ${JSON.stringify(mem.value)}`)?.join('\n') || '';
    if (formatted) {
      formatted = `\n<memories>\n${formatted}\n</memories>`;
    }

    const sys = configurable.systemPrompt.replace('{user_info}', formatted).replace('{time}', new Date().toISOString());

    const tools = this.tools.map((tool) => tool.init(config));

    const boundLLM = this.llm.withConfig({
      tools: tools,
      tool_choice: 'auto',
    });

    const context = [{ role: 'system', content: sys }, ...state.messages];
    const result = await withLLM(
      {
        context: [{ role: 'system', content: sys }, ...state.messages].map((msg) => ObsBaseMessage.fromLangChain(msg)),
      },
      async () => {
        const raw = await boundLLM.invoke(context, {
          configurable: this.splitModelAndProvider(configurable.model),
        });
        const toolCalls = raw.tool_calls?.map((tc, idx) => ({
          id: tc.id || `tc_${idx}`,
          name: tc.name,
          arguments: tc.args,
        }));
        const content = typeof raw.content === 'string' ? raw.content : JSON.stringify(raw.content);
        return new LLMResponse({ raw, content, toolCalls });
      },
    );

    return { messages: { method: 'append', items: [result] } };
  }
}
