import { McpToolCallResult } from './types';

// Build a readable MCP error string and include structured details as the cause for diagnostics.
// Precedence: top-level message > string error > nested error.message > detail.
// Also surfaces code/retriable (from top-level or nested variants) in a compact suffix.
// If neither structuredContent nor content is available, falls back to a truncated JSON dump of `raw`.
// The raw JSON is capped at 2000 chars to avoid log spam and token bloat in downstream summaries.
export function buildMcpToolError(res: McpToolCallResult): { message: string; cause: unknown } {
  const MAX_JSON_LEN = 2000;

  const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
  const toBool = (v: unknown): boolean | undefined => {
    if (v == null) return undefined;
    if (typeof v === 'boolean') return v;
    if (typeof v === 'string') return v.toLowerCase() === 'true';
    if (typeof v === 'number') return v !== 0;
    return !!v;
  };

  const scUnknown: unknown = res?.structuredContent as unknown;
  const content = res?.content;
  let msgBase = 'MCP tool call failed';
  let metaSuffix = '';

  if (isRecord(scUnknown)) {
    const m = typeof scUnknown.message === 'string' ? scUnknown.message : undefined;
    const errVal = scUnknown.error as unknown;
    const eObj = isRecord(errVal) ? errVal : undefined; // ignore arrays
    const eStr = typeof errVal === 'string' ? errVal : undefined;
    const eObjMsg = typeof eObj?.message === 'string' ? (eObj.message as string) : undefined;
    const d = typeof scUnknown.detail === 'string' ? scUnknown.detail : undefined;
    // Prefer top-level message, then string error, then nested error.message, then detail
    msgBase = m || eStr || eObjMsg || d || msgBase;

    // Collect code/retriable from either top-level or nested error object using common aliases
    const codeUnknown =
      scUnknown['code'] ?? scUnknown['errorCode'] ?? scUnknown['statusCode'] ?? eObj?.['code'] ?? eObj?.['errorCode'] ?? eObj?.['statusCode'];
    const retriableUnknown =
      scUnknown['retriable'] ?? scUnknown['retryable'] ?? eObj?.['retriable'] ?? eObj?.['retryable'];

    const parts: string[] = [];
    if (codeUnknown != null) parts.push(`code=${String(codeUnknown)}`);
    const r = toBool(retriableUnknown);
    if (r !== undefined) parts.push(`retriable=${r}`);
    if (parts.length) metaSuffix = ` (${parts.join(' ')})`;
  } else if (typeof content === 'string' && content.trim()) {
    msgBase = content.trim();
  } else if (res?.raw !== undefined) {
    try {
      const rawStr = JSON.stringify(res.raw);
      const trunc = rawStr.length > MAX_JSON_LEN ? rawStr.slice(0, MAX_JSON_LEN) + '…' : rawStr;
      msgBase = `${msgBase}: ${trunc}`;
    } catch {
      // ignore stringify errors; keep default message
    }
  }

  // Cause carries structured details or next best fallback (content/raw)
  const cause = isRecord(scUnknown) ? scUnknown : content ?? res?.raw;
  return { message: `${msgBase}${metaSuffix}`, cause };
}
