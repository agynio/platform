import OpenAI from 'openai';

import {
  AIMessage,
  HumanMessage,
  SystemMessage,
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
  | SystemMessage
  | ResponseMessage;

export class LLM {
  constructor(private openAI: OpenAI) {}

  async call(params: { model: string; input: Array<LLMInput>; tools?: Array<FunctionTool> }) {
    const flattenInput = params.input.flatMap((m) => {
      if (m instanceof ResponseMessage) {
        const outputMessages = m.output;
        const containsToolCall = outputMessages.some((entry) => entry instanceof ToolCallMessage);
        return outputMessages
          .filter((entry) => {
            if (!containsToolCall) return true;
            if (!(entry instanceof AIMessage)) return true;
            return entry.text.trim().length > 0;
          })
          .map((entry) => entry.toPlain());
      }
      return [m.toPlain()];
    });

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
