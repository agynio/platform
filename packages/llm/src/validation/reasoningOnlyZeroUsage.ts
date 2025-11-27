import type { Response } from 'openai/resources/responses/responses.mjs';

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

export function validateReasoningOnlyZeroUsage(response: Response): void {
  if (isReasoningOnlyZeroUsage(response)) {
    throw new ReasoningOnlyZeroUsageError(response);
  }
}

function isReasoningOnlyZeroUsage(response: Response): boolean {
  return hasZeroUsage(response.usage) && outputIsReasoningOnly(response.output);
}

function hasZeroUsage(usage: Response['usage'] | null | undefined): boolean {
  if (usage === null || usage === undefined || typeof usage !== 'object') {
    return false;
  }

  const candidate = usage as UsageCandidate;

  if (!isFiniteNumber(candidate.total_tokens)) return false;
  if (!isFiniteNumber(candidate.input_tokens)) return false;
  if (!isFiniteNumber(candidate.output_tokens)) return false;

  const cachedTokens = readCachedTokens(candidate.input_tokens_details);
  if (!cachedTokens.valid) return false;

  const reasoningTokens = readReasoningTokens(candidate.output_tokens_details);
  if (!reasoningTokens.valid) return false;

  const counts = [
    candidate.total_tokens,
    candidate.input_tokens,
    candidate.output_tokens,
    cachedTokens.value,
    reasoningTokens.value,
  ].filter(isFiniteNumber);

  if (!counts.length) {
    return false;
  }

  return counts.every((value) => value === 0);
}

function outputIsReasoningOnly(output: Response['output'] | null | undefined): boolean {
  if (!Array.isArray(output) || output.length === 0) {
    return false;
  }

  return output.every((item) => item?.type === 'reasoning');
}

interface DetailValidationSuccess {
  readonly valid: true;
  readonly value?: number;
}

interface DetailValidationFailure {
  readonly valid: false;
}

type DetailValidationResult = DetailValidationSuccess | DetailValidationFailure;

function readCachedTokens(details: unknown): DetailValidationResult {
  if (details === undefined) {
    return { valid: true };
  }

  if (details === null || typeof details !== 'object') {
    return { valid: false };
  }

  const value = (details as CachedTokensCandidate).cached_tokens;
  if (value === undefined) {
    return { valid: true };
  }

  return isFiniteNumber(value) ? { valid: true, value } : { valid: false };
}

function readReasoningTokens(details: unknown): DetailValidationResult {
  if (details === undefined) {
    return { valid: true };
  }

  if (details === null || typeof details !== 'object') {
    return { valid: false };
  }

  const value = (details as ReasoningTokensCandidate).reasoning_tokens;
  if (value === undefined) {
    return { valid: true };
  }

  return isFiniteNumber(value) ? { valid: true, value } : { valid: false };
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
