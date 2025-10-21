import { FunctionTool } from '@agyn/llm';

export abstract class BaseToolNode {
  abstract getTool(): FunctionTool;
}
