import { BaseMessage, HumanMessage } from "@langchain/core/messages";
import { Annotation, AnnotationRoot, CompiledStateGraph, Messages, messagesStateReducer } from "@langchain/langgraph";
import { BaseTrigger } from "../triggers";
import { RunnableConfig } from "@langchain/core/runnables";
import { LoggerService } from "../services/logger.service";

export abstract class BaseAgent {
  protected _graph: CompiledStateGraph<unknown, unknown> | undefined;
  protected _config: RunnableConfig | undefined;

  get graph() {
    if (!this._graph) {
      throw new Error("Agent not initialized. Graph is undefined.");
    }
    return this._graph;
  }

  get config() {
    if (!this._config) {
      throw new Error("Agent not initialized. Config is undefined.");
    }
    return this._config;
  }

  constructor(private logger: LoggerService) {}

  protected state(): AnnotationRoot<{}> {
    return Annotation.Root({
      messages: Annotation<BaseMessage[], Messages>({
        reducer: messagesStateReducer,
        default: () => [],
      }),
    });
  }

  protected configuration(): AnnotationRoot<{}> {
    return Annotation.Root({
      // systemPrompt: Annotation<string>(),
    });
  }

  listen(trigger: BaseTrigger) {
    trigger.subscribe(async (thread, messages) => {
      this.logger.info(`New trigger event in thread ${thread} with messages: ${JSON.stringify(messages)}`);
      const response = (await this.graph.invoke(
        { messages: messages.map((msg) => new HumanMessage(JSON.stringify(msg))) },
        { ...this.config, configurable: { ...this.config?.configurable, thread_id: thread } },
      )) as { messages: BaseMessage[] };
      const lastMessage = response.messages?.[response.messages.length - 1];
      this.logger.info(`Agent response in thread ${thread}: ${lastMessage?.text}`);
    });
  }
}
