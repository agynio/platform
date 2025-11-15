import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { stringify as stringifyYaml } from 'yaml';
import type { RunTimelineEvent } from '@/api/types/agents';
import { STATUS_COLORS, formatDuration, getEventTypeLabel } from './runTimelineFormatting';

const wrapStyle = {
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  overflowWrap: 'anywhere',
} satisfies CSSProperties;

type Attachment = RunTimelineEvent['attachments'][number];

function formatJson(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  try {
    return JSON.stringify(value, null, 2);
  } catch (_err) {
    return String(value);
  }
}

function textBlock(value: string, tone: 'default' | 'muted' = 'default', className = '') {
  const base = tone === 'muted' ? 'border bg-gray-50' : 'border bg-white';
  return (
    <div className={`${base} px-3 py-2 text-[11px] text-gray-800 ${className}`} style={wrapStyle}>
      {value}
    </div>
  );
}

function jsonBlock(value: unknown, tone: 'default' | 'muted' = 'muted', className = '') {
  const base = tone === 'muted' ? 'border bg-gray-50' : 'border bg-white';
  return (
    <pre className={`${base} px-3 py-2 text-[11px] text-gray-800 ${className}`} style={wrapStyle}>
      {formatJson(value)}
    </pre>
  );
}

const ANSI_PATTERN = '\u001B\\[[0-9;]*m';
const ANSI_REGEX = new RegExp(ANSI_PATTERN);

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
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return formatJson(value);
}

function formatYaml(value: unknown): string {
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

function renderOutputByMode(mode: OutputMode, value: unknown) {
  if (mode === 'json') {
    const parsed = typeof value === 'string' ? tryParseJson(value) ?? value : value;
    return jsonBlock(parsed, 'default');
  }
  if (mode === 'yaml') {
    return (
      <pre className="border bg-white px-3 py-2 text-[11px] text-gray-800" style={wrapStyle}>
        {formatYaml(value)}
      </pre>
    );
  }
  if (mode === 'terminal') {
    return (
      <pre
        className="border border-gray-800 bg-gray-900 px-3 py-2 text-[11px] font-mono text-emerald-100"
        style={{ ...wrapStyle, whiteSpace: 'pre' }}
      >
        {typeof value === 'string' ? value : formatJson(value)}
      </pre>
    );
  }
  const displayText = toText(value);
  if (mode === 'markdown') {
    return (
      <pre className="px-3 py-2 text-[11px] text-gray-800" style={wrapStyle}>
        {displayText}
      </pre>
    );
  }
  return (
    <pre className="px-3 py-2 text-[11px] text-gray-800" style={wrapStyle}>
      {displayText}
    </pre>
  );
}

function ToolOutputVisualization({ eventId, value }: { eventId: string; value: unknown }) {
  const storageKey = useMemo(() => `timeline-output-mode:${eventId}`, [eventId]);
  const [mode, setMode] = useState<OutputMode>(() => {
    if (typeof window !== 'undefined') {
      const stored = window.sessionStorage.getItem(storageKey);
      if (isOutputMode(stored)) return stored;
    }
    return determineDefaultMode(value);
  });

  useEffect(() => {
    const stored = typeof window !== 'undefined' ? window.sessionStorage.getItem(storageKey) : null;
    const nextMode = isOutputMode(stored) ? stored : determineDefaultMode(value);
    setMode((prev) => (prev === nextMode ? prev : nextMode));
  }, [storageKey, value]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem(storageKey, mode);
    }
  }, [mode, storageKey]);

  const rendered = useMemo(() => renderOutputByMode(mode, value), [mode, value]);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-medium text-gray-800" id={`output-view-label-${eventId}`}>
          View as
        </span>
        <select
          aria-labelledby={`output-view-label-${eventId}`}
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
      <div className="overflow-auto">{rendered}</div>
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
  const startedAt = event.startedAt ? new Date(event.startedAt).toLocaleString() : null;
  const endedAt = event.endedAt ? new Date(event.endedAt).toLocaleString() : null;

  const promptAttachments = event.attachments.filter((att) => att.kind === 'prompt');
  const responseAttachments = event.attachments.filter((att) => att.kind === 'response');
  const toolInputAttachments = event.attachments.filter((att) => att.kind === 'tool_input');
  const toolOutputAttachments = event.attachments.filter((att) => att.kind === 'tool_output');
  const providerRawAttachments = event.attachments.filter((att) => att.kind === 'provider_raw');
  const providerRawAttachmentsForOutput = event.llmCall ? providerRawAttachments : [];
  const providerRawAttachmentsForAttachments = event.llmCall ? [] : providerRawAttachments;
  const remainingAttachments = event.attachments.filter(
    (att) => !['prompt', 'response', 'tool_input', 'tool_output', 'provider_raw'].includes(att.kind),
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 text-xs text-gray-700" data-testid="timeline-event-details">
      <section className="space-y-2">
        <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-gray-900">
          <span>{getEventTypeLabel(event)}</span>
          <span className={`text-white text-[11px] px-2 py-0.5 rounded ${STATUS_COLORS[event.status] ?? 'bg-gray-500'}`}>{event.status}</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-gray-500">
          <span>{timestamp}</span>
          <span aria-hidden="true">•</span>
          <span>{formatDuration(event.durationMs)}</span>
          <span aria-hidden="true">•</span>
          <span>Node: {event.nodeId ?? '—'}</span>
          <span aria-hidden="true">•</span>
          <span>Source: {event.sourceKind}</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-gray-500">
          {startedAt && <span>Started {startedAt}</span>}
          {endedAt && (
            <>
              <span aria-hidden="true">•</span>
              <span>Ended {endedAt}</span>
            </>
          )}
          {event.sourceSpanId && (
            <>
              <span aria-hidden="true">•</span>
              <span>Span: {event.sourceSpanId}</span>
            </>
          )}
        </div>
        {event.errorCode && <div className="text-red-600">Error code: {event.errorCode}</div>}
        {event.errorMessage && <div className="text-red-600">Error: {event.errorMessage}</div>}
      </section>

      <section>
        <h4 className="text-sm font-semibold text-gray-800">Metadata</h4>
        <div className="mt-2">{jsonBlock(event.metadata)}</div>
      </section>

      {event.llmCall && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center gap-3 text-[11px] text-gray-600">
            {event.llmCall.provider && (
              <span>
                <span className="font-medium text-gray-800">Provider:</span> {event.llmCall.provider}
              </span>
            )}
            <span>
              <span className="font-medium text-gray-800">Model:</span> {event.llmCall.model ?? '—'}
            </span>
            <span>
              <span className="font-medium text-gray-800">Context items:</span> {event.llmCall.contextItemIds.length}
            </span>
            {event.llmCall.stopReason && (
              <span>
                <span className="font-medium text-gray-800">Stop reason:</span> {event.llmCall.stopReason}
              </span>
            )}
          </div>
          <div className="flex min-h-[260px] flex-col gap-4 md:min-h-[320px] md:flex-row md:gap-6">
            <div className="flex min-h-0 flex-1 flex-col border">
              <header className="border-b px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Context</header>
              <div className="flex-1 min-h-0 overflow-y-auto px-3 py-2">
                {event.llmCall.contextItemIds.length > 0 ? (
                  textBlock(event.llmCall.contextItemIds.join('\n'))
                ) : (
                  <div className="text-[11px] text-gray-500">No context item IDs</div>
                )}
              </div>
            </div>
            <div className="flex min-h-0 flex-1 flex-col border">
              <header className="border-b px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Output</header>
              <div className="flex-1 min-h-0 overflow-y-auto px-3 py-2 space-y-3">
                {event.llmCall.responseText && (
                  <div className="space-y-1">
                    <div className="text-[11px] font-medium text-gray-800">Response</div>
                    {textBlock(event.llmCall.responseText)}
                  </div>
                )}
                {event.llmCall.toolCalls.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-[11px] font-medium text-gray-800">Tool calls ({event.llmCall.toolCalls.length})</div>
                    {event.llmCall.toolCalls.map((tc) => (
                      <div key={tc.callId}>{jsonBlock({ callId: tc.callId, name: tc.name, arguments: tc.arguments })}</div>
                    ))}
                  </div>
                )}
                <div className="space-y-1">
                  <div className="text-[11px] font-medium text-gray-800">Raw response</div>
                  {jsonBlock(event.llmCall.rawResponse)}
                </div>
                {responseAttachments.map((att) => (
                  <div key={att.id} className="space-y-1">
                    <div className="text-[11px] font-medium text-gray-800">Response attachment ({att.id.slice(0, 8)})</div>
                    {renderAttachmentContent(att)}
                  </div>
                ))}
                {providerRawAttachmentsForOutput.map((att) => (
                  <div key={att.id} className="space-y-1">
                    <div className="text-[11px] font-medium text-gray-800">Provider payload ({att.id.slice(0, 8)})</div>
                    {renderAttachmentContent(att, 'muted')}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      {event.toolExecution && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center gap-3 text-[11px] text-gray-600">
            <span>
              <span className="font-medium text-gray-800">Tool:</span> {event.toolExecution.toolName}
            </span>
            <span>
              <span className="font-medium text-gray-800">Status:</span> {event.toolExecution.execStatus}
            </span>
            <span>
              <span className="font-medium text-gray-800">Tool call:</span> {event.toolExecution.toolCallId ?? '—'}
            </span>
          </div>
          <div className="flex min-h-[220px] flex-col gap-4 md:min-h-[280px] md:flex-row md:gap-6">
            <div className="flex min-h-0 flex-1 flex-col border">
              <header className="border-b px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Input</header>
              <div className="flex-1 min-h-0 overflow-y-auto px-3 py-2 space-y-3">
                <div className="space-y-1">
                  <div className="text-[11px] font-medium text-gray-800">Input payload</div>
                  {jsonBlock(event.toolExecution.input)}
                </div>
                {toolInputAttachments.map((att) => (
                  <div key={att.id} className="space-y-1">
                    <div className="text-[11px] font-medium text-gray-800">Attachment ({att.id.slice(0, 8)})</div>
                    {renderAttachmentContent(att)}
                  </div>
                ))}
              </div>
            </div>
            <div className="flex min-h-0 flex-1 flex-col border">
              <header className="border-b px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Output</header>
              <div className="flex-1 min-h-0 overflow-y-auto px-3 py-2 space-y-3">
                <ToolOutputVisualization eventId={event.id} value={event.toolExecution.output} />
                {event.toolExecution.errorMessage && (
                  <div className="text-[11px] text-red-600">Error: {event.toolExecution.errorMessage}</div>
                )}
                {event.toolExecution.raw !== undefined && event.toolExecution.raw !== null && (
                  <div className="space-y-1">
                    <div className="text-[11px] font-medium text-gray-800">Raw payload</div>
                    {jsonBlock(event.toolExecution.raw)}
                  </div>
                )}
                {toolOutputAttachments.map((att) => (
                  <div key={att.id} className="space-y-1">
                    <div className="text-[11px] font-medium text-gray-800">Attachment ({att.id.slice(0, 8)})</div>
                    {renderAttachmentContent(att)}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      {event.message && (
        <section className="space-y-2">
          <h4 className="text-sm font-semibold text-gray-800">Message</h4>
          <div className="space-y-1">
            <div>ID: {event.message.messageId}</div>
            <div>Role: {event.message.role}</div>
            {event.message.kind && <div>Kind: {event.message.kind}</div>}
            {event.message.text && <div>{textBlock(event.message.text)}</div>}
          </div>
        </section>
      )}

      {event.summarization && (
        <section className="space-y-2">
          <h4 className="text-sm font-semibold text-gray-800">Summarization</h4>
          <div className="space-y-1 text-[11px] text-gray-600">
            <div>
              <span className="font-medium text-gray-800">New context messages:</span> {event.summarization.newContextCount}
            </div>
            <div>
              <span className="font-medium text-gray-800">Old tokens:</span> {event.summarization.oldContextTokens ?? '—'}
            </div>
          </div>
          <div>
            <div className="text-[11px] font-medium text-gray-800">Summary</div>
            {textBlock(event.summarization.summaryText)}
          </div>
          <div>
            <div className="text-[11px] font-medium text-gray-800">Raw payload</div>
            {jsonBlock(event.summarization.raw)}
          </div>
        </section>
      )}

      {event.injection && (
        <section className="space-y-2">
          <h4 className="text-sm font-semibold text-gray-800">Injection</h4>
          <div className="space-y-1">
            <div>Messages: {event.injection.messageIds.join(', ')}</div>
            <div>Reason: {event.injection.reason ?? '—'}</div>
          </div>
        </section>
      )}

      {(promptAttachments.length > 0 || remainingAttachments.length > 0 || providerRawAttachmentsForAttachments.length > 0) && (
        <section className="space-y-2">
          <h4 className="text-sm font-semibold text-gray-800">Attachments</h4>
          <div className="space-y-3">
            {providerRawAttachmentsForAttachments.length > 0 && (
              <div className="space-y-1">
                <div className="text-[11px] font-medium text-gray-800">Provider payloads ({providerRawAttachmentsForAttachments.length})</div>
                {providerRawAttachmentsForAttachments.map((att) => (
                  <div key={`provider-${att.id}`}>{renderAttachmentContent(att, 'muted')}</div>
                ))}
              </div>
            )}
            {promptAttachments.length > 0 && (
              <div className="space-y-1">
                <div className="text-[11px] font-medium text-gray-800">Prompt attachments ({promptAttachments.length})</div>
                {promptAttachments.map((att) => (
                  <div key={`prompt-${att.id}`}>{renderAttachmentContent(att)}</div>
                ))}
              </div>
            )}
            {remainingAttachments.map((att) => (
              <div key={att.id} className="space-y-1">
                <div className="text-[11px] font-medium text-gray-800">
                  {att.kind} ({att.id.slice(0, 8)}) — {att.sizeBytes} bytes {att.isGzip ? '(gzipped)' : ''}
                </div>
                {renderAttachmentContent(att)}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
