import { BaseMessage } from '@langchain/core/messages';
import { LangGraphRunnableConfig } from '@langchain/langgraph';
import { NodeOutput } from '../types';

export abstract class BaseNode {
  constructor() {}

  abstract action(state: unknown, config: LangGraphRunnableConfig): Promise<NodeOutput>;
}
