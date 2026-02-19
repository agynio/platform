import type { LiteLLMHealthResponse } from '@/api/modules/llmSettings';

function normalizeStatus(value?: string | null): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

export function isSuccessfulLiteLLMResponse(result?: LiteLLMHealthResponse | null): boolean {
  return normalizeStatus(result?.status) === 'success';
}

export function describeLiteLLMStatus(result?: LiteLLMHealthResponse | null): string {
  const rawStatus = typeof result?.status === 'string' ? result.status.trim() : '';
  if (!rawStatus) return 'LiteLLM returned an unknown status.';
  if (normalizeStatus(rawStatus) === 'error') {
    return 'LiteLLM reported an error status.';
  }
  return `LiteLLM returned unexpected status "${rawStatus}".`;
}

export function getLiteLLMFailureMessage(result?: LiteLLMHealthResponse | null): string {
  const detail = typeof result?.message === 'string' ? result.message.trim() : '';
  if (detail) return detail;
  return describeLiteLLMStatus(result);
}
