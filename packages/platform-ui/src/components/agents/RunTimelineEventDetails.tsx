import type { CSSProperties } from 'react';
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

function textBlock(value: string, tone: 'default' | 'muted' = 'default') {
  const base = tone === 'muted' ? 'border bg-gray-50' : 'border bg-white';
  return (
    <div className={`${base} px-3 py-2 text-[11px] text-gray-800`} style={wrapStyle}>
      {value}
    </div>
  );
}

function jsonBlock(value: unknown, tone: 'default' | 'muted' = 'muted') {
  const base = tone === 'muted' ? 'border bg-gray-50' : 'border bg-white';
  return (
    <pre className={`${base} px-3 py-2 text-[11px] text-gray-800`} style={wrapStyle}>
      {formatJson(value)}
    </pre>
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
        <section className="flex min-h-[260px] flex-col gap-4 md:flex-row md:gap-6 md:min-h-[320px]">
          <div className="flex min-h-0 flex-1 flex-col border">
            <header className="border-b px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Context</header>
            <div className="flex-1 min-h-0 overflow-y-auto px-3 py-2 space-y-3">
              <div className="space-y-1 text-[11px] text-gray-600">
                <div>
                  <span className="font-medium text-gray-800">Provider:</span> {event.llmCall.provider ?? '—'}
                </div>
                <div>
                  <span className="font-medium text-gray-800">Model:</span> {event.llmCall.model ?? '—'}
                </div>
                {event.llmCall.temperature !== null && event.llmCall.temperature !== undefined && (
                  <div>
                    <span className="font-medium text-gray-800">Temperature:</span> {event.llmCall.temperature}
                  </div>
                )}
                {event.llmCall.topP !== null && event.llmCall.topP !== undefined && (
                  <div>
                    <span className="font-medium text-gray-800">Top P:</span> {event.llmCall.topP}
                  </div>
                )}
                <div>
                  <span className="font-medium text-gray-800">Stop reason:</span> {event.llmCall.stopReason ?? '—'}
                </div>
                <div>
                  <span className="font-medium text-gray-800">Context items:</span> {event.llmCall.contextItemIds.length}
                </div>
              </div>
              {event.llmCall.contextItemIds.length > 0 && (
                <div>
                  <div className="text-[11px] font-medium text-gray-800">Context item IDs</div>
                  {textBlock(event.llmCall.contextItemIds.join('\n'))}
                </div>
              )}
              {promptAttachments.map((att) => (
                <div key={att.id} className="space-y-1">
                  <div className="text-[11px] font-medium text-gray-800">Prompt attachment ({att.id.slice(0, 8)})</div>
                  {renderAttachmentContent(att)}
                </div>
              ))}
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
        </section>
      )}

      {event.toolExecution && (
        <section className="flex min-h-[220px] flex-col gap-4 md:flex-row md:gap-6 md:min-h-[280px]">
          <div className="flex min-h-0 flex-1 flex-col border">
            <header className="border-b px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Input</header>
            <div className="flex-1 min-h-0 overflow-y-auto px-3 py-2 space-y-3">
              <div className="space-y-1 text-[11px] text-gray-600">
                <div>
                  <span className="font-medium text-gray-800">Tool:</span> {event.toolExecution.toolName}
                </div>
                <div>
                  <span className="font-medium text-gray-800">Status:</span> {event.toolExecution.execStatus}
                </div>
                <div>
                  <span className="font-medium text-gray-800">Tool call:</span> {event.toolExecution.toolCallId ?? '—'}
                </div>
              </div>
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
              <div className="space-y-1">
                <div className="text-[11px] font-medium text-gray-800">Output payload</div>
                {jsonBlock(event.toolExecution.output)}
              </div>
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
            <div>{jsonBlock(event.message.source)}</div>
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

      {(remainingAttachments.length > 0 || providerRawAttachmentsForAttachments.length > 0) && (
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
