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

    return new ResponseMessage(response);
  }
}
