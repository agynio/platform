import OpenAI from 'openai';
import type { Response, ResponseUsage } from 'openai/resources/responses/responses.mjs';

import {
  AIMessage,
  HumanMessage,
  SystemMessage,
  ToolCallMessage,
  ToolCallOutputMessage,
  ResponseMessage,
} from './messages';
import { FunctionTool } from './functionTool';

type InputTokensDetails = ResponseUsage['input_tokens_details'];
type OutputTokensDetails = ResponseUsage['output_tokens_details'];

type UsageSnapshot = Readonly<{
  total_tokens: number;
  input_tokens: number;
  output_tokens: number;
  input_tokens_details?: Partial<InputTokensDetails>;
  output_tokens_details?: Partial<OutputTokensDetails>;
}>;

interface UsageCandidate {
  total_tokens?: unknown;
  input_tokens?: unknown;
  output_tokens?: unknown;
  input_tokens_details?: unknown;
  output_tokens_details?: unknown;
}

interface CachedTokensCandidate {
  cached_tokens?: unknown;
}

interface ReasoningTokensCandidate {
  reasoning_tokens?: unknown;
}

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
    if (!LLM.isUsageSnapshot(usage)) return false;

    const counts = [
      usage.total_tokens,
      usage.input_tokens,
      usage.output_tokens,
      usage.input_tokens_details?.cached_tokens,
      usage.output_tokens_details?.reasoning_tokens,
    ].filter(LLM.isFiniteNumber);

    if (!counts.length) return false;
    return counts.every((value) => value === 0);
  }

  private static outputIsReasoningOnly(output: Response['output'] | null | undefined): boolean {
    if (!Array.isArray(output) || output.length === 0) return false;

    return output.every((item) => item?.type === 'reasoning');
  }

  private static isUsageSnapshot(usage: Response['usage'] | null | undefined): usage is UsageSnapshot {
    if (usage === null || usage === undefined || typeof usage !== 'object') {
      return false;
    }

    const candidate = usage as UsageCandidate;

    if (!LLM.isFiniteNumber(candidate.total_tokens)) return false;
    if (!LLM.isFiniteNumber(candidate.input_tokens)) return false;
    if (!LLM.isFiniteNumber(candidate.output_tokens)) return false;

    const inputDetails = candidate.input_tokens_details;
    if (!LLM.isValidInputUsageDetails(inputDetails)) return false;

    const outputDetails = candidate.output_tokens_details;
    if (!LLM.isValidOutputUsageDetails(outputDetails)) return false;

    return true;
  }

  private static isValidInputUsageDetails(
    details: unknown,
  ): details is UsageSnapshot['input_tokens_details'] {
    if (details === undefined) {
      return true;
    }

    if (details === null || typeof details !== 'object') {
      return false;
    }

    const value = (details as CachedTokensCandidate).cached_tokens;
    if (value === undefined) {
      return true;
    }

    return LLM.isFiniteNumber(value);
  }

  private static isValidOutputUsageDetails(
    details: unknown,
  ): details is UsageSnapshot['output_tokens_details'] {
    if (details === undefined) {
      return true;
    }

    if (details === null || typeof details !== 'object') {
      return false;
    }

    const value = (details as ReasoningTokensCandidate).reasoning_tokens;
    if (value === undefined) {
      return true;
    }

    return LLM.isFiniteNumber(value);
  }

  private static isFiniteNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
  }
}
