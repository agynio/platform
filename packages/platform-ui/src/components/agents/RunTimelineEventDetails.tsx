import type { RunTimelineEvent } from '@/api/types/agents';
import { STATUS_COLORS, formatDuration, getEventTypeLabel } from './runTimelineFormatting';

function formatJson(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  try {
    return JSON.stringify(value, null, 2);
  } catch (_err) {
    return String(value);
  }
}

export function RunTimelineEventDetails({ event }: { event: RunTimelineEvent }) {
  const timestamp = new Date(event.ts).toLocaleString();
  const startedAt = event.startedAt ? new Date(event.startedAt).toLocaleString() : null;
  const endedAt = event.endedAt ? new Date(event.endedAt).toLocaleString() : null;

  return (
    <div className="space-y-4 text-xs text-gray-700" data-testid="timeline-event-details">
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
        <h4 className="font-semibold text-gray-700">Metadata</h4>
        <pre className="mt-1 bg-gray-100 rounded p-2 overflow-x-auto" aria-label="Event metadata">
          {formatJson(event.metadata)}
        </pre>
      </section>

      {event.message && (
        <section>
          <h4 className="font-semibold text-gray-700">Message</h4>
          <div className="mt-1 space-y-1">
            <div>ID: {event.message.messageId}</div>
            <div>Role: {event.message.role}</div>
            {event.message.kind && <div>Kind: {event.message.kind}</div>}
            {event.message.text && <div className="whitespace-pre-wrap">{event.message.text}</div>}
            <pre className="bg-gray-100 rounded p-2 overflow-x-auto">{formatJson(event.message.source)}</pre>
          </div>
        </section>
      )}

      {event.llmCall && (
        <section>
          <h4 className="font-semibold text-gray-700">LLM Call</h4>
          <div className="mt-1 space-y-1">
            <div>Provider: {event.llmCall.provider ?? '—'}</div>
            <div>Model: {event.llmCall.model ?? '—'}</div>
            <div>Stop reason: {event.llmCall.stopReason ?? '—'}</div>
            {event.llmCall.prompt && (
              <details className="mt-1">
                <summary className="cursor-pointer">Prompt</summary>
                <pre className="bg-gray-100 rounded p-2 overflow-x-auto">{event.llmCall.prompt}</pre>
              </details>
            )}
            {event.llmCall.responseText && (
              <details className="mt-1">
                <summary className="cursor-pointer">Response</summary>
                <pre className="bg-gray-100 rounded p-2 overflow-x-auto whitespace-pre-wrap">{event.llmCall.responseText}</pre>
              </details>
            )}
            <details className="mt-1">
              <summary className="cursor-pointer">Raw response</summary>
              <pre className="bg-gray-100 rounded p-2 overflow-x-auto">{formatJson(event.llmCall.rawResponse)}</pre>
            </details>
            {event.llmCall.toolCalls.length > 0 && (
              <details className="mt-1">
                <summary className="cursor-pointer">Tool calls ({event.llmCall.toolCalls.length})</summary>
                <div className="mt-1 space-y-2">
                  {event.llmCall.toolCalls.map((tc) => (
                    <pre key={tc.callId} className="bg-gray-100 rounded p-2 overflow-x-auto">
                      {formatJson({ callId: tc.callId, name: tc.name, arguments: tc.arguments })}
                    </pre>
                  ))}
                </div>
              </details>
            )}
          </div>
        </section>
      )}

      {event.toolExecution && (
        <section>
          <h4 className="font-semibold text-gray-700">Tool Execution</h4>
          <div className="mt-1 space-y-1">
            <div>Tool: {event.toolExecution.toolName}</div>
            <div>Status: {event.toolExecution.execStatus}</div>
            <div>Tool Call: {event.toolExecution.toolCallId ?? '—'}</div>
            <details>
              <summary className="cursor-pointer">Input</summary>
              <pre className="bg-gray-100 rounded p-2 overflow-x-auto">{formatJson(event.toolExecution.input)}</pre>
            </details>
            <details>
              <summary className="cursor-pointer">Output</summary>
              <pre className="bg-gray-100 rounded p-2 overflow-x-auto">{formatJson(event.toolExecution.output)}</pre>
            </details>
            {event.toolExecution.raw !== undefined && event.toolExecution.raw !== null && (
              <details>
                <summary className="cursor-pointer">Raw</summary>
                <pre className="bg-gray-100 rounded p-2 overflow-x-auto">{formatJson(event.toolExecution.raw)}</pre>
              </details>
            )}
            {event.toolExecution.errorMessage && <div className="text-red-600">Error: {event.toolExecution.errorMessage}</div>}
          </div>
        </section>
      )}

      {event.summarization && (
        <section>
          <h4 className="font-semibold text-gray-700">Summarization</h4>
          <div className="mt-1 space-y-1">
            <div>New context messages: {event.summarization.newContextCount}</div>
            <div>Old tokens: {event.summarization.oldContextTokens ?? '—'}</div>
            <details>
              <summary className="cursor-pointer">Summary</summary>
              <pre className="bg-gray-100 rounded p-2 overflow-x-auto whitespace-pre-wrap">{event.summarization.summaryText}</pre>
            </details>
            <details>
              <summary className="cursor-pointer">Raw payload</summary>
              <pre className="bg-gray-100 rounded p-2 overflow-x-auto">{formatJson(event.summarization.raw)}</pre>
            </details>
          </div>
        </section>
      )}

      {event.injection && (
        <section>
          <h4 className="font-semibold text-gray-700">Injection</h4>
          <div className="mt-1 space-y-1">
            <div>Messages: {event.injection.messageIds.join(', ')}</div>
            <div>Reason: {event.injection.reason ?? '—'}</div>
          </div>
        </section>
      )}

      {event.attachments.length > 0 && (
        <section>
          <h4 className="font-semibold text-gray-700">Attachments ({event.attachments.length})</h4>
          <div className="mt-1 space-y-2">
            {event.attachments.map((att) => (
              <div key={att.id} className="border rounded p-2 bg-gray-50">
                <div className="font-medium">{att.kind}</div>
                <div className="text-gray-600">Size: {att.sizeBytes} bytes {att.isGzip ? '(gzipped)' : ''}</div>
                {att.contentText && (
                  <details>
                    <summary className="cursor-pointer">Text content</summary>
                    <pre className="bg-white rounded p-2 overflow-x-auto whitespace-pre-wrap">{att.contentText}</pre>
                  </details>
                )}
                {att.contentJson !== undefined && att.contentJson !== null && (
                  <details>
                    <summary className="cursor-pointer">JSON content</summary>
                    <pre className="bg-white rounded p-2 overflow-x-auto">{formatJson(att.contentJson)}</pre>
                  </details>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
