import { FunctionTool } from '@agyn/llm';

import Node from "../base/Node";

export abstract class BaseToolNode extends Node {
  abstract getTool(): FunctionTool;
}
