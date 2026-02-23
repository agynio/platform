import type { ContextItem } from '@/api/types/agents';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export function coerceRecord(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

export function parseMaybeJson(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch (_error) {
    return value;
  }
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

export function toRecordArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  const result: Record<string, unknown>[] = [];
  for (const item of value) {
    const record = coerceRecord(item);
    if (record) result.push(record);
  }
  return result;
}

export function normalizeMetadata(value: unknown): Record<string, unknown> | null {
  const parsed = parseMaybeJson(value);
  return coerceRecord(parsed);
}

export function parseContextItemContent(item: ContextItem): {
  parsed: unknown;
  record: Record<string, unknown> | null;
  text: string | null;
} {
  const parsedContent = item.contentJson ?? (isNonEmptyString(item.contentText) ? parseMaybeJson(item.contentText) : undefined);
  const record = coerceRecord(parsedContent);

  const stringCandidates: Array<string | null> = [];
  if (record && typeof record.content === 'string' && record.content.length > 0) stringCandidates.push(record.content);
  if (record && typeof record.response === 'string' && record.response.length > 0) stringCandidates.push(record.response);
  if (typeof parsedContent === 'string' && parsedContent.length > 0) stringCandidates.push(parsedContent);
  if (isNonEmptyString(item.contentText)) stringCandidates.push(item.contentText);

  const text = stringCandidates.find((candidate): candidate is string => typeof candidate === 'string' && candidate.trim().length > 0) ?? null;

  return { parsed: parsedContent, record, text };
}

export function collectToolCalls(
  primary: Record<string, unknown> | null,
  primaryAdditionalKwargs: Record<string, unknown> | null,
  metadata: Record<string, unknown> | null,
  metadataAdditionalKwargs: Record<string, unknown> | null,
): Record<string, unknown>[] {
  const seen = new Set<string>();
  const result: Record<string, unknown>[] = [];

  const addRecords = (value: unknown) => {
    if (value === undefined || value === null) return;
    const normalized = typeof value === 'string' ? parseMaybeJson(value) : value;
    for (const record of toRecordArray(normalized)) {
      const key = (() => {
        try {
          return JSON.stringify(record);
        } catch (_err) {
          return undefined;
        }
      })();
      if (key && seen.has(key)) continue;
      if (key) seen.add(key);
      result.push(record);
    }
  };

  if (primary) {
    addRecords(primary.tool_calls);
    addRecords(primary.toolCalls);
  }
  if (primaryAdditionalKwargs) {
    addRecords(primaryAdditionalKwargs.tool_calls);
    addRecords(primaryAdditionalKwargs.toolCalls);
  }
  if (metadata) {
    addRecords(metadata.tool_calls);
    addRecords(metadata.toolCalls);
  }
  if (metadataAdditionalKwargs) {
    addRecords(metadataAdditionalKwargs.tool_calls);
    addRecords(metadataAdditionalKwargs.toolCalls);
  }

  const synthesizeFromOutput = (container?: Record<string, unknown> | null) => {
    if (!container) return;
    const outputEntries = Array.isArray(container.output) ? (container.output as unknown[]) : [];
    for (const entry of outputEntries) {
      const rec = coerceRecord(entry);
      if (!rec) continue;
      if (rec.type !== 'function_call') continue;

      const funcRec = coerceRecord(rec.function);
      const rawArgs = rec.arguments ?? funcRec?.arguments;
      const normArgs = typeof rawArgs === 'string' ? parseMaybeJson(rawArgs) : rawArgs;

      const synthesized: Record<string, unknown> = {
        callId: isNonEmptyString(rec.call_id)
          ? rec.call_id
          : isNonEmptyString(rec.id)
            ? rec.id
            : undefined,
        name: isNonEmptyString(rec.name)
          ? rec.name
          : isNonEmptyString(funcRec?.name)
            ? funcRec.name
            : undefined,
        arguments: normArgs,
      };

      const key = (() => {
        try {
          return JSON.stringify(synthesized);
        } catch (_err) {
          return undefined;
        }
      })();
      if (key && seen.has(key)) continue;
      if (key) seen.add(key);
      result.push(synthesized);
    }
  };

  synthesizeFromOutput(primary);
  synthesizeFromOutput(primaryAdditionalKwargs);
  synthesizeFromOutput(metadata);
  synthesizeFromOutput(metadataAdditionalKwargs);

  return result;
}

export function extractReasoning(
  primary: Record<string, unknown> | null,
  primaryAdditionalKwargs: Record<string, unknown> | null,
  metadata: Record<string, unknown> | null,
  metadataAdditionalKwargs: Record<string, unknown> | null,
): unknown {
  const candidates: unknown[] = [];
  if (primary) candidates.push(primary.reasoning);
  if (primaryAdditionalKwargs) candidates.push(primaryAdditionalKwargs.reasoning);
  if (metadata) candidates.push(metadata.reasoning);
  if (metadataAdditionalKwargs) candidates.push(metadataAdditionalKwargs.reasoning);

  for (const candidate of candidates) {
    if (candidate === undefined) continue;
    if (candidate === null) return null;
    if (typeof candidate === 'string') {
      const parsed = parseMaybeJson(candidate);
      return parsed;
    }
    return candidate;
  }

  return undefined;
}

export function toContextRecord(item: ContextItem): Record<string, unknown> {
  const metadataRecord = normalizeMetadata(item.metadata);
  const metadataAdditionalKwargs = metadataRecord ? coerceRecord(metadataRecord.additional_kwargs) : null;
  const { parsed: parsedContent, record: parsedRecord, text: textContent } = parseContextItemContent(item);
  const contentAdditionalKwargs = parsedRecord ? coerceRecord(parsedRecord.additional_kwargs) : null;

  const result: Record<string, unknown> = parsedRecord ? { ...parsedRecord } : {};

  if (!isNonEmptyString(result.id)) {
    result.id = item.id;
  }
  result.role = typeof result.role === 'string' && result.role.length > 0 ? result.role : item.role;
  result.timestamp = result.timestamp ?? item.createdAt;
  result.sizeBytes = item.sizeBytes;
  result.contentJson = parsedContent;
  result.metadata = metadataRecord ?? item.metadata;

  const normalizedText = typeof textContent === 'string' && textContent.length > 0
    ? textContent
    : isNonEmptyString(item.contentText)
      ? item.contentText
      : null;

  if (normalizedText !== null) {
    result.contentText = normalizedText;
  } else if ('contentText' in result && typeof result.contentText !== 'string') {
    delete result.contentText;
  }

  const hasStringContent = typeof normalizedText === 'string' && normalizedText.length > 0;

  if (result.role === 'assistant') {
    if (hasStringContent) {
      result.content = normalizedText;
      if (typeof result.response !== 'string' || result.response.length === 0) {
        result.response = normalizedText;
      }
    } else {
      if (typeof result.content !== 'string') delete result.content;
      if (typeof result.response !== 'string') delete result.response;
    }
  } else if (hasStringContent) {
    if (typeof result.content !== 'string' || result.content.length === 0) {
      result.content = normalizedText;
    }
  }

  const mergedAdditionalKwargs = contentAdditionalKwargs ?? metadataAdditionalKwargs;
  if (mergedAdditionalKwargs) {
    result.additional_kwargs = mergedAdditionalKwargs;
  }

  const toolCalls = collectToolCalls(parsedRecord, contentAdditionalKwargs, metadataRecord, metadataAdditionalKwargs);

  if (toolCalls.length > 0) {
    result.tool_calls = toolCalls;
    result.toolCalls = toolCalls;
  }

  const reasoning = extractReasoning(parsedRecord, contentAdditionalKwargs, metadataRecord, metadataAdditionalKwargs);
  if (reasoning !== undefined) {
    result.reasoning = reasoning;
  }

  return result;
}
