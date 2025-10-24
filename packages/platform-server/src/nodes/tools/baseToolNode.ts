import { FunctionTool } from '@agyn/llm';

import Node from '../base/Node';

export abstract class BaseToolNode<T> extends Node<T> {
  abstract getTool(): FunctionTool;
}
