import OpenAI from 'openai';

import {
  AIMessage,
  HumanMessage,
  SystemMessage,
  DeveloperMessage,
  ToolCallMessage,
  ToolCallOutputMessage,
  ResponseMessage,
} from './messages';
import { FunctionTool } from './functionTool';
import { validateReasoningOnlyZeroUsage } from './validation/reasoningOnlyZeroUsage';

export type LLMInput =
  | HumanMessage
  | AIMessage
  | ToolCallMessage
  | ToolCallOutputMessage
  | DeveloperMessage
  | SystemMessage
  | ResponseMessage;

export class LLM {
  constructor(private openAI: OpenAI) {}

  async call(params: { model: string; input: Array<LLMInput>; tools?: Array<FunctionTool> }) {
    const flattenInput = params.input
      .map((m) => {
        if (m instanceof ResponseMessage) {
          return m.output //
            .map((o) => o.toPlain());
        }
        return m.toPlain();
      })
      .flat();

    const toolDefinitions = params.tools?.map((tool) => tool.definition());

    const response = await this.openAI.responses.create({
      model: params.model,
      input: flattenInput,
      tools: toolDefinitions,
    });

    validateReasoningOnlyZeroUsage(response);

    return new ResponseMessage(response);
  }
}
