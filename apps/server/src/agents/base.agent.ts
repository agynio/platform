import { BaseMessage, HumanMessage } from '@langchain/core/messages';
import { RunnableConfig } from '@langchain/core/runnables';
import { Annotation, AnnotationRoot, CompiledStateGraph, Messages, messagesStateReducer } from '@langchain/langgraph';
import { LoggerService } from '../services/logger.service';
import { TriggerListener, TriggerMessage } from '../triggers/base.trigger';
import { NodeOutput } from '../types';
import { withAgent } from '@traceloop/node-server-sdk';
import type { StaticConfigurable } from '../graph/capabilities';
import type { JSONSchema7 as JSONSchema } from 'json-schema';
import * as z from 'zod';

export abstract class BaseAgent implements TriggerListener, StaticConfigurable {
  protected _graph: CompiledStateGraph<unknown, unknown> | undefined;
  protected _config: RunnableConfig | undefined;

  get graph() {
    if (!this._graph) {
      throw new Error('Agent not initialized. Graph is undefined.');
    }
    return this._graph;
  }

  get config() {
    if (!this._config) {
      throw new Error('Agent not initialized. Config is undefined.');
    }
    return this._config;
  }

  constructor(private logger: LoggerService) {}

  protected state(): AnnotationRoot<{}> {
    return Annotation.Root({
      messages: Annotation<BaseMessage[], NodeOutput['messages']>({
        reducer: (left, right) => (!right ? left : right.method === 'append' ? [...left, ...right.items] : right.items),
        default: () => [],
      }),
      summary: Annotation<string, string>({
        reducer: (left, right) => right ?? left,
        default: () => '',
      }),
    });
  }

  protected configuration(): AnnotationRoot<{}> {
    return Annotation.Root({
      // systemPrompt: Annotation<string>(),
    });
  }

  getConfigSchema(): JSONSchema {
    const schema = z
      .object({
        systemPrompt: z.string().optional(),
        summarizationKeepLast: z.number().int().min(0).optional(),
        summarizationMaxTokens: z.number().int().min(1).optional(),
      })
      .passthrough();
    // Zod v4 API: use z.toJSONSchema directly (JSON Schema 7)
    return z.toJSONSchema(schema) as unknown as JSONSchema;
  }

  async invoke(thread: string, messages: TriggerMessage[] | TriggerMessage): Promise<BaseMessage | undefined> {
    return await withAgent({ name: 'agent.invoke', inputParameters: [{ thread }, { messages }] }, async () => {
      const batch = Array.isArray(messages) ? messages : [messages];
      this.logger.info(`New trigger event in thread ${thread} with messages: ${JSON.stringify(batch)}`);
      const response = (await this.graph.invoke(
        {
          messages: { method: 'append', items: batch.map((msg) => new HumanMessage(JSON.stringify(msg))) },
        },
        { ...this.config, configurable: { ...this.config?.configurable, thread_id: thread } },
      )) as { messages: BaseMessage[] };
      const lastMessage = response.messages?.[response.messages.length - 1];
      this.logger.info(`Agent response in thread ${thread}: ${lastMessage?.text}`);
      return lastMessage;
    });
  }

  // New universal teardown hook for graph runtime
  async destroy(): Promise<void> {
    // default no-op; subclasses can override
  }

  abstract setConfig(_cfg: Record<string, unknown>): void | Promise<void>;
}
