import OpenAI from 'openai';
import type { Response } from 'openai/resources/responses/responses.mjs';

import {
  AIMessage,
  HumanMessage,
  SystemMessage,
  ToolCallMessage,
  ToolCallOutputMessage,
  ResponseMessage,
} from './messages';
import { FunctionTool } from './functionTool';

export class ReasoningOnlyZeroUsageError extends Error {
  readonly rawResponse: Response;

  constructor(rawResponse: Response) {
    super('Received reasoning-only response with zero usage tokens');
    this.name = 'ReasoningOnlyZeroUsageError';
    this.rawResponse = rawResponse;
  }
}

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

    if (LLM.isReasoningOnlyZeroUsage(response)) {
      throw new ReasoningOnlyZeroUsageError(response);
    }

    return new ResponseMessage(response);
  }

  private static isReasoningOnlyZeroUsage(response: Response): boolean {
    return LLM.hasZeroUsage(response.usage) && LLM.outputIsReasoningOnly(response.output);
  }

  private static hasZeroUsage(usage: Response['usage'] | null | undefined): boolean {
    if (!usage || typeof usage !== 'object') return false;

    const counts = [
      usage.total_tokens,
      usage.input_tokens,
      usage.output_tokens,
      usage.input_tokens_details?.cached_tokens,
      usage.output_tokens_details?.reasoning_tokens,
    ].filter((value): value is number => typeof value === 'number');

    if (!counts.length) return false;
    return counts.every((value) => value === 0);
  }

  private static outputIsReasoningOnly(output: Response['output'] | null | undefined): boolean {
    if (!Array.isArray(output) || output.length === 0) return false;
    return output.every((item) => item?.type === 'reasoning');
  }
}
