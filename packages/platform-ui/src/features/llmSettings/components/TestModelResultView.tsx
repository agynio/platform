import { type ReactElement } from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import type { LiteLLMHealthResponse } from '@/api/modules/llmSettings';
import { getLiteLLMFailureMessage, isSuccessfulLiteLLMResponse } from '../utils';

export type TestModelErrorState = {
  message: string;
  payload?: unknown;
};

function formatTestModelPayload(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

interface TestModelResultViewProps {
  result?: LiteLLMHealthResponse;
  error?: TestModelErrorState;
}

export function TestModelResultView({ result, error }: TestModelResultViewProps): ReactElement {
  const success = isSuccessfulLiteLLMResponse(result);
  const payload = success ? result : error?.payload ?? result;
  const payloadText = formatTestModelPayload(payload);
  const statusText = success ? 'Test succeeded' : 'Test failed';
  const detailMessage = success ? undefined : error?.message ?? getLiteLLMFailureMessage(result);
  const statusColorClass = success ? 'text-[var(--agyn-status-finished)]' : 'text-[var(--agyn-status-failed)]';

  return (
    <div className="space-y-3 text-sm">
      <div className="flex items-center gap-2">
        {success ? (
          <CheckCircle2 className={`h-5 w-5 ${statusColorClass}`} aria-hidden />
        ) : (
          <AlertTriangle className={`h-5 w-5 ${statusColorClass}`} aria-hidden />
        )}
        <p className="font-semibold text-[var(--agyn-dark)]">{statusText}</p>
      </div>
      {detailMessage ? <p className="pl-7 text-sm text-[var(--agyn-text-subtle)]">{detailMessage}</p> : null}
      {payloadText ? (
        <pre className="ml-7 max-h-72 overflow-auto rounded border border-border bg-background px-3 py-2 font-mono text-xs leading-relaxed whitespace-pre-wrap break-words">
          {payloadText}
        </pre>
      ) : null}
    </div>
  );
}
