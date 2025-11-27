import OpenAI from 'openai';

import {
  AIMessage,
  DeveloperMessage,
  HumanMessage,
  ResponseMessage,
  SystemMessage,
  ToolCallMessage,
  ToolCallOutputMessage,
} from './messages';
import { FunctionTool } from './functionTool';
import type { ResponseInputItem } from 'openai/resources/responses/responses.mjs';

export type LLMInput =
  | HumanMessage
  | AIMessage
  | ToolCallMessage
  | ToolCallOutputMessage
  | SystemMessage
  | DeveloperMessage
  | ResponseMessage;

export class LLM {
  constructor(private openAI: OpenAI) {}

  async call(params: { model: string; input: Array<LLMInput>; tools?: Array<FunctionTool> }) {
    try {
      return await this.invoke(params.input, params.model, params.tools);
    } catch (err) {
      if (!this.shouldFallbackToSystem(err, params.input)) throw err;
      const downgradedInput = this.downgradeDeveloperMessages(params.input);
      return this.invoke(downgradedInput, params.model, params.tools);
    }
  }

  private async invoke(input: Array<LLMInput>, model: string, tools?: Array<FunctionTool>): Promise<ResponseMessage> {
    const flattenInput = this.flattenInput(input);
    const toolDefinitions = tools?.map((tool) => tool.definition());
    const response = await this.openAI.responses.create({
      model,
      input: flattenInput,
      tools: toolDefinitions,
    });
    return new ResponseMessage(response);
  }

  private flattenInput(input: Array<LLMInput>) {
    return input
      .map((m) => {
        if (m instanceof ResponseMessage) {
          return m.output.map((o) => o.toPlain());
        }
        return m.toPlain();
      })
      .flat();
  }

  private shouldFallbackToSystem(err: unknown, input: Array<LLMInput>): boolean {
    if (!input.some((m) => m instanceof DeveloperMessage)) return false;
    const message = this.extractErrorMessage(err);
    if (!message) return false;
    const normalized = message.toLowerCase();
    if (!normalized.includes('developer')) return false;
    if (normalized.includes('role') || normalized.includes('not supported') || normalized.includes('invalid')) {
      return true;
    }
    return false;
  }

  private extractErrorMessage(err: unknown): string {
    const parts: string[] = [];
    if (err instanceof Error && typeof err.message === 'string') parts.push(err.message);

    if (err && typeof err === 'object') {
      const errorField = (err as { error?: unknown }).error;
      if (typeof errorField === 'string') parts.push(errorField);
      else if (errorField && typeof errorField === 'object') {
        const nestedMessage = (errorField as { message?: unknown }).message;
        if (typeof nestedMessage === 'string') parts.push(nestedMessage);
      }

      const responseData = (err as { response?: { data?: unknown } }).response?.data;
      if (responseData && typeof responseData === 'object') {
        const dataMessage = (responseData as { error?: { message?: unknown } }).error?.message;
        if (typeof dataMessage === 'string') parts.push(dataMessage);
        const altMessage = (responseData as { message?: unknown }).message;
        if (typeof altMessage === 'string') parts.push(altMessage);
      }
    }

    return parts.join(' ').trim();
  }

  private downgradeDeveloperMessages(input: Array<LLMInput>): Array<LLMInput> {
    return input.map((msg) => {
      if (msg instanceof DeveloperMessage) return this.convertDeveloperToSystem(msg);
      return msg;
    });
  }

  private convertDeveloperToSystem(message: DeveloperMessage): SystemMessage {
    const plain = message.toPlain();
    return new SystemMessage({ ...plain, role: 'system' } as ResponseInputItem.Message & { role: 'system' });
  }
}
