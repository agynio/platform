import type { ContextItem, RunTimelineEvent } from '@/api/types/agents';
import { gatherToolCalls } from '@/lib/toolCalls';

type RecordLike = Record<string, unknown>;

const isRecordLike = (value: unknown): value is RecordLike => typeof value === 'object' && value !== null && !Array.isArray(value);

const coerceRecord = (value: unknown): RecordLike | null => {
  if (!isRecordLike(value)) return null;
  return value as RecordLike;
};

const parseMaybeJson = (value: unknown): unknown => {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch (_err) {
    return value;
  }
};

const isNonEmptyString = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;

const parseAdditionalKwargs = (value: unknown): RecordLike | null => {
  if (!value) return null;
  const parsed = parseMaybeJson(value);
  return coerceRecord(parsed);
};

const extractTextCandidate = (value: unknown, visited: WeakSet<object>): string | null => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? value : null;
  }

  if (Array.isArray(value)) {
    const segments: string[] = [];
    for (const entry of value) {
      const text = extractTextCandidate(entry, visited);
      if (typeof text === 'string' && text.length > 0) segments.push(text);
    }
    if (segments.length > 0) return segments.join('\n\n');
    return null;
  }

  const record = coerceRecord(value);
  if (!record) return null;
  if (visited.has(record)) return null;
  visited.add(record);

  const candidateKeys: Array<keyof RecordLike> = ['text', 'content', 'response'];
  for (const key of candidateKeys) {
    if (!(key in record)) continue;
    const text = extractTextCandidate(record[key], visited);
    if (typeof text === 'string' && text.length > 0) return text;
  }

  return null;
};

const resolveTextFromCandidates = (candidates: unknown[]): string | null => {
  for (const candidate of candidates) {
    const text = extractTextCandidate(candidate, new WeakSet<object>());
    if (isNonEmptyString(text)) return text;
  }
  return null;
};

export type AssistantContextSnapshot = {
  id: string | null;
  text: string | null;
  toolCalls: Record<string, unknown>[];
};

const deriveAssistantData = ({
  explicitText,
  primaryRecord,
  contentJson,
  metadata,
}: {
  explicitText: string | null;
  primaryRecord: RecordLike | null;
  contentJson: unknown;
  metadata: unknown;
}): { text: string | null; toolCalls: Record<string, unknown>[] } => {
  const parsedContent = parseMaybeJson(contentJson);
  const contentRecord = coerceRecord(parsedContent);
  const metadataRecord = coerceRecord(parseMaybeJson(metadata));

  let text: string | null = isNonEmptyString(explicitText) ? explicitText : null;

  if (!text) {
    const candidates: unknown[] = [];
    if (primaryRecord) {
      if (isNonEmptyString(primaryRecord.contentText)) candidates.push(primaryRecord.contentText);
      if ('content' in primaryRecord) candidates.push(primaryRecord.content);
      if ('response' in primaryRecord) candidates.push(primaryRecord.response);
    }
    if (contentRecord) {
      if ('content' in contentRecord) candidates.push(contentRecord.content);
      if ('response' in contentRecord) candidates.push(contentRecord.response);
    } else {
      candidates.push(parsedContent);
    }
    text = resolveTextFromCandidates(candidates);
  }

  const gatherSources: unknown[] = [];
  if (primaryRecord) {
    gatherSources.push(primaryRecord);
    const additional = parseAdditionalKwargs(primaryRecord.additional_kwargs);
    if (additional) gatherSources.push(additional);
  }
  if (contentRecord && contentRecord !== primaryRecord) {
    gatherSources.push(contentRecord);
    const additional = parseAdditionalKwargs(contentRecord.additional_kwargs);
    if (additional) gatherSources.push(additional);
  }
  if (metadataRecord) {
    gatherSources.push(metadataRecord);
    const additional = parseAdditionalKwargs(metadataRecord.additional_kwargs);
    if (additional) gatherSources.push(additional);
  }

  const toolCalls = gatherSources.length > 0 ? gatherToolCalls(...gatherSources) : [];

  return { text: text ?? null, toolCalls };
};

export const deriveAssistantContextFromItems = (items: readonly ContextItem[]): AssistantContextSnapshot => {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];
    if (!item || item.role !== 'assistant') continue;
    const explicitText = typeof item.contentText === 'string' ? item.contentText : null;
    const { text, toolCalls } = deriveAssistantData({
      explicitText,
      primaryRecord: null,
      contentJson: item.contentJson,
      metadata: item.metadata,
    });
    return {
      id: typeof item.id === 'string' ? item.id : null,
      text,
      toolCalls,
    };
  }
  return { id: null, text: null, toolCalls: [] };
};

export const deriveAssistantContextFromRecords = (records: readonly Record<string, unknown>[]): AssistantContextSnapshot => {
  for (let index = records.length - 1; index >= 0; index -= 1) {
    const record = coerceRecord(records[index]);
    if (!record) continue;
    const role = typeof record.role === 'string' ? record.role : null;
    if (role !== 'assistant') continue;
    const explicitText = typeof record.contentText === 'string' ? record.contentText : null;
    const { text, toolCalls } = deriveAssistantData({
      explicitText,
      primaryRecord: record,
      contentJson: record.contentJson,
      metadata: record.metadata,
    });
    const identifier = typeof record.id === 'string' ? record.id : null;
    return {
      id: identifier,
      text,
      toolCalls,
    };
  }
  return { id: null, text: null, toolCalls: [] };
};

export const extractTextFromRawResponse = (raw: unknown, options?: { ignoreMessage?: boolean }): string | null => {
  const ignoreMessage = options?.ignoreMessage === true;
  const visited = new WeakSet<object>();

  const extract = (value: unknown): string | null => {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed.length > 0 ? value : null;
    }

    if (Array.isArray(value)) {
      const parts: string[] = [];
      for (const item of value) {
        const text = extract(item);
        if (typeof text === 'string' && text.length > 0) {
          parts.push(text);
        }
      }
      if (parts.length > 0) {
        return parts.join('\n\n');
      }
      return null;
    }

    const record = coerceRecord(value);
    if (!record) return null;
    if (visited.has(record)) return null;
    visited.add(record);

    const directKeys: Array<keyof RecordLike> = ['content', 'text', 'output_text', 'outputText'];
    for (const key of directKeys) {
      if (key in record) {
        const text = extract(record[key]);
        if (typeof text === 'string' && text.length > 0) return text;
      }
    }

    if (!ignoreMessage) {
      if ('message' in record) {
        const text = extract((record as RecordLike).message);
        if (typeof text === 'string' && text.length > 0) return text;
      }

      if ('messages' in record) {
        const text = extract((record as RecordLike).messages);
        if (typeof text === 'string' && text.length > 0) return text;
      }
    }

    const arrayKeys: Array<keyof RecordLike> = ['choices', 'outputs', 'output', 'responses'];
    for (const key of arrayKeys) {
      if (Array.isArray(record[key])) {
        for (const entry of record[key] as unknown[]) {
          const text = extract(entry);
          if (typeof text === 'string' && text.length > 0) return text;
        }
      }
    }

    if ('delta' in record) {
      const text = extract((record as RecordLike).delta);
      if (typeof text === 'string' && text.length > 0) return text;
    }

    const nestedKeys: Array<keyof RecordLike> = ['data', 'body', 'result', 'response', 'value'];
    for (const key of nestedKeys) {
      if (key in record) {
        const text = extract(record[key]);
        if (typeof text === 'string' && text.length > 0) return text;
      }
    }

    return null;
  };

  return extract(raw);
};

export const extractLlmResponse = (event: RunTimelineEvent): string => {
  if (isNonEmptyString(event.errorMessage)) {
    return event.errorMessage;
  }

  const llmCall = event.llmCall;
  if (!llmCall) return '';

  const responseText = llmCall.responseText;
  if (isNonEmptyString(responseText)) return responseText;

  const rawResponse = llmCall.rawResponse;
  if (rawResponse !== null && rawResponse !== undefined) {
    if (typeof rawResponse === 'string') {
      const trimmed = rawResponse.trim();
      if (trimmed.length > 0) return trimmed;
    }

    const record = coerceRecord(rawResponse);
    if (record) {
      const candidateKeys: Array<keyof RecordLike> = ['output', 'outputs', 'responses', 'choices', 'result', 'response', 'value'];
      for (const key of candidateKeys) {
        if (!(key in record)) continue;
        const text = extractTextFromRawResponse(record[key], { ignoreMessage: key !== 'choices' });
        if (isNonEmptyString(text)) return text;
      }
    }

    const rawText = extractTextFromRawResponse(rawResponse, { ignoreMessage: true });
    if (isNonEmptyString(rawText)) return rawText;
  }

  if (Array.isArray(event.attachments)) {
    for (const attachment of event.attachments) {
      if (!attachment || attachment.kind !== 'response') continue;

      const candidates: unknown[] = [];
      if (attachment.contentText !== undefined && attachment.contentText !== null) {
        const parsedText = typeof attachment.contentText === 'string' ? parseMaybeJson(attachment.contentText) : attachment.contentText;
        candidates.push(parsedText);
      }
      if (attachment.contentJson !== undefined && attachment.contentJson !== null) {
        const parsedJson = typeof attachment.contentJson === 'string' ? parseMaybeJson(attachment.contentJson) : attachment.contentJson;
        candidates.push(parsedJson);
      }

      for (const candidate of candidates) {
        const text = extractTextFromRawResponse(candidate, { ignoreMessage: true });
        if (isNonEmptyString(text)) return text;
      }
    }
  }

  return '';
};

export const __testing__ = {
  extractTextFromRawResponse,
  extractLlmResponse,
};
