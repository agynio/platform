import { McpToolCallResult } from './types';

// Construct a readable MCP error message consistently across call sites.
// Prefer structuredContent.message/error/detail; include optional code/retriable; cap JSON fallback length.
export function buildMcpToolError(res: McpToolCallResult): { message: string; cause: unknown } {
  const MAX_JSON_LEN = 2000;
  const sc: any = res?.structuredContent;
  const content = res?.content;
  let msgBase = 'MCP tool call failed';
  let details = '';

  if (sc && typeof sc === 'object') {
    const m = typeof sc.message === 'string' ? sc.message : undefined;
    const e = typeof sc.error === 'string' ? sc.error : undefined;
    const d = typeof sc.detail === 'string' ? sc.detail : undefined;
    msgBase = m || e || d || msgBase;
    const code = sc.code ?? sc.errorCode ?? sc.statusCode;
    const retriable = sc.retriable ?? sc.retryable;
    const parts: string[] = [];
    if (code != null) parts.push(`code=${String(code)}`);
    if (retriable != null) parts.push(`retriable=${Boolean(retriable)}`);
    if (parts.length) details = ` (${parts.join(' ')})`;
  } else if (typeof content === 'string' && content.trim()) {
    msgBase = content.trim();
  } else if (res?.raw) {
    try {
      const rawStr = JSON.stringify(res.raw);
      const trunc = rawStr.length > MAX_JSON_LEN ? rawStr.slice(0, MAX_JSON_LEN) + '…' : rawStr;
      msgBase = `${msgBase}: ${trunc}`;
    } catch {}
  }

  // Cause carries structured details or next best fallback (content/raw)
  const cause = sc ?? content ?? res?.raw;
  return { message: `${msgBase}${details}`, cause };
}

