import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { stringify as stringifyYaml } from 'yaml';
import { Link } from 'react-router-dom';
import type {
  ContextItem,
  ContextItemRole,
  RunTimelineEvent,
  ToolOutputChunk,
  ToolOutputTerminal,
  ToolOutputSource,
} from '@/api/types/agents';
import { STATUS_COLORS, formatDuration, getEventTypeLabel } from './runTimelineFormatting';
import { ContextItemsList } from './ContextItemsList';
import { waitForStableScrollHeight } from './waitForStableScrollHeight';
import { useToolOutputStreaming } from '@/hooks/useToolOutputStreaming';

type Attachment = RunTimelineEvent['attachments'][number];

function formatJson(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  try {
    return JSON.stringify(value, null, 2);
  } catch (_err) {
    return String(value);
  }
}

function textBlock(value: string, tone: 'default' | 'muted' = 'default', className = '', framed = true) {
  const classes = ['content-wrap', 'text-[11px]', tone === 'muted' ? 'text-gray-700' : 'text-gray-800', className];
  if (framed) {
    classes.push('px-3', 'py-2');
    classes.push(tone === 'muted' ? 'border border-gray-200 bg-gray-50' : 'border border-gray-200 bg-white');
  }
  return <div className={classes.filter(Boolean).join(' ')}>{value}</div>;
}

function jsonBlock(value: unknown, tone: 'default' | 'muted' = 'muted', className = '', framed = true) {
  const classes = ['content-wrap', 'text-[11px]', tone === 'muted' ? 'text-gray-700' : 'text-gray-800', className];
  if (framed) {
    classes.push('px-3', 'py-2');
    classes.push(tone === 'muted' ? 'border border-gray-200 bg-gray-50' : 'border border-gray-200 bg-white');
  }
  return <pre className={classes.filter(Boolean).join(' ')}>{formatJson(value)}</pre>;
}

const ANSI_PATTERN = '\u001B\\[[0-9;]*m';
const ANSI_REGEX = new RegExp(ANSI_PATTERN);

const CALL_AGENT_TOOL_NAMES = new Set(['call_agent', 'call_engineer']);

const CALL_AGENT_STATUS_STYLES = {
  queued: { bg: 'bg-amber-500', text: 'text-gray-900' },
  running: { bg: 'bg-sky-500', text: 'text-white' },
  finished: { bg: 'bg-emerald-500', text: 'text-white' },
  terminated: { bg: 'bg-gray-500', text: 'text-white' },
} as const;

const CONVERSATION_ROLES: ContextItemRole[] = ['user', 'assistant', 'tool'];
const CONVERSATION_PAGE_SIZE = 20;

type CallAgentStatusKey = keyof typeof CALL_AGENT_STATUS_STYLES;

const TERMINAL_STATUS_LABELS: Record<ToolOutputTerminal['status'], string> = {
  success: 'Success',
  error: 'Error',
  timeout: 'Timeout',
  idle_timeout: 'Idle timeout',
  cancelled: 'Cancelled',
  truncated: 'Truncated',
};

const TERMINAL_STATUS_STYLES: Record<ToolOutputTerminal['status'], string> = {
  success: 'bg-emerald-100 text-emerald-700',
  error: 'bg-red-100 text-red-700',
  timeout: 'bg-amber-100 text-amber-700',
  idle_timeout: 'bg-amber-100 text-amber-700',
  cancelled: 'bg-gray-200 text-gray-700',
  truncated: 'bg-indigo-100 text-indigo-700',
};

type StreamFilter = 'interleaved' | 'stdout' | 'stderr';

const STREAM_FILTER_LABELS: Record<StreamFilter, string> = {
  interleaved: 'Interleaved',
  stdout: 'Stdout only',
  stderr: 'Stderr only',
};

type StreamSegment = { id: string; source: ToolOutputSource; data: string };

type StreamSegmentsValue = {
  kind: 'stream_segments';
  segments: StreamSegment[];
};

type StderrTone = 'alert' | 'neutral';

function isStreamSegmentsValue(value: unknown): value is StreamSegmentsValue {
  return Boolean(value && typeof value === 'object' && (value as StreamSegmentsValue).kind === 'stream_segments');
}

function normalizeCallAgentStatus(value: string): { display: string; colorKey: CallAgentStatusKey } {
  const raw = (value ?? '').toLowerCase();
  if (raw === 'processing') return { display: 'processing', colorKey: 'running' };
  if (raw === 'running' || raw === 'finished' || raw === 'terminated') {
    return { display: raw, colorKey: raw as CallAgentStatusKey };
  }
  return { display: raw || 'queued', colorKey: 'queued' };
}

function formatCallAgentStatusLabel(status: string): string {
  if (!status) return 'Queued';
  return status.charAt(0).toUpperCase() + status.slice(1);
}

type OutputMode = 'text' | 'terminal' | 'markdown' | 'json' | 'yaml';

function isOutputMode(value: string | null): value is OutputMode {
  return value === 'text' || value === 'terminal' || value === 'markdown' || value === 'json' || value === 'yaml';
}

function tryParseJson(value: string) {
  try {
    return JSON.parse(value);
  } catch (_err) {
    return null;
  }
}

function getSessionStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage;
  } catch (_err) {
    return null;
  }
}

function readStoredMode(key: string): OutputMode | null {
  const storage = getSessionStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(key);
    return isOutputMode(raw) ? raw : null;
  } catch (_err) {
    return null;
  }
}

function writeStoredMode(key: string, mode: OutputMode) {
  const storage = getSessionStorage();
  if (!storage) return;
  try {
    storage.setItem(key, mode);
  } catch (_err) {
    // Ignore blocked storage writes
  }
}

function looksLikeJsonString(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    return tryParseJson(trimmed) !== null;
  }
  return false;
}

const MARKDOWN_HINTS = [/#\s+/m, /```/, /\*\*[^*]+\*\*/, /\* [^*]+/m, /^- /m, /^\d+\.\s+/m, /\[[^\]]+\]\([^)]+\)/];

function looksLikeMarkdownString(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  return MARKDOWN_HINTS.some((regex) => regex.test(trimmed));
}

function determineDefaultMode(output: unknown): OutputMode {
  if (output === null || output === undefined) {
    return 'text';
  }
  if (isStreamSegmentsValue(output)) {
    return 'terminal';
  }
  if (Array.isArray(output) || (typeof output === 'object' && output !== null)) {
    return 'json';
  }
  if (typeof output === 'string') {
    if (ANSI_REGEX.test(output)) {
      return 'terminal';
    }
    if (looksLikeJsonString(output)) {
      return 'json';
    }
    if (looksLikeMarkdownString(output)) {
      return 'markdown';
    }
  }
  return 'text';
}

function toText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (isStreamSegmentsValue(value)) {
    return value.segments.map((segment) => segment.data).join('');
  }
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return formatJson(value);
}

function formatYaml(value: unknown): string {
  if (isStreamSegmentsValue(value)) {
    return value.segments.map((segment) => segment.data).join('');
  }
  try {
    const data = typeof value === 'string' ? tryParseJson(value) ?? value : value;
    if (typeof data === 'string') {
      return data;
    }
    const yaml = stringifyYaml(data ?? null, { indent: 2 });
    return typeof yaml === 'string' ? yaml.trimEnd() : String(yaml);
  } catch (_err) {
    return formatJson(value);
  }
}

function renderOutputByMode(mode: OutputMode, value: unknown, options: { framed?: boolean; stderrTone?: StderrTone } = {}) {
  const { framed = true, stderrTone } = options;
  if (mode === 'json') {
    const parsed = typeof value === 'string' ? tryParseJson(value) ?? value : value;
    return jsonBlock(parsed, 'default', '', framed);
  }
  if (mode === 'yaml') {
    const classes = ['content-wrap', 'text-[11px]', 'text-gray-800'];
    if (framed) {
      classes.push('px-3', 'py-2', 'border', 'border-gray-200', 'bg-white');
    }
    return <pre className={classes.join(' ')}>{formatYaml(value)}</pre>;
  }
  if (mode === 'terminal') {
    if (isStreamSegmentsValue(value)) {
      return renderStreamSegments('terminal', value.segments, { framed, stderrTone });
    }
    const classes = ['content-pre', 'text-[11px]', 'font-mono'];
    if (framed) {
      classes.push('px-3', 'py-2', 'border', 'border-gray-800', 'bg-gray-900', 'text-emerald-100');
    } else {
      classes.push('text-gray-800');
    }
    return <pre className={classes.join(' ')}>{typeof value === 'string' ? value : formatJson(value)}</pre>;
  }
  const displayText = toText(value);
  if (mode === 'markdown') {
    const classes = ['content-wrap', 'text-[11px]', 'text-gray-800'];
    if (framed) classes.push('px-3', 'py-2');
    return <pre className={classes.join(' ')}>{displayText}</pre>;
  }
  if (mode === 'text' && isStreamSegmentsValue(value)) {
    return renderStreamSegments('text', value.segments, { framed, stderrTone });
  }
  const classes = ['content-wrap', 'text-[11px]', 'text-gray-800'];
  if (framed) classes.push('px-3', 'py-2');
  return <pre className={classes.join(' ')}>{displayText}</pre>;
}

function formatUsageValue(value: number | null | undefined): string {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value.toLocaleString();
  }
  return '—';
}

function renderStreamSegments(
  mode: 'terminal' | 'text',
  segments: StreamSegment[],
  options: { framed?: boolean; stderrTone?: StderrTone } = {},
) {
  const { framed = true, stderrTone = 'alert' } = options;
  const isTerminal = mode === 'terminal';
  const preClasses = isTerminal
    ? ['content-pre', 'text-[11px]', 'font-mono']
    : ['content-wrap', 'text-[11px]'];

  if (isTerminal) {
    if (framed) {
      preClasses.push('px-3', 'py-2', 'border', 'border-gray-800', 'bg-gray-900', 'text-emerald-100');
    } else {
      preClasses.push('text-gray-800');
    }
  } else if (framed) {
    preClasses.push('px-3', 'py-2', 'border', 'border-gray-200', 'bg-white', 'text-gray-800');
  } else {
    preClasses.push('text-gray-800');
  }

  const stderrClass = isTerminal
    ? `${stderrTone === 'neutral' ? 'text-gray-200' : 'text-rose-300'} font-semibold`
    : `${stderrTone === 'neutral' ? 'text-gray-700' : 'text-red-600'} font-semibold`;

  return (
    <pre className={preClasses.join(' ')}>
      {segments.map((segment) => (
        <span key={segment.id} data-source={segment.source} className={segment.source === 'stderr' ? stderrClass : undefined}>
          {segment.data}
        </span>
      ))}
    </pre>
  );
}

function useToolOutputMode(eventId: string, value: unknown, renderOptions?: { framed?: boolean; stderrTone?: StderrTone }) {
  const storageKey = useMemo(() => `timeline-output-mode:${eventId}`, [eventId]);
  const [mode, setMode] = useState<OutputMode>(() => {
    return readStoredMode(storageKey) ?? determineDefaultMode(value);
  });

  useEffect(() => {
    const stored = readStoredMode(storageKey);
    const nextMode = stored ?? determineDefaultMode(value);
    setMode((prev) => (prev === nextMode ? prev : nextMode));
  }, [storageKey, value]);

  useEffect(() => {
    writeStoredMode(storageKey, mode);
  }, [mode, storageKey]);

  const { framed = false, stderrTone } = renderOptions ?? {};
  const rendered = useMemo(
    () => renderOutputByMode(mode, value, { framed, stderrTone }),
    [mode, value, framed, stderrTone],
  );

  return { mode, setMode, rendered };
}

function ToolOutputSection({
  eventId,
  baseValue,
  streamData,
  isStreaming,
  terminal,
  streamError,
  loading,
  hydrated,
  errorMessage,
  attachments,
}: {
  eventId: string;
  baseValue: unknown;
  streamData?: {
    chunks: ToolOutputChunk[];
    text: string;
    stdoutText: string;
    stderrText: string;
  };
  isStreaming?: boolean;
  terminal?: ToolOutputTerminal | null;
  streamError?: Error | null;
  loading?: boolean;
  hydrated?: boolean;
  errorMessage: string | null | undefined;
  attachments: Attachment[];
}) {
  const hasStreamControls = Boolean(streamData) && ((streamData?.chunks.length ?? 0) > 0 || isStreaming);
  const isTerminalSuccess = terminal?.status === 'success';
  const defaultFilter = useMemo<StreamFilter>(() => {
    if (!hasStreamControls) return 'interleaved';
    if (isTerminalSuccess) return 'stdout';
    if (terminal) return 'stderr';
    return 'interleaved';
  }, [hasStreamControls, isTerminalSuccess, terminal]);
  const [filter, setFilter] = useState<StreamFilter>(() => defaultFilter);

  useEffect(() => {
    if (!hasStreamControls) {
      setFilter('interleaved');
    }
  }, [hasStreamControls]);

  useEffect(() => {
    if (!hasStreamControls) return;
    if (!terminal) return;
    setFilter((current) => (current === 'interleaved' ? defaultFilter : current));
  }, [hasStreamControls, terminal, defaultFilter]);

  const streamTexts = useMemo(
    () => ({
      interleaved: streamData?.text ?? '',
      stdout: streamData?.stdoutText ?? '',
      stderr: streamData?.stderrText ?? '',
    }),
    [streamData],
  );
  const streamSegments = useMemo<StreamSegment[]>(() => {
    if (!streamData) return [];
    return streamData.chunks.map((chunk) => ({ id: `${chunk.seqGlobal}`, source: chunk.source, data: chunk.data }));
  }, [streamData]);

  const streamSegmentsByFilter = useMemo<Record<StreamFilter, StreamSegment[]>>(() => {
    if (streamSegments.length === 0) {
      return { interleaved: [], stdout: [], stderr: [] };
    }
    const stdout: StreamSegment[] = [];
    const stderr: StreamSegment[] = [];
    for (const segment of streamSegments) {
      if (segment.source === 'stdout') stdout.push(segment);
      if (segment.source === 'stderr') stderr.push(segment);
    }
    return {
      interleaved: streamSegments,
      stdout,
      stderr,
    };
  }, [streamSegments]);

  const hasStderrOutput = useMemo(() => {
    if (streamSegmentsByFilter.stderr.length > 0) return true;
    return Boolean(streamTexts.stderr && streamTexts.stderr.length > 0);
  }, [streamSegmentsByFilter, streamTexts.stderr]);

  const displayValue = useMemo(() => {
    if (hasStreamControls) {
      const segmentsForFilter = streamSegmentsByFilter[filter];
      if (segmentsForFilter.length > 0) {
        return { kind: 'stream_segments', segments: segmentsForFilter } as StreamSegmentsValue;
      }
      if (filter === 'stdout') return streamTexts.stdout;
      if (filter === 'stderr') return streamTexts.stderr;
      if (streamSegmentsByFilter.interleaved.length > 0) {
        return { kind: 'stream_segments', segments: streamSegmentsByFilter.interleaved } as StreamSegmentsValue;
      }
      return streamTexts.interleaved;
    }
    return baseValue;
  }, [hasStreamControls, filter, streamSegmentsByFilter, streamTexts, baseValue]);

  const scrollKey = hasStreamControls
    ? `${filter}:${filter === 'interleaved' ? streamTexts.interleaved : filter === 'stdout' ? streamTexts.stdout : streamTexts.stderr}`
    : toText(displayValue);

  const hasNeutralStderr = terminal?.exitCode === 0;
  const renderOptions = useMemo<{ framed: false; stderrTone: StderrTone }>(
    () => ({ framed: false, stderrTone: hasNeutralStderr ? 'neutral' : 'alert' }),
    [hasNeutralStderr],
  );
  const { mode, setMode, rendered } = useToolOutputMode(eventId, displayValue, renderOptions);
  const contentRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isStreaming) return;
    const el = contentRef.current;
    if (!el) return;
    try {
      el.scrollTop = el.scrollHeight;
    } catch {
      // ignore scroll errors
    }
  }, [isStreaming, scrollKey]);

  const statusBadge = isStreaming
    ? (
        <span className="inline-flex items-center rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-700">
          Streaming…
        </span>
      )
    : terminal
      ? (
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${TERMINAL_STATUS_STYLES[terminal.status]}`}
          >
            {TERMINAL_STATUS_LABELS[terminal.status]}
            {terminal.exitCode !== null ? ` • Exit ${terminal.exitCode}` : ''}
          </span>
        )
      : null;

  const showStreamFilterControls = hasStreamControls && (mode === 'text' || mode === 'terminal');

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded border border-gray-200 bg-white">
      <header className="flex items-center justify-between gap-2 border-b border-gray-200 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
        <div className="flex items-center gap-2">
          <span>Output</span>
          {statusBadge}
        </div>
        <div className="flex items-center gap-2">
          {showStreamFilterControls && (
            <label className="flex items-center gap-1 text-[11px] font-medium normal-case text-gray-600">
              <span>Stream</span>
              <select
                aria-label="Select stream view"
                value={filter}
                onChange={(event) => setFilter(event.target.value as StreamFilter)}
                className="rounded border border-gray-300 bg-white px-2 py-1 text-[11px] text-gray-700 shadow-sm"
              >
                <option value="interleaved">{STREAM_FILTER_LABELS.interleaved}</option>
                <option value="stdout">{STREAM_FILTER_LABELS.stdout}</option>
                <option value="stderr">{STREAM_FILTER_LABELS.stderr}</option>
              </select>
            </label>
          )}
          <select
            aria-label="Select output view"
            value={mode}
            onChange={(event) => setMode(event.target.value as OutputMode)}
            className="rounded border border-gray-300 bg-white px-2 py-1 text-[11px] text-gray-700 shadow-sm"
          >
            <option value="text">text</option>
            <option value="terminal">terminal</option>
            <option value="markdown">markdown</option>
            <option value="json">json</option>
            <option value="yaml">yaml</option>
          </select>
        </div>
      </header>
      <div ref={contentRef} className="flex-1 min-h-0 space-y-3 overflow-y-auto px-3 py-2">
        {loading && !hydrated && <div className="text-[11px] text-gray-500">Loading output…</div>}
        {rendered}
        {filter === 'stderr' && isTerminalSuccess && hasNeutralStderr && hasStderrOutput && (
          <div className="text-[11px] text-gray-500">
            Command succeeded; some tools print messages to stderr.
          </div>
        )}
        {isStreaming && <div className="text-[11px] text-gray-500">Streaming live output…</div>}
        {streamError && <div className="text-[11px] text-red-600">Stream error: {streamError.message}</div>}
        {terminal?.message && <div className="text-[11px] text-gray-700">{terminal.message}</div>}
        {terminal?.savedPath && (
          <div className="text-[11px] text-gray-600">
            Full output saved to <span className="font-mono">{terminal.savedPath}</span>
          </div>
        )}
        {errorMessage && <div className="text-[11px] text-red-600">Error: {errorMessage}</div>}
        {attachments.map((att) => (
          <div key={att.id} className="space-y-1">
            <div className="text-[10px] uppercase tracking-wide text-gray-500">
              Attachment • {att.id.slice(0, 8)}{att.isGzip ? ' • gzipped' : ''}
            </div>
            {renderAttachmentContent(att)}
          </div>
        ))}
      </div>
    </div>
  );
}

function renderAttachmentContent(attachment: Attachment, tone: 'default' | 'muted' = 'default') {
  if (typeof attachment.contentText === 'string' && attachment.contentText.length > 0) {
    return textBlock(attachment.contentText, tone);
  }
  if (attachment.contentJson !== undefined && attachment.contentJson !== null) {
    return jsonBlock(attachment.contentJson, tone);
  }
  return <div className="text-[11px] text-gray-500">No preview available</div>;
}

export function RunTimelineEventDetails({ event }: { event: RunTimelineEvent }) {
  const timestamp = new Date(event.ts).toLocaleString();
  const headerMetaItems: string[] = [timestamp];
  const durationLabel = formatDuration(event.durationMs);
  if (durationLabel !== '—') headerMetaItems.push(durationLabel);
  if (event.nodeId) headerMetaItems.push(`Node: ${event.nodeId}`);
  const promptAttachments = event.attachments.filter((att) => att.kind === 'prompt');
  const responseAttachments = event.attachments.filter((att) => att.kind === 'response');
  const toolInputAttachments = event.attachments.filter((att) => att.kind === 'tool_input');
  const toolOutputAttachments = event.attachments.filter((att) => att.kind === 'tool_output');
  const providerRawAttachments = event.attachments.filter((att) => att.kind === 'provider_raw');
  const remainingAttachments = event.attachments.filter(
    (att) => !['prompt', 'response', 'tool_input', 'tool_output', 'provider_raw'].includes(att.kind),
  );

  const shouldShowAttachmentsSection =
    promptAttachments.length > 0 ||
    responseAttachments.length > 0 ||
    providerRawAttachments.length > 0 ||
    remainingAttachments.length > 0;

  const otherSections: ReactNode[] = [];

  if (event.message) {
    otherSections.push(
      <section key="message" className="space-y-2">
        <h4 className="text-sm font-semibold text-gray-800">Message</h4>
        <div className="space-y-1">
          <div>ID: {event.message.messageId}</div>
          <div>Role: {event.message.role}</div>
          {event.message.kind && <div>Kind: {event.message.kind}</div>}
          {event.message.text && <div>{textBlock(event.message.text)}</div>}
        </div>
      </section>,
    );
  }

  if (event.summarization) {
    otherSections.push(
      <section key="summarization" className="space-y-2">
        <h4 className="text-sm font-semibold text-gray-800">Summarization</h4>
        <div className="space-y-1 text-[11px] text-gray-600">
          <div>
            <span className="font-medium text-gray-800">New context messages:</span> {event.summarization.newContextCount}
          </div>
          {event.summarization.oldContextTokens !== null && event.summarization.oldContextTokens !== undefined && (
            <div>
              <span className="font-medium text-gray-800">Old tokens:</span> {event.summarization.oldContextTokens}
            </div>
          )}
        </div>
        <div>
          <div className="text-[11px] font-medium text-gray-800">Summary</div>
          {textBlock(event.summarization.summaryText)}
        </div>
      </section>,
    );
  }

  if (event.injection) {
    otherSections.push(
      <section key="injection" className="space-y-2">
        <h4 className="text-sm font-semibold text-gray-800">Injection</h4>
        <div className="space-y-1">
          <div>Messages: {event.injection.messageIds.join(', ')}</div>
          {event.injection.reason && <div>Reason: {event.injection.reason}</div>}
        </div>
      </section>,
    );
  }

  if (shouldShowAttachmentsSection) {
    otherSections.push(
      <section key="attachments" className="space-y-2">
        <h4 className="text-sm font-semibold text-gray-800">Attachments</h4>
        <div className="space-y-3">
          {providerRawAttachments.length > 0 && (
            <div className="space-y-1">
              <div className="text-[10px] uppercase tracking-wide text-gray-500">
                Provider payloads ({providerRawAttachments.length})
              </div>
              {providerRawAttachments.map((att) => (
                <div key={`provider-${att.id}`}>{renderAttachmentContent(att, 'muted')}</div>
              ))}
            </div>
          )}
          {promptAttachments.length > 0 && (
            <div className="space-y-1">
              <div className="text-[10px] uppercase tracking-wide text-gray-500">
                Prompt attachments ({promptAttachments.length})
              </div>
              {promptAttachments.map((att) => (
                <div key={`prompt-${att.id}`}>{renderAttachmentContent(att)}</div>
              ))}
            </div>
          )}
          {responseAttachments.length > 0 && (
            <div className="space-y-1">
              <div className="text-[10px] uppercase tracking-wide text-gray-500">
                Response attachments ({responseAttachments.length})
              </div>
              {responseAttachments.map((att) => (
                <div key={`response-${att.id}`}>{renderAttachmentContent(att)}</div>
              ))}
            </div>
          )}
          {remainingAttachments.map((att) => (
            <div key={att.id} className="space-y-1">
              <div className="text-[10px] uppercase tracking-wide text-gray-500">
                {att.kind} • {att.id.slice(0, 8)} • {att.sizeBytes} bytes {att.isGzip ? '• gzipped' : ''}
              </div>
              {renderAttachmentContent(att)}
            </div>
          ))}
        </div>
      </section>,
    );
  }

  const hasOtherSections = otherSections.length > 0;

  const llmCall = event.llmCall;
  const hasLlmResponse = Boolean(llmCall?.responseText);
  const hasLlmToolCalls = (llmCall?.toolCalls.length ?? 0) > 0;
  const usageMetrics = llmCall?.usage;
  const toolExecution = event.toolExecution;
  const callAgentMeta = useMemo(() => {
    if (!toolExecution || !CALL_AGENT_TOOL_NAMES.has(toolExecution.toolName)) return null;
    const metadata = event.metadata;
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;

    const raw = metadata as Record<string, unknown>;
    const childThreadId = typeof raw.childThreadId === 'string' && raw.childThreadId.length > 0 ? raw.childThreadId : null;
    if (!childThreadId) return null;

    const childRun: { id: string | null; status: string; linkEnabled: boolean; latestMessageId: string | null } = {
      id: null,
      status: 'queued',
      linkEnabled: false,
      latestMessageId: null,
    };

    const maybeChildRun = raw.childRun;
    if (maybeChildRun && typeof maybeChildRun === 'object' && !Array.isArray(maybeChildRun)) {
      const details = maybeChildRun as Record<string, unknown>;
      if (typeof details.id === 'string' && details.id.length > 0) childRun.id = details.id;
      if (typeof details.status === 'string' && details.status.length > 0) childRun.status = details.status;
      if (typeof details.linkEnabled === 'boolean') childRun.linkEnabled = details.linkEnabled;
      if (typeof details.latestMessageId === 'string' && details.latestMessageId.length > 0) childRun.latestMessageId = details.latestMessageId;
    }

    if (typeof raw.childRunId === 'string' && raw.childRunId.length > 0 && !childRun.id) childRun.id = raw.childRunId;
    if (typeof raw.childRunStatus === 'string' && raw.childRunStatus.length > 0) childRun.status = raw.childRunStatus;
    if (raw.childRunLinkEnabled === true) childRun.linkEnabled = true;
    if (typeof raw.childMessageId === 'string' && raw.childMessageId.length > 0) childRun.latestMessageId = raw.childMessageId;

    const { display, colorKey } = normalizeCallAgentStatus(childRun.status);
    const linkEnabled = childRun.linkEnabled && Boolean(childRun.id);

    return {
      childThreadId,
      childRunId: childRun.id,
      childRunLinkEnabled: linkEnabled,
      childRunStatus: display,
      statusForColor: colorKey,
      childMessageId: childRun.latestMessageId,
    } as const;
  }, [event.metadata, toolExecution]);
  const callAgentStatusStyles = callAgentMeta ? CALL_AGENT_STATUS_STYLES[callAgentMeta.statusForColor] ?? CALL_AGENT_STATUS_STYLES.queued : null;
  const contextScrollRef = useRef<HTMLDivElement | null>(null);
  const contextPrependSnapshotRef = useRef<{ prevScrollHeight: number; prevScrollTop: number } | null>(null);
  const contextPendingPrependRef = useRef(false);
  const contextPrevItemIdsRef = useRef<string[]>([]);
  const contextAdjustTokenRef = useRef(0);
  const hasLlmCall = Boolean(llmCall);
  const contextItemsKey = llmCall ? `${event.id}:${llmCall.contextItemIds.join('|')}` : '';

  const isShellTool = toolExecution?.toolName === 'shell_command';
  const {
    text: streamedOutput,
    stdoutText: streamedStdout,
    stderrText: streamedStderr,
    chunks: streamedChunks,
    terminal: streamedTerminal,
    hydrated: streamHydrated,
    loading: streamLoading,
    error: streamError,
  } = useToolOutputStreaming({ runId: event.runId, eventId: event.id, enabled: Boolean(isShellTool) });
  const isStreamingActive = Boolean(isShellTool) && !streamedTerminal && (event.status === 'running' || event.status === 'pending');
  const streamData = isShellTool
    ? {
        chunks: streamedChunks,
        text: streamedOutput,
        stdoutText: streamedStdout,
        stderrText: streamedStderr,
      }
    : undefined;

  const scrollContextToBottom = useCallback(() => {
    const apply = () => {
      const el = contextScrollRef.current;
      if (!el) return;
      try {
        if (typeof el.scrollTo === 'function') {
          el.scrollTo({ top: el.scrollHeight, behavior: 'auto' });
        } else {
          el.scrollTop = el.scrollHeight;
        }
      } catch (_err) {
        el.scrollTop = el.scrollHeight;
      }
    };

    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(apply);
    } else {
      apply();
    }
  }, []);

  const handleContextItemsRendered = useCallback((items: ContextItem[]) => {
    const prevIds = contextPrevItemIdsRef.current;
    contextPrevItemIdsRef.current = items.map((item) => item.id);

    if (contextPendingPrependRef.current) {
      contextPendingPrependRef.current = false;
      const snapshot = contextPrependSnapshotRef.current;
      contextPrependSnapshotRef.current = null;
      const container = contextScrollRef.current;

      if (!container || !snapshot) return;

      const token = ++contextAdjustTokenRef.current;

      void (async () => {
        await waitForStableScrollHeight(container);
        if (contextAdjustTokenRef.current !== token) return;
        const newScrollHeight = container.scrollHeight;
        const delta = newScrollHeight - snapshot.prevScrollHeight;
        const nextTop = Math.max(snapshot.prevScrollTop + delta, 0);
        try {
          container.scrollTop = nextTop;
        } catch (_err) {
          void _err;
        }
      })();

      return;
    }

    const initialLoad = prevIds.length === 0 && items.length > 0;
    const prevLastId = prevIds[prevIds.length - 1];
    const currentLastId = items.length > 0 ? items[items.length - 1]?.id : undefined;
    const appended = prevIds.length > 0 && currentLastId !== undefined && prevLastId !== currentLastId;

    if (initialLoad || appended) {
      scrollContextToBottom();
    }
  }, [scrollContextToBottom]);

  const handleBeforeLoadMore = useCallback(() => {
    const container = contextScrollRef.current;
    if (!container) return;
    contextPrependSnapshotRef.current = {
      prevScrollHeight: container.scrollHeight,
      prevScrollTop: container.scrollTop,
    };
    contextPendingPrependRef.current = true;
  }, []);

  useEffect(() => {
    if (!hasLlmCall) return;
    contextPrevItemIdsRef.current = [];
    contextPrependSnapshotRef.current = null;
    contextPendingPrependRef.current = false;
    contextAdjustTokenRef.current += 1;
    scrollContextToBottom();
  }, [hasLlmCall, contextItemsKey, scrollContextToBottom]);

  return (
    <div
      className="flex h-full min-h-0 flex-col gap-4 overflow-hidden text-xs text-gray-700"
      data-testid="timeline-event-details"
    >
      <section className="shrink-0 space-y-2">
        <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-gray-900">
          <span>{getEventTypeLabel(event)}</span>
          <span className={`text-white text-[11px] px-2 py-0.5 rounded ${STATUS_COLORS[event.status] ?? 'bg-gray-500'}`}>{event.status}</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-gray-500">
          {headerMetaItems.map((item, index) => (
            <div key={item + index} className="flex items-center gap-2">
              {index > 0 && <span aria-hidden="true">•</span>}
              <span>{item}</span>
            </div>
          ))}
        </div>
        {event.errorCode && <div className="text-red-600">Error code: {event.errorCode}</div>}
        {event.errorMessage && <div className="text-red-600">Error: {event.errorMessage}</div>}
      </section>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
        {llmCall && (
          <section className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
            <div className="flex flex-wrap items-center gap-3 text-[11px] text-gray-600">
              {llmCall.model && (
                <span>
                  <span className="font-medium text-gray-800">Model:</span> {llmCall.model}
                </span>
              )}
              <span>
                <span className="font-medium text-gray-800">Context items:</span> {llmCall.contextItemIds.length}
              </span>
            </div>
            {usageMetrics && (
              <div className="flex flex-wrap items-center gap-3 text-[11px] text-gray-600">
                <span>
                  <span className="font-medium text-gray-800">Input:</span> {formatUsageValue(usageMetrics.inputTokens)}
                </span>
                <span>
                  <span className="font-medium text-gray-800">Cached:</span> {formatUsageValue(usageMetrics.cachedInputTokens)}
                </span>
                <span>
                  <span className="font-medium text-gray-800">Output:</span> {formatUsageValue(usageMetrics.outputTokens)}
                </span>
                <span>
                  <span className="font-medium text-gray-800">Reasoning:</span> {formatUsageValue(usageMetrics.reasoningTokens)}
                </span>
                <span>
                  <span className="font-medium text-gray-800">Total:</span> {formatUsageValue(usageMetrics.totalTokens)}
                </span>
              </div>
            )}
            <div className="flex min-h-[260px] flex-1 flex-col gap-4 md:min-h-[320px] md:flex-row md:gap-6">
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded border border-gray-200 bg-white">
                <header className="border-b border-gray-200 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Context</header>
                <div ref={contextScrollRef} data-testid="llm-context-scroll" className="flex-1 min-h-0 overflow-y-auto px-3 py-2">
                  <ContextItemsList
                    ids={llmCall.contextItemIds}
                    highlightLastCount={llmCall.newContextItemCount}
                    initialVisibleCount={Math.max(0, llmCall.newContextItemCount)}
                    pageSize={CONVERSATION_PAGE_SIZE}
                    allowedRoles={CONVERSATION_ROLES}
                    loadMoreLabel="Load older messages"
                    emptyLabel="No conversation messages"
                    onItemsRendered={handleContextItemsRendered}
                    onBeforeLoadMore={handleBeforeLoadMore}
                  />
                </div>
              </div>
              {(hasLlmResponse || hasLlmToolCalls) && (
                <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden md:gap-6">
                  {hasLlmResponse && (
                    <div className="flex min-h-0 flex-col overflow-hidden rounded border border-gray-200 bg-white md:flex-1">
                      <header className="border-b border-gray-200 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Response</header>
                      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-2">{textBlock(llmCall.responseText ?? '', 'default', '', false)}</div>
                    </div>
                  )}
                  {hasLlmToolCalls && (
                    <div className="flex min-h-0 flex-col overflow-hidden rounded border border-gray-200 bg-white md:flex-1">
                      <header className="border-b border-gray-200 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Tool Calls ({llmCall.toolCalls.length})
                      </header>
                      <div className="flex-1 min-h-0 space-y-2 overflow-y-auto px-3 py-2">
                        {llmCall.toolCalls.map((tc) => (
                          <div key={tc.callId}>{jsonBlock({ callId: tc.callId, name: tc.name, arguments: tc.arguments }, 'default', '', false)}</div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>
        )}

        {toolExecution && (
          <section className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
            <div className="flex flex-wrap items-center gap-3 text-[11px] text-gray-600">
              <span>
                <span className="font-medium text-gray-800">Tool:</span> {toolExecution.toolName}
              </span>
              <span>
                <span className="font-medium text-gray-800">Status:</span> {toolExecution.execStatus}
              </span>
              {toolExecution.toolCallId && (
                <span>
                  <span className="font-medium text-gray-800">Tool call:</span> {toolExecution.toolCallId}
                </span>
              )}
            </div>
            {callAgentMeta && callAgentStatusStyles && (
              <div
                data-testid="call-agent-link-group"
                className="flex flex-wrap items-center gap-2 rounded border border-gray-200 bg-gray-50 px-3 py-2 text-[11px] text-gray-700"
              >
                <Link
                  to={`/agents/threads/${encodeURIComponent(callAgentMeta.childThreadId)}`}
                  className="font-medium text-blue-600 hover:underline"
                >
                  Subthread
                </Link>
                <span aria-hidden="true" className="text-gray-400">
                  •
                </span>
                {callAgentMeta.childRunLinkEnabled && callAgentMeta.childRunId ? (
                  <Link
                    to={`/agents/threads/${encodeURIComponent(callAgentMeta.childThreadId)}/runs/${encodeURIComponent(callAgentMeta.childRunId)}/timeline`}
                    className="font-medium text-blue-600 hover:underline"
                  >
                    Run timeline
                  </Link>
                ) : (
                  <span className="text-gray-500">Run (not started)</span>
                )}
                <span aria-hidden="true" className="text-gray-400">
                  •
                </span>
                <span
                  className={`inline-flex items-center rounded px-2 py-0.5 text-[10px] font-semibold uppercase ${callAgentStatusStyles.bg} ${callAgentStatusStyles.text}`}
                >
                  {formatCallAgentStatusLabel(callAgentMeta.childRunStatus)}
                </span>
              </div>
            )}
            <div className="flex min-h-[220px] flex-1 flex-col gap-4 md:min-h-[280px] md:flex-row md:gap-6">
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded border border-gray-200 bg-white">
                <header className="border-b border-gray-200 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Input</header>
                <div className="flex-1 min-h-0 space-y-3 overflow-y-auto px-3 py-2">
                  {jsonBlock(toolExecution.input, 'default', '', false)}
                  {toolInputAttachments.map((att) => (
                    <div key={att.id} className="space-y-1">
                      <div className="text-[10px] uppercase tracking-wide text-gray-500">
                        Attachment • {att.id.slice(0, 8)}{att.isGzip ? ' • gzipped' : ''}
                      </div>
                      {renderAttachmentContent(att)}
                    </div>
                  ))}
                </div>
              </div>
              <ToolOutputSection
                eventId={event.id}
                baseValue={toolExecution.output}
                streamData={streamData}
                isStreaming={isStreamingActive}
                terminal={streamedTerminal}
                streamError={streamError}
                loading={streamLoading}
                hydrated={streamHydrated}
                errorMessage={toolExecution.errorMessage}
                attachments={toolOutputAttachments}
              />
            </div>
          </section>
        )}

        {hasOtherSections && <div className="flex min-h-0 flex-1 flex-col space-y-4 overflow-y-auto">{otherSections}</div>}
      </div>
    </div>
  );
}
