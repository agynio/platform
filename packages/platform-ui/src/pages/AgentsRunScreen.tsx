import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import RunScreen, { type EventFilter, type StatusFilter } from '@/components/screens/RunScreen';
import type { RunEvent as UiRunEvent } from '@/components/RunEventsList';
import type { Status } from '@/components/StatusIndicator';
import { useRunTimelineEvents, useRunTimelineSummary } from '@/api/hooks/runs';
import { contextItems } from '@/api/modules/contextItems';
import { runs } from '@/api/modules/runs';
import type {
  ContextItem,
  RunEventStatus,
  RunEventType,
  RunTimelineEvent,
  RunTimelineEventsCursor,
  RunTimelineEventsResponse,
} from '@/api/types/agents';
import { graphSocket } from '@/lib/graph/socket';
import { notifyError, notifySuccess } from '@/lib/notify';
import { formatDuration } from '@/components/agents/runTimelineFormatting';

const EVENT_FILTER_OPTIONS: EventFilter[] = ['message', 'llm', 'tool', 'summary'];
const STATUS_FILTER_OPTIONS: StatusFilter[] = ['running', 'finished', 'failed', 'terminated'];
const API_EVENT_TYPES: RunEventType[] = ['invocation_message', 'injection', 'llm_call', 'tool_execution', 'summarization'];
const API_EVENT_STATUSES: RunEventStatus[] = ['pending', 'running', 'success', 'error', 'cancelled'];

const EVENT_FILTER_TO_TYPES: Record<EventFilter, RunEventType[]> = {
  message: ['invocation_message', 'injection'],
  llm: ['llm_call'],
  tool: ['tool_execution'],
  summary: ['summarization'],
};

const STATUS_FILTER_TO_STATUSES: Record<StatusFilter, RunEventStatus[]> = {
  running: ['pending', 'running'],
  finished: ['success'],
  failed: ['error'],
  terminated: ['cancelled'],
};

const GLOBAL_FOLLOW_STORAGE_KEY = 'ui.timeline.follow.enabled';
const LEGACY_FOLLOW_STORAGE_PREFIX = 'timeline-follow:';

function parseFollowValue(value: string | null): boolean | null {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return null;
}

function readLegacyFollowFromStorage(runId: string | undefined): boolean | null {
  if (!runId || typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(`${LEGACY_FOLLOW_STORAGE_PREFIX}${runId}`);
  return parseFollowValue(raw);
}

function readGlobalFollowFromStorage(): boolean | null {
  if (typeof window === 'undefined') return null;
  return parseFollowValue(window.localStorage.getItem(GLOBAL_FOLLOW_STORAGE_KEY));
}

function writeGlobalFollowToStorage(value: boolean) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(GLOBAL_FOLLOW_STORAGE_KEY, value ? 'true' : 'false');
}

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => (typeof window !== 'undefined' ? window.matchMedia(query).matches : false));

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mql = window.matchMedia(query);
    const handler = (event: MediaQueryListEvent) => setMatches(event.matches);
    setMatches(mql.matches);
    if (typeof mql.addEventListener === 'function') {
      mql.addEventListener('change', handler);
      return () => mql.removeEventListener('change', handler);
    }
    mql.addListener(handler);
    return () => mql.removeListener(handler);
  }, [query]);

  return matches;
}

function parseTimestamp(value: string): number {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
}

function compareEvents(a: RunTimelineEvent, b: RunTimelineEvent): number {
  const timeDiff = parseTimestamp(a.ts) - parseTimestamp(b.ts);
  if (timeDiff !== 0) return timeDiff;
  const lexical = a.ts.localeCompare(b.ts);
  if (lexical !== 0) return lexical;
  return a.id.localeCompare(b.id);
}

function sortEvents(events: RunTimelineEvent[]): RunTimelineEvent[] {
  if (events.length <= 1) return events.slice();
  return [...events].sort(compareEvents);
}

function matchesFilters(event: RunTimelineEvent, types: RunEventType[], statuses: RunEventStatus[]): boolean {
  const includeType = types.length === 0 || types.includes(event.type);
  const includeStatus = statuses.length === 0 || statuses.includes(event.status);
  return includeType && includeStatus;
}

function areEventListsEqual(a: RunTimelineEvent[], b: RunTimelineEvent[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function buildCursorAttemptModes(preferred: 'both' | 'plain' | 'bracketed'): Array<'both' | 'plain' | 'bracketed'> {
  if (preferred === 'both') return ['both', 'plain'];
  const fallback = preferred === 'plain' ? 'bracketed' : 'plain';
  return [preferred, fallback];
}

function compareCursors(a: RunTimelineEventsCursor, b: RunTimelineEventsCursor): number {
  const timeDiff = parseTimestamp(a.ts) - parseTimestamp(b.ts);
  if (timeDiff !== 0) return timeDiff;
  const lexical = a.ts.localeCompare(b.ts);
  if (lexical !== 0) return lexical;
  return a.id.localeCompare(b.id);
}

function isNonAdvancingPage(response: RunTimelineEventsResponse, cursor: RunTimelineEventsCursor): boolean {
  const items = response.items ?? [];
  const lastMatches = items.length > 0 && compareCursors(toCursor(items[items.length - 1]), cursor) === 0;
  const nextMatches = response.nextCursor ? compareCursors(response.nextCursor, cursor) === 0 : false;
  return lastMatches || nextMatches;
}

function toCursor(event: RunTimelineEvent): RunTimelineEventsCursor {
  return { ts: event.ts, id: event.id };
}

function mapEventStatus(status: RunEventStatus): Status {
  switch (status) {
    case 'pending':
      return 'pending';
    case 'running':
      return 'running';
    case 'success':
      return 'finished';
    case 'error':
      return 'failed';
    case 'cancelled':
    default:
      return 'terminated';
  }
}

function mapRunStatus(status: 'running' | 'finished' | 'terminated' | undefined): Status {
  if (status === 'finished') return 'finished';
  if (status === 'terminated') return 'terminated';
  return 'running';
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString();
}

function formatDurationLabel(ms: number | null): string | undefined {
  if (ms === null || ms === undefined) return undefined;
  const label = formatDuration(ms);
  return label === '—' ? undefined : label;
}

type TokenTotals = {
  input: number;
  cached: number;
  output: number;
  reasoning: number;
  total: number;
};

const EMPTY_TOKENS: TokenTotals = { input: 0, cached: 0, output: 0, reasoning: 0, total: 0 };

function aggregateTokens(events: RunTimelineEvent[]): TokenTotals {
  return events.reduce<TokenTotals>((acc, event) => {
    if (event.type !== 'llm_call' || !event.llmCall?.usage) return acc;
    const usage = event.llmCall.usage;
    const next = { ...acc };
    next.input += usage.inputTokens ?? 0;
    next.cached += usage.cachedInputTokens ?? 0;
    next.output += usage.outputTokens ?? 0;
    next.reasoning += usage.reasoningTokens ?? 0;
    const total = usage.totalTokens;
    if (typeof total === 'number' && Number.isFinite(total)) {
      next.total += total;
    } else {
      next.total += (usage.inputTokens ?? 0) + (usage.cachedInputTokens ?? 0) + (usage.outputTokens ?? 0) + (usage.reasoningTokens ?? 0);
    }
    return next;
  }, { ...EMPTY_TOKENS });
}

function inferToolSubtype(toolName: string | undefined, input: unknown): 'shell' | 'manage' | 'generic' {
  const normalized = (toolName ?? '').toLowerCase();
  if (normalized.includes('shell') || normalized.includes('command') || normalized.includes('exec')) {
    return 'shell';
  }
  if (normalized.includes('manage') || normalized.includes('delegate') || normalized.includes('call_agent')) {
    return 'manage';
  }
  if (typeof input === 'object' && input !== null) {
    const candidate = input as Record<string, unknown>;
    if (typeof candidate.command === 'string' && typeof candidate.worker === 'string') {
      return 'manage';
    }
    if (typeof candidate.command === 'string' || typeof candidate.cwd === 'string') {
      return 'shell';
    }
  }
  return 'generic';
}

function coerceRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) return value as Record<string, unknown>;
  return null;
}

function parseMaybeJson(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch (_error) {
    return value;
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

type LinkTargets = {
  threadId?: string;
  subthreadId?: string;
  runId?: string;
  childThreadId?: string;
  childRunId?: string;
};

type ToolLinkData = {
  input: unknown;
  output: unknown;
  threadId?: string;
  subthreadId?: string;
  runId?: string;
  childThreadId?: string;
  childRunId?: string;
};

type LlmToolCall = NonNullable<RunTimelineEvent['llmCall']>['toolCalls'][number];

function readStringPath(record: Record<string, unknown>, path: readonly string[]): string | undefined {
  let current: unknown = record;
  for (const segment of path) {
    if (!current || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return isNonEmptyString(current) ? current : undefined;
}

function extractLinkTargets(record: Record<string, unknown> | null): LinkTargets {
  if (!record) return {};

  const childRunRecord = coerceRecord(record.childRun);

  const directChildThreadId = readStringPath(record, ['childThreadId']) ?? readStringPath(record, ['child_thread_id']);
  const aliasChildThreadId =
    readStringPath(record, ['threadId']) ??
    readStringPath(record, ['thread_id']) ??
    readStringPath(record, ['subthreadId']) ??
    readStringPath(record, ['subthread_id']);
  const nestedChildThreadId =
    readStringPath(record, ['childThread', 'id']) ??
    readStringPath(record, ['child_thread', 'id']) ??
    readStringPath(record, ['thread', 'id']) ??
    readStringPath(record, ['thread', 'threadId']) ??
    readStringPath(record, ['thread', 'thread_id']);

  const directChildRunId = readStringPath(record, ['childRunId']) ?? readStringPath(record, ['child_run_id']);
  const aliasChildRunId = readStringPath(record, ['runId']) ?? readStringPath(record, ['run_id']);
  const nestedChildRunId =
    readStringPath(record, ['childRun', 'id']) ??
    readStringPath(record, ['child_run', 'id']) ??
    readStringPath(record, ['run', 'id']) ??
    readStringPath(record, ['run', 'runId']) ??
    readStringPath(record, ['run', 'run_id']) ??
    (childRunRecord ? readStringPath(childRunRecord, ['id']) : undefined);

  const subthreadId =
    readStringPath(record, ['subthreadId']) ??
    readStringPath(record, ['subthread_id']) ??
    readStringPath(record, ['subthread', 'id']) ??
    readStringPath(record, ['subthread', 'subthreadId']) ??
    readStringPath(record, ['subthread', 'subthread_id']);

  const threadId =
    readStringPath(record, ['threadId']) ??
    readStringPath(record, ['thread_id']) ??
    readStringPath(record, ['thread', 'id']) ??
    readStringPath(record, ['thread', 'threadId']) ??
    readStringPath(record, ['thread', 'thread_id']);

  const runId =
    readStringPath(record, ['runId']) ??
    readStringPath(record, ['run_id']) ??
    readStringPath(record, ['run', 'id']) ??
    readStringPath(record, ['run', 'runId']) ??
    readStringPath(record, ['run', 'run_id']);

  const childThreadId = directChildThreadId ?? aliasChildThreadId ?? nestedChildThreadId ?? subthreadId ?? threadId;
  const childRunId = directChildRunId ?? aliasChildRunId ?? nestedChildRunId ?? runId;

  return {
    threadId: threadId ?? childThreadId ?? undefined,
    subthreadId: subthreadId ?? undefined,
    runId: runId ?? childRunId ?? undefined,
    childThreadId: childThreadId ?? undefined,
    childRunId: childRunId ?? undefined,
  };
}

function normalizeRecordWithTargets(record: Record<string, unknown> | null, targets: LinkTargets): Record<string, unknown> | null {
  if (!record) return null;
  let changed = false;
  const next: Record<string, unknown> = { ...record };

  const normalizedChildThreadId = targets.childThreadId ?? targets.threadId ?? targets.subthreadId;
  const normalizedChildRunId = targets.childRunId ?? targets.runId;

  if (targets.threadId && !isNonEmptyString(next.threadId)) {
    next.threadId = targets.threadId;
    changed = true;
  }
  if (targets.subthreadId && !isNonEmptyString(next.subthreadId)) {
    next.subthreadId = targets.subthreadId;
    changed = true;
  }
  if (targets.runId && !isNonEmptyString(next.runId)) {
    next.runId = targets.runId;
    changed = true;
  }
  if (normalizedChildThreadId && !isNonEmptyString(next.childThreadId)) {
    next.childThreadId = normalizedChildThreadId;
    changed = true;
  }
  if (normalizedChildRunId && !isNonEmptyString(next.childRunId)) {
    next.childRunId = normalizedChildRunId;
    changed = true;
  }

  return changed ? next : record;
}

function parseContextItemContent(item: ContextItem): {
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

function normalizeMetadata(value: unknown): Record<string, unknown> | null {
  const parsed = parseMaybeJson(value);
  return coerceRecord(parsed);
}

function collectToolCalls(
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

  return result;
}

function extractReasoning(
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

function extractTextFromRawResponse(raw: unknown): string | null {
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

    const directKeys: Array<keyof typeof record> = ['content', 'text', 'output_text', 'outputText'];
    for (const key of directKeys) {
      if (key in record) {
        const text = extract(record[key]);
        if (typeof text === 'string' && text.length > 0) return text;
      }
    }

    if ('message' in record) {
      const text = extract((record as Record<string, unknown>).message);
      if (typeof text === 'string' && text.length > 0) return text;
    }

    if ('messages' in record) {
      const text = extract((record as Record<string, unknown>).messages);
      if (typeof text === 'string' && text.length > 0) return text;
    }

    const arrayKeys: Array<keyof typeof record> = ['choices', 'outputs', 'output', 'responses'];
    for (const key of arrayKeys) {
      if (Array.isArray(record[key])) {
        for (const entry of record[key] as unknown[]) {
          const text = extract(entry);
          if (typeof text === 'string' && text.length > 0) return text;
        }
      }
    }

    if ('delta' in record) {
      const text = extract((record as Record<string, unknown>).delta);
      if (typeof text === 'string' && text.length > 0) return text;
    }

    const nestedKeys: Array<keyof typeof record> = ['data', 'body', 'result', 'response', 'value'];
    for (const key of nestedKeys) {
      if (key in record) {
        const text = extract(record[key]);
        if (typeof text === 'string' && text.length > 0) return text;
      }
    }

    return null;
  };

  return extract(raw);
}

function extractLlmResponse(event: RunTimelineEvent): string {
  if (isNonEmptyString(event.errorMessage)) {
    return event.errorMessage;
  }

  const llmCall = event.llmCall;
  if (!llmCall) return '';

  const responseText = llmCall.responseText;
  if (isNonEmptyString(responseText)) return responseText;

  const rawResponse = llmCall.rawResponse;
  if (rawResponse && typeof rawResponse === 'object') {
    const messageCandidate = (rawResponse as { message?: unknown }).message;
    const messageText = extractTextFromRawResponse(messageCandidate);
    if (isNonEmptyString(messageText)) return messageText;
  }

  const rawText = extractTextFromRawResponse(rawResponse);
  if (isNonEmptyString(rawText)) return rawText;

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
        const text = extractTextFromRawResponse(candidate);
        if (isNonEmptyString(text)) return text;
      }
    }
  }

  return '';
}

function toContextRecord(item: ContextItem, fallbackToolCalls?: readonly LlmToolCall[]): Record<string, unknown> {
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

  const collectedToolCalls = collectToolCalls(parsedRecord, contentAdditionalKwargs, metadataRecord, metadataAdditionalKwargs);
  let toolCalls: Record<string, unknown>[] = collectedToolCalls;

  if (toolCalls.length === 0 && result.role === 'assistant' && Array.isArray(fallbackToolCalls) && fallbackToolCalls.length > 0) {
    toolCalls = toRecordArray(fallbackToolCalls as unknown);
  }

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

function toRecordArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  const result: Record<string, unknown>[] = [];
  for (const item of value) {
    const record = coerceRecord(item);
    if (record) result.push(record);
  }
  return result;
}

function buildToolLinkData(event: RunTimelineEvent): ToolLinkData | undefined {
  const execution = event.toolExecution;
  if (!execution) return undefined;

  const rawInput = execution.input;
  const rawOutput = execution.output ?? execution.raw;
  const parsedInput = parseMaybeJson(rawInput);
  const parsedOutput = parseMaybeJson(rawOutput);
  const inputRecord = coerceRecord(parsedInput);
  const outputRecord = coerceRecord(parsedOutput);
  const metadataRecord = coerceRecord(event.metadata);

  const inputTargets = extractLinkTargets(inputRecord);
  const outputTargets = extractLinkTargets(outputRecord);
  const metadataTargets = extractLinkTargets(metadataRecord);

  const targets: LinkTargets = {
    threadId: metadataTargets.threadId ?? outputTargets.threadId ?? inputTargets.threadId,
    subthreadId: metadataTargets.subthreadId ?? outputTargets.subthreadId ?? inputTargets.subthreadId,
    runId: metadataTargets.runId ?? outputTargets.runId ?? inputTargets.runId,
    childThreadId: metadataTargets.childThreadId ?? outputTargets.childThreadId ?? inputTargets.childThreadId,
    childRunId: metadataTargets.childRunId ?? outputTargets.childRunId ?? inputTargets.childRunId,
  };

  const normalizedInputRecord = normalizeRecordWithTargets(inputRecord, targets);
  const normalizedOutputRecord = normalizeRecordWithTargets(outputRecord, targets);

  const normalizedInput = normalizedInputRecord ?? inputRecord ?? parsedInput;
  const normalizedOutput = normalizedOutputRecord ?? outputRecord ?? parsedOutput;

  return {
    input: normalizedInput,
    output: normalizedOutput,
    threadId: targets.threadId,
    subthreadId: targets.subthreadId,
    runId: targets.runId,
    childThreadId: targets.childThreadId ?? targets.threadId,
    childRunId: targets.childRunId ?? targets.runId,
  };
}

function resolveContextRecords(
  ids: readonly string[],
  lookup: Map<string, ContextItem>,
  fallbackToolCalls?: readonly LlmToolCall[],
): Record<string, unknown>[] {
  if (!Array.isArray(ids) || ids.length === 0) return [];
  const records: Record<string, unknown>[] = [];
  for (const id of ids) {
    if (!isNonEmptyString(id)) continue;
    const item = lookup.get(id);
    if (item) records.push(toContextRecord(item, fallbackToolCalls));
  }
  return records;
}

type CreateUiEventOptions = {
  context?: Record<string, unknown>[];
  tool?: ToolLinkData;
};

function createUiEvent(event: RunTimelineEvent, options?: CreateUiEventOptions): UiRunEvent {
  const timestamp = formatTimestamp(event.ts);
  const duration = formatDurationLabel(event.durationMs);
  const status = mapEventStatus(event.status);

  if (event.type === 'invocation_message') {
    return {
      id: event.id,
      type: 'message',
      timestamp,
      duration,
      status,
      data: {
        messageSubtype: 'source',
        content: event.message?.text ?? '',
      },
    };
  }

  if (event.type === 'injection') {
    const reason = event.injection?.reason ?? '';
    const details = event.injection?.messageIds?.length
      ? `Messages: ${event.injection.messageIds.join(', ')}`
      : '';
    const content = [reason, details].filter(Boolean).join('\n');
    return {
      id: event.id,
      type: 'message',
      timestamp,
      duration,
      status,
      data: {
        messageSubtype: 'intermediate',
        content,
      },
    };
  }

  if (event.type === 'llm_call') {
    const usage = event.llmCall?.usage;
    const fallbackContext = toRecordArray(event.metadata);
    const context = options?.context && options.context.length > 0 ? options.context : fallbackContext;
    const response = extractLlmResponse(event);
    return {
      id: event.id,
      type: 'llm',
      timestamp,
      duration,
      status,
      data: {
        context,
        response,
        model: event.llmCall?.model ?? undefined,
        tokens: usage
          ? {
              input: usage.inputTokens ?? undefined,
              cached: usage.cachedInputTokens ?? undefined,
              output: usage.outputTokens ?? undefined,
              reasoning: usage.reasoningTokens ?? undefined,
              total: usage.totalTokens ?? undefined,
            }
          : undefined,
        toolCalls: event.llmCall?.toolCalls,
        rawResponse: event.llmCall?.rawResponse,
      },
    };
  }

  if (event.type === 'tool_execution') {
    const rawInput = event.toolExecution?.input;
    const rawOutput = event.toolExecution?.output ?? event.toolExecution?.raw;
    const normalizedInput = options?.tool?.input ?? rawInput;
    const normalizedOutput = options?.tool?.output ?? rawOutput;
    const inputRecord = coerceRecord(normalizedInput);
    const runId = options?.tool?.runId ?? options?.tool?.childRunId;
    const subthreadId = options?.tool?.subthreadId;
    const threadId = options?.tool?.threadId ?? options?.tool?.childThreadId ?? options?.tool?.subthreadId;
    const childThreadId = options?.tool?.childThreadId ?? options?.tool?.threadId ?? options?.tool?.subthreadId;
    const childRunId = options?.tool?.childRunId ?? options?.tool?.runId;

    return {
      id: event.id,
      type: 'tool',
      timestamp,
      duration,
      status,
      data: {
        toolName: event.toolExecution?.toolName,
        toolSubtype: inferToolSubtype(event.toolExecution?.toolName, normalizedInput),
        input: normalizedInput,
        output: normalizedOutput,
        command: (inputRecord?.command as string | undefined) ?? undefined,
        workingDir: (inputRecord?.cwd as string | undefined) ?? undefined,
        message: (inputRecord?.message as string | undefined) ?? undefined,
        worker: (inputRecord?.worker as string | undefined) ?? undefined,
        threadAlias: (inputRecord?.threadAlias as string | undefined) ?? undefined,
        threadId,
        runId,
        subthreadId,
        childThreadId,
        childRunId,
        tool_result: normalizedOutput,
        errorMessage: event.toolExecution?.errorMessage ?? undefined,
      },
    };
  }

  if (event.type === 'summarization') {
    const metadataRecord = coerceRecord(event.metadata);
    const oldContext = Array.isArray(metadataRecord?.oldContext) ? metadataRecord?.oldContext : [];
    const newContext = Array.isArray(metadataRecord?.newContext) ? metadataRecord?.newContext : [];
    return {
      id: event.id,
      type: 'summarization',
      timestamp,
      duration,
      status,
      data: {
        summary: event.summarization?.summaryText ?? '',
        oldContext,
        newContext,
      },
    };
  }

  return {
    id: event.id,
    type: 'message',
    timestamp,
    duration,
    status,
    data: {
      content: '',
    },
  };
}

function useRunDuration(
  createdAt: string | undefined,
  status: 'running' | 'finished' | 'terminated' | undefined,
  reference: string | undefined,
): string {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!createdAt || status !== 'running') return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [createdAt, status]);

  const start = createdAt ? Date.parse(createdAt) : NaN;
  if (Number.isNaN(start)) return '—';
  const end = (() => {
    if (status === 'running') return now;
    if (reference) {
      const parsed = Date.parse(reference);
      if (!Number.isNaN(parsed)) return parsed;
    }
    return now;
  })();
  const durationMs = Math.max(0, end - start);
  const label = formatDuration(durationMs);
  return label === '—' ? '0 ms' : label;
}

function sanitizeEventFilters(filters: EventFilter[]): EventFilter[] {
  if (filters.length === 0) return EVENT_FILTER_OPTIONS;
  const next = Array.from(new Set(filters));
  return EVENT_FILTER_OPTIONS.filter((filter) => next.includes(filter));
}

function sanitizeStatusFilters(filters: StatusFilter[]): StatusFilter[] {
  const next = Array.from(new Set(filters));
  return STATUS_FILTER_OPTIONS.filter((filter) => next.includes(filter));
}

export function AgentsRunScreen() {
  const params = useParams<{ threadId: string; runId: string }>();
  const runId = params.runId;
  const [searchParams, setSearchParams] = useSearchParams();
  const updateSearchParams = useCallback(
    (mutator: (params: URLSearchParams) => void) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        mutator(next);
        return next;
      }, { replace: true });
    },
    [setSearchParams],
  );

  const isMdUp = useMediaQuery('(min-width: 768px)');
  const [liveMessage, setLiveMessage] = useState('');
  const [eventFilters, setEventFilters] = useState<EventFilter[]>(EVENT_FILTER_OPTIONS);
  const [statusFilters, setStatusFilters] = useState<StatusFilter[]>([]);
  const [tokensPopoverOpen, setTokensPopoverOpen] = useState(false);
  const [runsPopoverOpen, setRunsPopoverOpen] = useState(false);
  const [isTerminating, setIsTerminating] = useState(false);
  const [allEvents, setAllEvents] = useState<RunTimelineEvent[]>([]);
  const [events, setEvents] = useState<RunTimelineEvent[]>([]);
  const [nextCursor, setNextCursor] = useState<RunTimelineEventsCursor | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [loadOlderError, setLoadOlderError] = useState<string | null>(null);
  const contextItemsRef = useRef<Map<string, ContextItem>>(new Map());
  const pendingContextIdsRef = useRef<Set<string>>(new Set());
  const [contextItemsVersion, setContextItemsVersion] = useState(0);

  const followDefault = useMemo(() => {
    const paramValue = parseFollowValue(searchParams.get('follow'));
    if (paramValue !== null) return paramValue;
    const stored = readGlobalFollowFromStorage();
    if (stored !== null) return stored;
    return isMdUp;
  }, [searchParams, isMdUp]);

  const [isFollowing, setIsFollowing] = useState(followDefault);
  const followRef = useRef(isFollowing);
  const hasMigratedLegacyRef = useRef(false);

  useEffect(() => {
    followRef.current = isFollowing;
  }, [isFollowing]);

  useEffect(() => {
    if (!runId) return;
    if (!hasMigratedLegacyRef.current) {
      if (parseFollowValue(searchParams.get('follow')) === null && readGlobalFollowFromStorage() === null) {
        const legacy = readLegacyFollowFromStorage(runId);
        if (legacy !== null) {
          writeGlobalFollowToStorage(legacy);
        }
      }
      hasMigratedLegacyRef.current = true;
    }
    const paramValue = parseFollowValue(searchParams.get('follow'));
    const resolved = paramValue ?? readGlobalFollowFromStorage() ?? isMdUp;
    setIsFollowing((prev) => (prev === resolved ? prev : resolved));
    followRef.current = resolved;
    writeGlobalFollowToStorage(resolved);
    if (paramValue === null) {
      updateSearchParams((next) => {
        next.set('follow', resolved ? 'true' : 'false');
      });
    }
  }, [runId, searchParams, isMdUp, updateSearchParams]);

  const announce = useCallback((message: string) => {
    setLiveMessage((prev) => (prev === message ? `${message} ` : message));
  }, []);

  const persistFollow = useCallback((value: boolean) => {
    writeGlobalFollowToStorage(value);
    updateSearchParams((next) => {
      next.set('follow', value ? 'true' : 'false');
    });
  }, [updateSearchParams]);

  const commitFollow = useCallback(
    (value: boolean, options?: { announceMessage?: string }) => {
      if (followRef.current === value) return;
      followRef.current = value;
      setIsFollowing(value);
      persistFollow(value);
      if (options?.announceMessage) announce(options.announceMessage);
    },
    [persistFollow, announce],
  );

  const toggleFollow = useCallback(() => {
    const next = !followRef.current;
    commitFollow(next, { announceMessage: next ? 'Follow enabled' : 'Follow disabled' });
  }, [commitFollow]);

  useEffect(() => {
    setEventFilters(EVENT_FILTER_OPTIONS);
    setStatusFilters([]);
  }, [runId]);

  const apiTypes = useMemo(() => {
    if (eventFilters.length === EVENT_FILTER_OPTIONS.length) return [] as RunEventType[];
    const set = new Set<RunEventType>();
    eventFilters.forEach((filter) => {
      for (const type of EVENT_FILTER_TO_TYPES[filter]) set.add(type);
    });
    return set.size === API_EVENT_TYPES.length ? [] : Array.from(set);
  }, [eventFilters]);

  const selectedTypes = useMemo(() => (apiTypes.length === 0 ? API_EVENT_TYPES : apiTypes), [apiTypes]);

  const apiStatuses = useMemo(() => {
    if (statusFilters.length === 0) return [] as RunEventStatus[];
    const set = new Set<RunEventStatus>();
    statusFilters.forEach((filter) => {
      for (const status of STATUS_FILTER_TO_STATUSES[filter]) set.add(status);
    });
    return set.size === API_EVENT_STATUSES.length ? [] : Array.from(set);
  }, [statusFilters]);

  const selectedStatuses = useMemo(() => (apiStatuses.length === 0 ? API_EVENT_STATUSES : apiStatuses), [apiStatuses]);

  const summaryQuery = useRunTimelineSummary(runId);
  const eventsQuery = useRunTimelineEvents(runId, {
    types: apiTypes,
    statuses: apiStatuses,
    limit: 100,
    order: 'desc',
  });

  const cursorRef = useRef<RunTimelineEventsCursor | null>(null);
  const catchUpRef = useRef<Promise<unknown> | null>(null);
  const olderCursorRef = useRef<RunTimelineEventsCursor | null>(null);
  const loadOlderCursorParamModeRef = useRef<'both' | 'plain' | 'bracketed'>('both');
  const catchUpCursorParamModeRef = useRef<'both' | 'plain' | 'bracketed'>('both');
  const loadingOlderRef = useRef(false);
  const replaceEventsRef = useRef(false);
  const lastRunIdRef = useRef<string | undefined>(undefined);
  const lastFilterKeyRef = useRef<string>('');
  const reachedHistoryEndRef = useRef(false);
  const apiTypesRef = useRef(apiTypes);
  const apiStatusesRef = useRef(apiStatuses);

  useEffect(() => {
    apiTypesRef.current = apiTypes;
  }, [apiTypes]);

  useEffect(() => {
    apiStatusesRef.current = apiStatuses;
  }, [apiStatuses]);

  const updateCursor = useCallback(
    (cursor: RunTimelineEventsCursor | null, opts?: { force?: boolean }) => {
      if (!runId) return;
      if (!cursor) {
        cursorRef.current = null;
        graphSocket.setRunCursor(runId, null, { force: true });
        return;
      }
      const current = cursorRef.current;
      if (!current || opts?.force || compareCursors(cursor, current) > 0) {
        cursorRef.current = cursor;
        graphSocket.setRunCursor(runId, cursor, { force: opts?.force });
      }
    },
    [runId],
  );

  const updateEventsState = useCallback((incoming: RunTimelineEvent[]) => {
    if (incoming.length === 0) return;
    setAllEvents((prev) => {
      const map = new Map<string, RunTimelineEvent>();
      for (const event of prev) {
        map.set(event.id, event);
      }
      for (const event of incoming) {
        map.set(event.id, event);
      }
      return sortEvents(Array.from(map.values()));
    });
  }, []);

  const updateOlderCursor = useCallback(
    (
      update:
        | RunTimelineEventsCursor
        | null
        | ((prev: RunTimelineEventsCursor | null) => RunTimelineEventsCursor | null),
    ) => {
      const nextValue = typeof update === 'function' ? (update as (prev: RunTimelineEventsCursor | null) => RunTimelineEventsCursor | null)(olderCursorRef.current) : update;
      olderCursorRef.current = nextValue;
      setNextCursor(nextValue);
    },
    [],
  );

  const fetchContextItems = useCallback(async (ids: readonly string[]) => {
    if (!Array.isArray(ids) || ids.length === 0) return;
    const lookup = contextItemsRef.current;
    const pending = pendingContextIdsRef.current;
    const candidates: string[] = [];

    for (const id of ids) {
      if (!isNonEmptyString(id)) continue;
      if (lookup.has(id) || pending.has(id)) continue;
      pending.add(id);
      candidates.push(id);
    }

    if (candidates.length === 0) return;

    let fetched: ContextItem[] | null = null;
    try {
      fetched = await contextItems.getMany(candidates);
    } catch (error) {
      console.error('Failed to load context items', error);
    } finally {
      for (const id of candidates) {
        pending.delete(id);
      }
    }

    if (!fetched || fetched.length === 0) return;

    let updated = false;
    for (const item of fetched) {
      if (isNonEmptyString(item.id) && !lookup.has(item.id)) {
        lookup.set(item.id, item);
        updated = true;
      }
    }

    if (updated) {
      setContextItemsVersion((version) => version + 1);
    }
  }, []);

  useEffect(() => {
    if (allEvents.length === 0) return;
    const lookup = contextItemsRef.current;
    const ids = new Set<string>();
    for (const event of allEvents) {
      if (event.type !== 'llm_call') continue;
      const contextIds = event.llmCall?.contextItemIds ?? [];
      for (const id of contextIds) {
        if (!isNonEmptyString(id)) continue;
        if (lookup.has(id)) continue;
        ids.add(id);
      }
    }
    if (ids.size === 0) return;
    void fetchContextItems(Array.from(ids));
  }, [allEvents, fetchContextItems]);

  useEffect(() => {
    setEvents((prev) => {
      const next = allEvents.filter((event) => matchesFilters(event, selectedTypes, selectedStatuses));
      if (areEventListsEqual(prev, next)) return prev;
      return next;
    });
  }, [allEvents, selectedTypes, selectedStatuses]);

  useEffect(() => {
    const currentFilterKey = JSON.stringify([eventFilters, statusFilters]);
    const previousRunId = lastRunIdRef.current;
    const previousFilterKey = lastFilterKeyRef.current;

    lastRunIdRef.current = runId;
    lastFilterKeyRef.current = currentFilterKey;

    if (!runId) {
      setAllEvents([]);
      setEvents([]);
      cursorRef.current = null;
      return;
    }

    if (previousRunId !== runId) {
      setIsTerminating(false);
      replaceEventsRef.current = true;
      reachedHistoryEndRef.current = false;
      setLoadOlderError(null);
      setLoadingOlder(false);
      loadingOlderRef.current = false;
      catchUpRef.current = null;
      setAllEvents([]);
      setEvents([]);
      cursorRef.current = null;
      updateOlderCursor(null);
      updateCursor(null, { force: true });
      return;
    }

    if (previousFilterKey !== currentFilterKey) {
      reachedHistoryEndRef.current = false;
      setLoadOlderError(null);
      setLoadingOlder(false);
      loadingOlderRef.current = false;
      catchUpRef.current = null;
      updateCursor(null, { force: true });
      updateOlderCursor(null);
    }
  }, [runId, eventFilters, statusFilters, updateCursor, updateOlderCursor, selectedTypes, selectedStatuses]);

  useEffect(() => {
    if (!eventsQuery.data) return;
    const incoming = eventsQuery.data.items ?? [];
    const newestIncoming = incoming.length > 0 ? incoming.reduce<RunTimelineEvent>((latest, event) => (compareEvents(event, latest) > 0 ? event : latest), incoming[0]) : null;
    const queryCursor = eventsQuery.data.nextCursor ?? null;

    setLoadOlderError(null);
    if (replaceEventsRef.current) {
      setAllEvents([]);
      setEvents([]);
      replaceEventsRef.current = false;
    }
    if (incoming.length > 0) {
      updateEventsState(incoming);
    }
    if (newestIncoming) {
      updateCursor(toCursor(newestIncoming), { force: true });
    } else {
      updateCursor(null, { force: true });
    }
    if (!queryCursor) {
      reachedHistoryEndRef.current = true;
      updateOlderCursor(null);
    } else if (!reachedHistoryEndRef.current) {
      reachedHistoryEndRef.current = false;
      updateOlderCursor((prev) => {
        if (!prev) return queryCursor;
        return compareCursors(queryCursor, prev) < 0 ? queryCursor : prev;
      });
    }
  }, [eventsQuery.data, updateEventsState, updateCursor, updateOlderCursor]);

  const fetchSinceCursor = useCallback(() => {
    if (!runId) return Promise.resolve();
    if (catchUpRef.current) return catchUpRef.current;

    const cursor = graphSocket.getRunCursor(runId) ?? cursorRef.current;
    if (!cursor) {
      const fallback = eventsQuery.refetch();
      catchUpRef.current = fallback.finally(() => {
        catchUpRef.current = null;
      });
      return catchUpRef.current;
    }

    const promise = (async () => {
      try {
        const currentApiTypes = apiTypesRef.current;
        const currentApiStatuses = apiStatusesRef.current;
        const attemptModes = buildCursorAttemptModes(catchUpCursorParamModeRef.current);

        let response: RunTimelineEventsResponse | null = null;
        let successfulMode: 'both' | 'plain' | 'bracketed' | null = null;

        for (let i = 0; i < attemptModes.length; i += 1) {
          const mode = attemptModes[i];
          const candidate = await runs.timelineEvents(runId, {
            types: currentApiTypes.length > 0 ? currentApiTypes.join(',') : undefined,
            statuses: currentApiStatuses.length > 0 ? currentApiStatuses.join(',') : undefined,
            cursorTs: cursor.ts,
            cursorId: cursor.id,
            cursorParamMode: mode,
          });
          if (!isNonAdvancingPage(candidate, cursor)) {
            response = candidate;
            successfulMode = mode;
            break;
          }
        }

        if (!response) {
          reachedHistoryEndRef.current = true;
          return;
        }

        catchUpCursorParamModeRef.current = successfulMode ?? catchUpCursorParamModeRef.current;

        const items = response.items ?? [];
        if (items.length > 0) {
          updateEventsState(items);
          const newest = items[items.length - 1];
          if (newest) updateCursor(toCursor(newest));
        }
      } catch {
        await eventsQuery.refetch();
      }
    })();

    catchUpRef.current = promise.finally(() => {
      catchUpRef.current = null;
    });
    return catchUpRef.current;
  }, [runId, eventsQuery, updateEventsState, updateCursor]);

  const loadOlderEvents = useCallback(async () => {
    if (!runId) return;
    const cursor = olderCursorRef.current;
    if (!cursor || loadingOlderRef.current) return;
    loadingOlderRef.current = true;
    setLoadingOlder(true);
    setLoadOlderError(null);
    const currentApiTypes = apiTypesRef.current;
    const currentApiStatuses = apiStatusesRef.current;
    const attemptModes = buildCursorAttemptModes(loadOlderCursorParamModeRef.current);

    try {
      let response: RunTimelineEventsResponse | null = null;
      let successfulMode: 'both' | 'plain' | 'bracketed' | null = null;

      for (let i = 0; i < attemptModes.length; i += 1) {
        const mode = attemptModes[i];
        const candidate = await runs.timelineEvents(runId, {
          types: currentApiTypes.length > 0 ? currentApiTypes.join(',') : undefined,
          statuses: currentApiStatuses.length > 0 ? currentApiStatuses.join(',') : undefined,
          limit: 100,
          order: 'desc',
          cursorTs: cursor.ts,
          cursorId: cursor.id,
          cursorParamMode: mode,
        });
        if (!isNonAdvancingPage(candidate, cursor)) {
          response = candidate;
          successfulMode = mode;
          break;
        }
      }

      if (!response) {
        reachedHistoryEndRef.current = true;
        updateOlderCursor(null);
        return;
      }

      loadOlderCursorParamModeRef.current = successfulMode ?? loadOlderCursorParamModeRef.current;

      const items = response.items ?? [];
      if (response.nextCursor) {
        reachedHistoryEndRef.current = false;
        updateOlderCursor(response.nextCursor);
      } else {
        reachedHistoryEndRef.current = true;
        updateOlderCursor(null);
      }
      if (items.length > 0) {
        updateEventsState(items);
      }
    } catch (error) {
      setLoadOlderError((error as Error)?.message ?? 'Failed to load older events');
    } finally {
      loadingOlderRef.current = false;
      setLoadingOlder(false);
    }
  }, [runId, updateOlderCursor, updateEventsState]);

  useEffect(() => {
    if (!runId) return;
    const room = `run:${runId}`;
    graphSocket.subscribe([room]);
    const offEvent = graphSocket.onRunEvent(({ runId: incomingRunId, event }) => {
      if (incomingRunId !== runId) return;
      updateEventsState([event]);
      updateCursor(toCursor(event));
      summaryQuery.refetch();
    });
    const offStatus = graphSocket.onRunStatusChanged(({ run }) => {
      if (run.id === runId) summaryQuery.refetch();
    });
    const offReconnect = graphSocket.onReconnected(() => {
      void fetchSinceCursor();
      summaryQuery.refetch();
    });
    return () => {
      offEvent();
      offStatus();
      offReconnect();
      graphSocket.unsubscribe([room]);
    };
  }, [runId, summaryQuery, updateEventsState, updateCursor, fetchSinceCursor]);

  const selectedEventId = searchParams.get('eventId');

  useEffect(() => {
    if (!events.length) return;
    if (!followRef.current) return;
    const latest = events[events.length - 1];
    if (latest && latest.id !== selectedEventId) {
      updateSearchParams((params) => {
        params.set('eventId', latest.id);
      });
      announce('Selected latest event');
    }
  }, [events, selectedEventId, updateSearchParams, announce]);

  useEffect(() => {
    if (!selectedEventId) return;
    const exists = events.some((event) => event.id === selectedEventId);
    if (!exists) {
      updateSearchParams((params) => {
        params.delete('eventId');
      });
    }
  }, [events, selectedEventId, updateSearchParams]);

  const selectEvent = useCallback(
    (eventId: string) => {
      updateSearchParams((params) => {
        params.set('eventId', eventId);
      });
    },
    [updateSearchParams],
  );

  const clearSelection = useCallback(() => {
    updateSearchParams((params) => {
      params.delete('eventId');
    });
  }, [updateSearchParams]);

  const manualSelect = useCallback(
    (eventId: string) => {
      if (followRef.current) {
        followRef.current = false;
        setIsFollowing(false);
        writeGlobalFollowToStorage(false);
        announce('Follow disabled');
        updateSearchParams((params) => {
          params.set('follow', 'false');
          params.set('eventId', eventId);
        });
        return;
      }
      selectEvent(eventId);
    },
    [selectEvent, updateSearchParams, announce],
  );

  const ensureSelectionVisible = useCallback(
    (nextTypes: RunEventType[], nextStatuses: RunEventStatus[]) => {
      if (followRef.current) return;
      if (!selectedEventId) return;
      const stillVisible = events.some((event) => event.id === selectedEventId && matchesFilters(event, nextTypes, nextStatuses));
      if (!stillVisible) {
        clearSelection();
      }
    },
    [clearSelection, events, selectedEventId],
  );

  const handleSelectEvent = useCallback(
    (eventId: string) => {
      manualSelect(eventId);
    },
    [manualSelect],
  );

  const handleFollowingChange = useCallback(
    (value: boolean) => {
      commitFollow(value, { announceMessage: value ? 'Follow enabled' : 'Follow disabled' });
    },
    [commitFollow],
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key?.toLowerCase() !== 'f') return;
      const target = event.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable) {
          return;
        }
      }
      event.preventDefault();
      toggleFollow();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [toggleFollow]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleKeydown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
      const target = event.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable) {
          return;
        }
      }
      if (events.length === 0) return;

      const currentIndex = selectedEventId ? events.findIndex((item) => item.id === selectedEventId) : -1;
      let nextIndex = currentIndex;

      if (event.key === 'ArrowDown') {
        nextIndex = currentIndex < 0 ? 0 : Math.min(events.length - 1, currentIndex + 1);
      } else {
        nextIndex = currentIndex < 0 ? events.length - 1 : Math.max(0, currentIndex - 1);
      }

      if (nextIndex === currentIndex || nextIndex < 0 || nextIndex >= events.length) return;

      event.preventDefault();
      manualSelect(events[nextIndex].id);
    };

    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [events, selectedEventId, manualSelect]);

  const handleEventFiltersChange = useCallback(
    (filters: EventFilter[]) => {
      const sanitized = sanitizeEventFilters(filters);
      setEventFilters(sanitized);
      const nextTypes = sanitized.length === EVENT_FILTER_OPTIONS.length ? API_EVENT_TYPES : Array.from(new Set(sanitized.flatMap((filter) => EVENT_FILTER_TO_TYPES[filter])));
      ensureSelectionVisible(nextTypes, selectedStatuses);
    },
    [ensureSelectionVisible, selectedStatuses],
  );

  const handleStatusFiltersChange = useCallback(
    (filters: StatusFilter[]) => {
      const sanitized = sanitizeStatusFilters(filters);
      setStatusFilters(sanitized);
      if (sanitized.length === 0) {
        ensureSelectionVisible(selectedTypes, API_EVENT_STATUSES);
        return;
      }
      const statuses = Array.from(new Set(sanitized.flatMap((filter) => STATUS_FILTER_TO_STATUSES[filter])));
      ensureSelectionVisible(selectedTypes, statuses.length === API_EVENT_STATUSES.length ? API_EVENT_STATUSES : statuses);
    },
    [ensureSelectionVisible, selectedTypes],
  );

  const handleTerminate = useCallback(async () => {
    if (!runId || isTerminating) return;
    if (typeof window !== 'undefined' && !window.confirm('Terminate this run?')) {
      return;
    }
    setIsTerminating(true);
    try {
      await runs.terminate(runId);
      notifySuccess('Termination signaled');
      await summaryQuery.refetch();
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : 'Failed to terminate run';
      notifyError(message);
    } finally {
      setIsTerminating(false);
    }
  }, [runId, isTerminating, summaryQuery]);

  const runSummary = summaryQuery.data;
  const runStatus = mapRunStatus(runSummary?.status);
  const runDuration = useRunDuration(runSummary?.createdAt, runSummary?.status, runSummary?.lastEventAt ?? runSummary?.updatedAt);

  const statistics = useMemo(() => {
    const summary = runSummary;
    if (!summary) {
      return {
        totalEvents: 0,
        messages: 0,
        llm: 0,
        tools: 0,
        summaries: 0,
      };
    }
    const counts = summary.countsByType ?? {};
    return {
      totalEvents: summary.totalEvents ?? 0,
      messages: (counts.invocation_message ?? 0) + (counts.injection ?? 0),
      llm: counts.llm_call ?? 0,
      tools: counts.tool_execution ?? 0,
      summaries: counts.summarization ?? 0,
    };
  }, [runSummary]);

  const tokenTotals = useMemo(() => aggregateTokens(allEvents), [allEvents]);

  const uiEvents = useMemo<UiRunEvent[]>(() => {
    const lookup = contextItemsRef.current;
    void contextItemsVersion;
    return events.map((event) => {
      const contextRecords =
        event.type === 'llm_call'
          ? resolveContextRecords(event.llmCall?.contextItemIds ?? [], lookup, event.llmCall?.toolCalls ?? [])
          : [];
      const toolLinks = event.type === 'tool_execution' ? buildToolLinkData(event) : undefined;
      return createUiEvent(event, { context: contextRecords, tool: toolLinks });
    });
  }, [events, contextItemsVersion]);

  const isLoading = eventsQuery.isLoading || summaryQuery.isLoading;
  const hasMoreEvents = Boolean(nextCursor);
  const isEmpty = allEvents.length === 0 && !isLoading;

  const primaryError = (eventsQuery.error as Error | undefined) ?? (summaryQuery.error as Error | undefined);
  const errorMessage = primaryError?.message ?? loadOlderError ?? undefined;

  const tokens = {
    input: tokenTotals.input,
    cached: tokenTotals.cached,
    output: tokenTotals.output,
    reasoning: tokenTotals.reasoning,
    total: tokenTotals.total,
  };

  return (
    <>
      <div aria-live="polite" role="status" className="sr-only">
        {liveMessage}
      </div>
      <RunScreen
        runId={runId ?? ''}
        status={runStatus}
        createdAt={runSummary?.createdAt ?? ''}
        duration={runDuration}
        statistics={statistics}
        tokens={tokens}
        events={uiEvents}
        selectedEventId={selectedEventId ?? null}
        isFollowing={isFollowing}
        eventFilters={eventFilters}
        statusFilters={statusFilters}
        tokensPopoverOpen={tokensPopoverOpen}
        runsPopoverOpen={runsPopoverOpen}
        hasMoreEvents={hasMoreEvents}
        isLoadingMoreEvents={loadingOlder}
        isLoading={isLoading}
        isEmpty={isEmpty}
        error={errorMessage}
        onSelectEvent={handleSelectEvent}
        onFollowingChange={handleFollowingChange}
        onEventFiltersChange={handleEventFiltersChange}
        onStatusFiltersChange={handleStatusFiltersChange}
        onTokensPopoverOpenChange={setTokensPopoverOpen}
        onRunsPopoverOpenChange={setRunsPopoverOpen}
        onLoadMoreEvents={hasMoreEvents ? loadOlderEvents : undefined}
        onTerminate={runStatus === 'running' && !isTerminating ? handleTerminate : undefined}
      />
    </>
  );
}

type AgentsRunScreenComponent = typeof AgentsRunScreen & {
  __testing__?: {
    extractLlmResponse: typeof extractLlmResponse;
  };
};

(AgentsRunScreen as AgentsRunScreenComponent).__testing__ = {
  extractLlmResponse,
};
