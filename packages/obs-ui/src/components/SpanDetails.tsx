import React, { useEffect, useMemo, useState } from 'react';
// Monaco heavy library; import when tool input viewer actually renders to reduce initial bundle
type MonacoEditorComponent = React.ComponentType<{
  height: string;
  defaultLanguage: string;
  value: string;
  theme?: string;
  options?: Record<string, unknown>;
}>;
let MonacoEditor: MonacoEditorComponent | null = null;
async function ensureMonaco() {
  if (MonacoEditor) return MonacoEditor;
  const mod = await import('@monaco-editor/react');
  MonacoEditor = (mod as { default: MonacoEditorComponent }).default;
  return MonacoEditor;
}
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import ContextView, { ContextMessageLike } from './ContextView';
import { SpanDoc, LogDoc } from '../types';
import { fetchLogs } from '../services/api';
import { spanRealtime } from '../services/socket';

export function SpanDetails({
  span,
  spans,
  onSelectSpan,
  onClose,
}: {
  span: SpanDoc;
  spans: SpanDoc[];
  onSelectSpan(s: SpanDoc): void;
  onClose(): void;
}) {
  const [allLogs, setAllLogs] = useState<LogDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    // Fetch all logs for trace; filtering done client-side for subtree view
    fetchLogs({ traceId: span.traceId, limit: 500 })
      .then((items) => {
        if (!cancelled) setAllLogs(items.reverse());
      }) // oldest first
      .catch((e) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    const off = spanRealtime.onLog((l) => {
      if (l.traceId === span.traceId) {
        setAllLogs((prev) => [...prev, l]);
      }
    });
    return () => {
      cancelled = true;
      off();
    };
  }, [span.spanId, span.traceId]);

  // Build quick index for parent-child relationships
  const childrenMap = useMemo(() => {
    const map: Record<string, string[]> = {};
    spans.forEach((s) => {
      if (s.parentSpanId) (map[s.parentSpanId] ||= []).push(s.spanId);
    });
    return map;
  }, [spans]);

  const subtreeSpanIds = useMemo(() => {
    const ids = new Set<string>();
    function dfs(id: string) {
      if (ids.has(id)) return;
      ids.add(id);
      const kids = childrenMap[id];
      if (kids) kids.forEach(dfs);
    }
    dfs(span.spanId);
    return ids;
  }, [span.spanId, childrenMap]);

  const filteredLogs = useMemo(() => {
    return allLogs.filter((l) => !l.spanId || subtreeSpanIds.has(l.spanId));
  }, [allLogs, subtreeSpanIds]);

  // Span lookup for name in table
  const spanById = useMemo(() => Object.fromEntries(spans.map((s) => [s.spanId, s])), [spans]);

  // Collapsible attributes (moved into Attributes tab)
  const [attrsExpanded, setAttrsExpanded] = useState(false);
  const attrsJson = useMemo(() => JSON.stringify(span.attributes, null, 2), [span.attributes]);
  const ATTRS_COLLAPSE_THRESHOLD = 1200;
  const showCollapseToggle = attrsJson.length > ATTRS_COLLAPSE_THRESHOLD;
  const displayedAttrs =
    attrsExpanded || !showCollapseToggle ? attrsJson : attrsJson.slice(0, ATTRS_COLLAPSE_THRESHOLD) + '\n… (truncated)';

  // Detect span types based purely on kind (ignore label)
  const rawKind: string | undefined =
    typeof span.attributes === 'object' && span.attributes !== null
      ? ((span.attributes as Record<string, unknown>)['kind'] as string | undefined)
      : undefined;
  const isLLMSpan = rawKind === 'llm';
  const isToolSpan = rawKind === 'tool_call';
  const isSummarizeSpan = rawKind === 'summarize';

  // Extract LLM context messages (array) safely. withLLM stored under attributes.context
  interface ContextMsg {
    role: 'system' | 'human' | 'ai' | 'tool';
    content?: unknown;
    toolCalls?: unknown[];
    tool_calls?: unknown;
    toolCallId?: string;
    tool_call_id?: string;
    [k: string]: unknown;
  }
  const contextMessages: ContextMsg[] = useMemo(() => {
    const attrs = span.attributes as Record<string, unknown> | null | undefined;
    const raw = attrs && (attrs['context'] as unknown);
    if (!Array.isArray(raw)) return [];
    return raw as ContextMsg[];
  }, [span.attributes]);

  // Collapsing logic for LLM context messages: by default show only the tail AFTER the last AI message.
  // The head (everything up to and including the last AI message) is hidden behind a "Show previous" button.
  const lastAiIndex = useMemo(() => {
    for (let i = contextMessages.length - 1; i >= 0; i--) {
      if (contextMessages[i]?.role === 'ai') return i;
    }
    return -1;
  }, [contextMessages]);
  const collapseAvailable = lastAiIndex >= 0 && lastAiIndex < contextMessages.length - 1; // there is a tail after the last AI message
  const [historyCollapsed, setHistoryCollapsed] = useState<boolean>(collapseAvailable);
  // Reset collapse state when span changes or message structure changes significantly
  useEffect(() => {
    setHistoryCollapsed(collapseAvailable);
  }, [collapseAvailable, span.spanId]);
  const visibleMessageIndices = useMemo(() => {
    if (collapseAvailable && historyCollapsed) {
      // Tail after last AI message
      const indices: number[] = [];
      for (let i = lastAiIndex + 1; i < contextMessages.length; i++) indices.push(i);
      return indices;
    }
    return contextMessages.map((_, i) => i);
  }, [collapseAvailable, historyCollapsed, lastAiIndex, contextMessages]);

  // Extract output content + toolCalls (normalized to attributes.output.toolCalls or llm.toolCalls keys)
  const llmContent: string | undefined = useMemo(() => {
    const attrs = (span.attributes || {}) as Record<string, unknown>;
    const output = attrs['output'] as Record<string, unknown> | undefined;
    if (output && typeof output === 'object') {
      const content = output['content'];
      if (typeof content === 'string') return content;
      const text = output['text'];
      if (typeof text === 'string') return text;
    }
    const flattened = attrs['llm.content'];
    if (typeof flattened === 'string') return flattened;
    return undefined;
  }, [span.attributes]);

  interface ToolCall {
    id?: string;
    name?: string;
    arguments?: unknown;
  }
  const toolCalls: ToolCall[] = useMemo(() => {
    const attrs = (span.attributes || {}) as Record<string, unknown>;
    const output = attrs['output'] as Record<string, unknown> | undefined;
    const arr = (output && output['toolCalls']) || attrs['llm.toolCalls'];
    if (Array.isArray(arr)) return arr as ToolCall[];
    return [];
  }, [span.attributes]);

  // Tabs: show IO first if LLM or Tool span: io | attributes | logs (else attributes | logs)
  type TabKey = 'attributes' | 'logs' | 'io';
  const [activeTab, setActiveTab] = useState<TabKey>(isLLMSpan || isToolSpan || isSummarizeSpan ? 'io' : 'attributes');
  // We keep the user's selected tab (even if it's 'io') so when they navigate back to an LLM span
  // the IO tab restores automatically. For rendering we derive an effective tab.
  const effectiveTab: TabKey =
    activeTab === 'io' && !(isLLMSpan || isToolSpan || isSummarizeSpan) ? 'attributes' : activeTab;

  // Left/Right arrow keyboard navigation between tabs (scoped to this panel when focused)
  // We attach a keydown listener on mount; simple since component unmounts when span deselected.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Ignore if user is typing inside an input/textarea or has modifier keys
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const tag = target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;

      // Build ordered list of visible tabs
      const tabs: TabKey[] = [];
      if (isLLMSpan || isToolSpan || isSummarizeSpan) tabs.push('io');
      tabs.push('attributes', 'logs');
      const current = effectiveTab; // effective to handle case activeTab==='io' but LLM vanished
      const idx = tabs.indexOf(current);
      if (idx === -1) return;
      if (e.key === 'ArrowLeft' && idx > 0) {
        const prev = tabs[idx - 1];
        setActiveTab(prev);
        e.preventDefault();
      } else if (e.key === 'ArrowRight' && idx < tabs.length - 1) {
        const next = tabs[idx + 1];
        setActiveTab(next);
        e.preventDefault();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [effectiveTab, isLLMSpan]);

  // Helper to extract tool output content as string (markdown friendly)
  function getToolOutput(s: SpanDoc): string | undefined {
    const attrs = (s.attributes || {}) as Record<string, unknown>;
    const out = (attrs['output'] as Record<string, unknown>) || {};
    const cand =
      (out as Record<string, unknown>)['result'] ??
      out['content'] ??
      out['text'] ??
      attrs['result'] ??
      attrs['content'];
    if (cand == null) return undefined;
    if (typeof cand === 'string') return cand;
    try {
      return '```json\n' + JSON.stringify(cand, null, 2) + '\n```';
    } catch {
      return String(cand);
    }
  }

  // Log severity counts (only in logs tab header badges)
  const severityCounts = useMemo(() => {
    const counts = { debug: 0, info: 0, error: 0 };
    filteredLogs.forEach((l) => {
      if (l.level in counts) (counts as Record<string, number>)[l.level]!++;
    });
    return counts;
  }, [filteredLogs]);

  return (
    <div
      style={{
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        height: '100%',
        flex: 1,
        minHeight: 0,
        boxSizing: 'border-box',
      }}
    >
      {/* Top area now minimal; back button moved inside details panel */}
      {/* Layout: Details panel (without attributes/events) + tabbed section */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0, flexDirection: 'column', gap: 8 }}>
        {/* Back button now outside details panel */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={onClose} style={{ fontSize: 11, padding: '4px 8px', cursor: 'pointer' }}>
            ← Back
          </button>
        </div>
        {/* Details panel */}
        <div
          style={{
            flex: '0 0 auto',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            border: '1px solid #eee',
            borderRadius: 6,
          }}
        >
          <div
            style={{
              padding: '8px 10px',
              borderBottom: '1px solid #eee',
              background: '#fafbfc',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: 0.5 }}>Details</span>
          </div>
          <div
            style={{
              overflowY: 'auto',
              padding: '10px 12px',
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              fontSize: 12,
              fontFamily: 'monospace',
              color: '#222',
            }}
          >
            {/* 5-line concise layout: title, id, parent, status, time */}
            <div style={{ lineHeight: 1.35 }}>
              <strong style={{ minWidth: 60, display: 'inline-block' }}>Title:</strong> {span.label || '(no title)'}
            </div>
            <div style={{ lineHeight: 1.35 }}>
              <strong style={{ minWidth: 60, display: 'inline-block' }}>ID:</strong> {span.spanId}
            </div>
            <div style={{ lineHeight: 1.35 }}>
              <strong style={{ minWidth: 60, display: 'inline-block' }}>Parent:</strong> {span.parentSpanId || '(root)'}
            </div>
            <div style={{ lineHeight: 1.35 }}>
              <strong style={{ minWidth: 60, display: 'inline-block' }}>Status:</strong> {span.status}
            </div>
            <div style={{ lineHeight: 1.35 }}>
              <strong style={{ minWidth: 60, display: 'inline-block' }}>Time:</strong>
              <span style={{ color: '#555' }}>Start {new Date(span.startTime).toLocaleString()}</span>
              {' | '}
              <span style={{ color: '#555' }}>End {span.endTime ? new Date(span.endTime).toLocaleString() : '—'}</span>
              {' | '}
              <span style={{ color: '#555' }}>
                Duration {span.endTime ? Date.parse(span.endTime) - Date.parse(span.startTime) + ' ms' : 'running'}
              </span>
            </div>
          </div>
        </div>

        {/* Tabs container */}
        <div
          style={{
            flex: 1,
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            border: '1px solid #ddd',
            borderRadius: 6,
            overflow: 'hidden',
          }}
        >
          <div style={{ display: 'flex', borderBottom: '1px solid #ddd', background: '#f8f9fa' }}>
            {(isLLMSpan || isToolSpan || isSummarizeSpan) && (
              <TabButton active={activeTab === 'io'} onClick={() => setActiveTab('io')}>
                IO
              </TabButton>
            )}
            <TabButton active={effectiveTab === 'attributes'} onClick={() => setActiveTab('attributes')}>
              Attributes
            </TabButton>
            <TabButton active={effectiveTab === 'logs'} onClick={() => setActiveTab('logs')}>
              Logs
              {severityCounts.debug + severityCounts.info + severityCounts.error > 0 && (
                <span style={{ display: 'inline-flex', gap: 6, marginLeft: 8 }}>
                  {severityCounts.debug > 0 && <Badge color="#0366d6">D:{severityCounts.debug}</Badge>}
                  {severityCounts.info > 0 && <Badge color="#444">I:{severityCounts.info}</Badge>}
                  {severityCounts.error > 0 && <Badge color="#d00">E:{severityCounts.error}</Badge>}
                </span>
              )}
            </TabButton>
            <div style={{ marginLeft: 'auto', padding: '6px 10px', fontSize: 11, color: '#666' }}>
              {effectiveTab === 'logs' && (
                <>{loading ? 'loading…' : error ? 'error loading logs' : filteredLogs.length + ' entries'}</>
              )}
            </div>
          </div>
          {/* Tab content */}
          <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: 12 }}>
            {effectiveTab === 'attributes' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <h3 style={{ margin: 0 }}>Attributes</h3>
                  {showCollapseToggle && (
                    <button
                      onClick={() => setAttrsExpanded((v) => !v)}
                      style={{ fontSize: 11, padding: '2px 6px', cursor: 'pointer' }}
                    >
                      {attrsExpanded ? 'Collapse' : 'Expand'}
                    </button>
                  )}
                </div>
                <pre
                  style={{
                    background: '#f1f3f5',
                    padding: 8,
                    borderRadius: 4,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    fontSize: 11,
                    maxHeight: attrsExpanded ? 400 : 240,
                    overflow: 'auto',
                  }}
                >
                  {displayedAttrs}
                </pre>
              </div>
            )}
            {effectiveTab === 'logs' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minHeight: 0, height: '100%' }}>
                {!loading && !error && filteredLogs.length === 0 && (
                  <div style={{ fontSize: 12, color: '#666' }}>No logs in subtree</div>
                )}
                {!loading && filteredLogs.length > 0 && (
                  <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, fontFamily: 'monospace' }}>
                      <thead style={{ position: 'sticky', top: 0, background: '#f8f9fa' }}>
                        <tr>
                          <th style={thStyle}>Time</th>
                          <th style={thStyle}>Span</th>
                          <th style={thStyle}>Level</th>
                          <th style={thStyle}>Log</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredLogs.map((l, idx) => {
                          const s = l.spanId ? spanById[l.spanId] : undefined;
                          const isCurrent = l.spanId === span.spanId;
                          return (
                            <tr key={l.ts + idx} style={{ background: isCurrent ? '#fffadd' : 'transparent' }}>
                              <td style={tdStyle}>{new Date(l.ts).toLocaleTimeString()}</td>
                              <td
                                style={{ ...tdStyle, cursor: s ? 'pointer' : 'default', color: s ? '#0366d6' : '#555' }}
                                onClick={() => s && onSelectSpan(s)}
                              >
                                {s ? s.label : '(root)'}
                              </td>
                              <td
                                style={{
                                  ...tdStyle,
                                  fontWeight: 600,
                                  color: l.level === 'error' ? '#d00' : l.level === 'debug' ? '#0366d6' : '#222',
                                }}
                              >
                                {l.level.toUpperCase()}
                              </td>
                              <td style={{ ...tdStyle, whiteSpace: 'pre-wrap' }}>{l.message}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
            {effectiveTab === 'io' && isSummarizeSpan && <SummarizeIO span={span} />}
            {effectiveTab === 'io' && (isLLMSpan || isToolSpan) && !isSummarizeSpan && (
              <div style={{ display: 'flex', gap: 16, alignItems: 'stretch', height: '100%', minHeight: 0 }}>
                {/* Left Column: Input / Context */}
                <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                  <h3 style={{ margin: '0 0 8px 0', fontSize: 13 }}>{isToolSpan ? 'Input' : 'Context'}</h3>
                  <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {isToolSpan && <ToolInputViewer span={span} />}
                    {!isToolSpan && contextMessages.length === 0 && (
                      <div style={{ fontSize: 12, color: '#666' }}>No context messages</div>
                    )}
                    {/* Context messages (LLM) with inline cut toggle */}
                    {!isToolSpan && collapseAvailable && historyCollapsed && (
                      <div style={{ textAlign: 'center' }}>
                        <button
                          onClick={() => setHistoryCollapsed(false)}
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            color: '#0366d6',
                            fontSize: 11,
                            textDecoration: 'underline',
                            padding: '4px 8px',
                          }}
                        >
                          Show previous ({lastAiIndex + 1} hidden)
                        </button>
                      </div>
                    )}
                    {!isToolSpan &&
                      collapseAvailable &&
                      historyCollapsed &&
                      // Tail only (after cut)
                      visibleMessageIndices.map((i) => {
                        const m = contextMessages[i];
                        return (
                          <div
                            key={i}
                            style={{
                              background: '#f6f8fa',
                              border: '1px solid #e1e4e8',
                              borderRadius: 4,
                              padding: 8,
                              fontSize: 12,
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                              <RoleBadge role={m.role} />
                              <span style={{ fontSize: 10, color: '#555' }}>#{i + 1}</span>
                              {Array.isArray((m as ContextMsg).toolCalls) &&
                                (m as ContextMsg).toolCalls!.length > 0 && (
                                  <span
                                    style={{
                                      fontSize: 10,
                                      background: '#0366d6',
                                      color: '#fff',
                                      padding: '2px 6px',
                                      borderRadius: 10,
                                    }}
                                  >
                                    {((m as ContextMsg).toolCalls || []).length} tool calls
                                  </span>
                                )}
                            </div>
                            <div style={{ fontFamily: 'monospace', fontSize: 12 }}>
                              <ReactMarkdown
                                remarkPlugins={[remarkGfm]}
                                components={{
                                  code({ className, children, ...props }) {
                                    const isBlock =
                                      String(className || '').includes('language-') || String(children).includes('\n');
                                    return (
                                      <code
                                        style={{
                                          background: '#eaeef2',
                                          padding: isBlock ? 8 : '2px 4px',
                                          display: isBlock ? 'block' : 'inline',
                                          borderRadius: 4,
                                          fontSize: 11,
                                          whiteSpace: 'pre-wrap',
                                        }}
                                        className={className}
                                        {...props}
                                      >
                                        {children}
                                      </code>
                                    );
                                  },
                                  pre({ children }) {
                                    return (
                                      <pre style={{ background: '#eaeef2', padding: 0, margin: 0, overflow: 'auto' }}>
                                        {children}
                                      </pre>
                                    );
                                  },
                                }}
                              >
                                {String(m.content ?? '')}
                              </ReactMarkdown>
                            </div>
                          </div>
                        );
                      })}
                    {!isToolSpan && collapseAvailable && !historyCollapsed && (
                      // Full history with inline hide button at the cut
                      <>
                        {contextMessages.map((m, i) => {
                          const isCutPoint = i === lastAiIndex && collapseAvailable;
                          return (
                            <React.Fragment key={i}>
                              <div
                                style={{
                                  background: '#f6f8fa',
                                  border: '1px solid #e1e4e8',
                                  borderRadius: 4,
                                  padding: 8,
                                  fontSize: 12,
                                  marginBottom: 0,
                                }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                                  <RoleBadge role={m.role} />
                                  <span style={{ fontSize: 10, color: '#555' }}>#{i + 1}</span>
                                  {Array.isArray((m as ContextMsg).toolCalls) &&
                                    (m as ContextMsg).toolCalls!.length > 0 && (
                                      <span
                                        style={{
                                          fontSize: 10,
                                          background: '#0366d6',
                                          color: '#fff',
                                          padding: '2px 6px',
                                          borderRadius: 10,
                                        }}
                                      >
                                        {((m as ContextMsg).toolCalls || []).length} tool calls
                                      </span>
                                    )}
                                </div>
                                <div style={{ fontFamily: 'monospace', fontSize: 12 }}>
                                  <ReactMarkdown
                                    remarkPlugins={[remarkGfm]}
                                    components={{
                                      code({ className, children, ...props }) {
                                        const isBlock =
                                          String(className || '').includes('language-') ||
                                          String(children).includes('\n');
                                        return (
                                          <code
                                            style={{
                                              background: '#eaeef2',
                                              padding: isBlock ? 8 : '2px 4px',
                                              display: isBlock ? 'block' : 'inline',
                                              borderRadius: 4,
                                              fontSize: 11,
                                              whiteSpace: 'pre-wrap',
                                            }}
                                            className={className}
                                            {...props}
                                          >
                                            {children}
                                          </code>
                                        );
                                      },
                                      pre({ children }) {
                                        return (
                                          <pre
                                            style={{ background: '#eaeef2', padding: 0, margin: 0, overflow: 'auto' }}
                                          >
                                            {children}
                                          </pre>
                                        );
                                      },
                                    }}
                                  >
                                    {String(m.content ?? '')}
                                  </ReactMarkdown>
                                </div>
                              </div>
                              {isCutPoint && (
                                <div style={{ textAlign: 'center', margin: '4px 0' }}>
                                  <button
                                    onClick={() => setHistoryCollapsed(true)}
                                    style={{
                                      background: 'none',
                                      border: 'none',
                                      cursor: 'pointer',
                                      color: '#555',
                                      fontSize: 10,
                                      textDecoration: 'underline',
                                      padding: '2px 6px',
                                    }}
                                  >
                                    Hide previous
                                  </button>
                                </div>
                              )}
                            </React.Fragment>
                          );
                        })}
                      </>
                    )}
                    {!isToolSpan &&
                      !collapseAvailable &&
                      contextMessages.map((m, i) => (
                        <div
                          key={i}
                          style={{
                            background: '#f6f8fa',
                            border: '1px solid #e1e4e8',
                            borderRadius: 4,
                            padding: 8,
                            fontSize: 12,
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                            <RoleBadge role={m.role} />
                            <span style={{ fontSize: 10, color: '#555' }}>#{i + 1}</span>
                            {Array.isArray((m as ContextMsg).toolCalls) && (m as ContextMsg).toolCalls!.length > 0 && (
                              <span
                                style={{
                                  fontSize: 10,
                                  background: '#0366d6',
                                  color: '#fff',
                                  padding: '2px 6px',
                                  borderRadius: 10,
                                }}
                              >
                                {((m as ContextMsg).toolCalls || []).length} tool calls
                              </span>
                            )}
                          </div>
                          <div style={{ fontFamily: 'monospace', fontSize: 12 }}>
                            <ReactMarkdown
                              remarkPlugins={[remarkGfm]}
                              components={{
                                code({ className, children, ...props }) {
                                  const isBlock =
                                    String(className || '').includes('language-') || String(children).includes('\n');
                                  return (
                                    <code
                                      style={{
                                        background: '#eaeef2',
                                        padding: isBlock ? 8 : '2px 4px',
                                        display: isBlock ? 'block' : 'inline',
                                        borderRadius: 4,
                                        fontSize: 11,
                                        whiteSpace: 'pre-wrap',
                                      }}
                                      className={className}
                                      {...props}
                                    >
                                      {children}
                                    </code>
                                  );
                                },
                                pre({ children }) {
                                  return (
                                    <pre style={{ background: '#eaeef2', padding: 0, margin: 0, overflow: 'auto' }}>
                                      {children}
                                    </pre>
                                  );
                                },
                              }}
                            >
                              {String(m.content ?? '')}
                            </ReactMarkdown>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
                {/* Right Column: Output */}
                <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                  <h3 style={{ margin: '0 0 8px 0', fontSize: 13 }}>Output</h3>
                  <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 4 }}>Content</div>
                      <div
                        style={{
                          background: '#f6f8fa',
                          border: '1px solid #e1e4e8',
                          borderRadius: 4,
                          padding: 8,
                          fontSize: 12,
                          fontFamily: 'monospace',
                        }}
                      >
                        {isToolSpan ? (
                          (() => {
                            // For tool_call spans, show raw attributes.output JSON directly (no markdown transform)
                            const attrs = (span.attributes || {}) as Record<string, unknown>;
                            const output = attrs['output'];
                            if (output == null) return <span style={{ color: '#666' }}>(no output)</span>;
                            try {
                              const pretty = JSON.stringify(output, null, 2);
                              return (
                                <pre
                                  style={{
                                    margin: 0,
                                    background: 'transparent',
                                    padding: 0,
                                    whiteSpace: 'pre-wrap',
                                    wordBreak: 'break-word',
                                  }}
                                >
                                  {pretty}
                                </pre>
                              );
                            } catch {
                              return <span>{String(output)}</span>;
                            }
                          })()
                        ) : (isLLMSpan ? llmContent : getToolOutput(span)) ? (
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={{
                              code({ className, children, ...props }) {
                                const isBlock =
                                  String(className || '').includes('language-') || String(children).includes('\n');
                                return (
                                  <code
                                    style={{
                                      background: '#eaeef2',
                                      padding: isBlock ? 8 : '2px 4px',
                                      display: isBlock ? 'block' : 'inline',
                                      borderRadius: 4,
                                      fontSize: 11,
                                      whiteSpace: 'pre-wrap',
                                    }}
                                    className={className}
                                    {...props}
                                  >
                                    {children}
                                  </code>
                                );
                              },
                              pre({ children }) {
                                return (
                                  <pre style={{ background: '#eaeef2', padding: 0, margin: 0, overflow: 'auto' }}>
                                    {children}
                                  </pre>
                                );
                              },
                            }}
                          >
                            {(isLLMSpan ? llmContent : getToolOutput(span)) || ''}
                          </ReactMarkdown>
                        ) : (
                          <span style={{ color: '#666' }}>(no content)</span>
                        )}
                      </div>
                    </div>
                    {isLLMSpan && (
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 4 }}>Tool Calls</div>
                        {toolCalls.length === 0 && <div style={{ fontSize: 12, color: '#666' }}>(none)</div>}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {toolCalls.map((tc, idx) => (
                            <CollapsibleToolCall key={idx} toolCall={tc} />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// SummarizeIO component using ContextView for old/new context and markdown for summary
function SummarizeIO({ span }: { span: SpanDoc }) {
  const attrs = (span.attributes || {}) as Record<string, unknown>;
  const oldContext = (attrs['oldContext'] as ContextMessageLike[]) || [];
  const newContext = (attrs['newContext'] as ContextMessageLike[]) || [];
  const summary = typeof attrs['summary'] === 'string' ? (attrs['summary'] as string) : undefined;
  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'stretch', height: '100%', minHeight: 0 }}>
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        <ContextView title="Old Context" messages={oldContext} />
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <h3 style={{ margin: '0 0 4px 0', fontSize: 13 }}>Summary</h3>
          <div
            style={{
              background: '#f6f8fa',
              border: '1px solid #e1e4e8',
              borderRadius: 4,
              padding: 8,
              fontSize: 12,
              fontFamily: 'monospace',
              whiteSpace: 'pre-wrap',
            }}
          >
            {summary ? (
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  code({ className, children, ...props }) {
                    const isBlock = String(className || '').includes('language-') || String(children).includes('\n');
                    return (
                      <code
                        style={{
                          background: '#eaeef2',
                          padding: isBlock ? 8 : '2px 4px',
                          display: isBlock ? 'block' : 'inline',
                          borderRadius: 4,
                          fontSize: 11,
                          whiteSpace: 'pre-wrap',
                        }}
                        className={className}
                        {...props}
                      >
                        {children}
                      </code>
                    );
                  },
                  pre({ children }) {
                    return (
                      <pre style={{ background: '#eaeef2', padding: 0, margin: 0, overflow: 'auto' }}>{children}</pre>
                    );
                  },
                }}
              >
                {summary}
              </ReactMarkdown>
            ) : (
              <span style={{ color: '#666' }}>(no summary)</span>
            )}
          </div>
        </div>
        <div style={{ flex: 1, minHeight: 0 }}>
          <ContextView title="New Context" messages={newContext} />
        </div>
      </div>
    </div>
  );
}

// --- Small presentational helpers ---
function TabButton({ active, onClick, children }: { active: boolean; onClick(): void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        appearance: 'none',
        border: 'none',
        borderBottom: active ? '3px solid #0366d6' : '3px solid transparent',
        background: 'transparent',
        padding: '8px 14px',
        cursor: 'pointer',
        fontWeight: 600,
        fontSize: 13,
        color: active ? '#0366d6' : '#333',
      }}
    >
      {children}
    </button>
  );
}

function Badge({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <span
      style={{
        background: color,
        color: '#fff',
        padding: '2px 6px',
        borderRadius: 10,
        fontSize: 10,
        lineHeight: 1,
        fontWeight: 600,
        display: 'inline-block',
      }}
    >
      {children}
    </span>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '4px 6px',
  borderBottom: '1px solid #ccc',
  position: 'sticky',
  top: 0,
};
const tdStyle: React.CSSProperties = { padding: '4px 6px', borderBottom: '1px solid #eee', verticalAlign: 'top' };

// Role badge for context messages
function RoleBadge({ role }: { role: string }) {
  const colors: Record<string, string> = {
    system: '#6a737d',
    human: '#22863a',
    ai: '#0366d6',
    tool: '#8250df',
  };
  return (
    <span
      style={{
        background: colors[role] || '#444',
        color: '#fff',
        padding: '2px 6px',
        borderRadius: 12,
        fontSize: 10,
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
      }}
    >
      {role}
    </span>
  );
}

// Lightweight duplicate of ToolCall interface (component-level interface is inside SpanDetails closure)
interface LocalToolCall {
  id?: string;
  name?: string;
  arguments?: unknown;
}
function CollapsibleToolCall({ toolCall }: { toolCall: LocalToolCall }) {
  const [open, setOpen] = useState(false);
  const argsStr = useMemo(() => {
    if (toolCall && toolCall.arguments !== undefined) {
      try {
        return JSON.stringify(toolCall.arguments, null, 2);
      } catch {
        return String(toolCall.arguments);
      }
    }
    return '{}';
  }, [toolCall]);
  return (
    <div style={{ border: '1px solid #e1e4e8', borderRadius: 4, overflow: 'hidden', fontSize: 12 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: '#f6f8fa',
          padding: '6px 8px',
          cursor: 'pointer',
        }}
        onClick={() => setOpen((o) => !o)}
      >
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontWeight: 600 }}>{toolCall.name || '(tool)'}</span>
          {toolCall.id && <span style={{ fontSize: 10, color: '#555' }}>{toolCall.id}</span>}
        </div>
        <span style={{ fontSize: 10, color: '#0366d6', fontWeight: 600 }}>{open ? 'Hide' : 'Show'}</span>
      </div>
      {open && (
        <pre
          style={{
            margin: 0,
            background: '#fff',
            padding: 8,
            fontSize: 11,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {argsStr}
        </pre>
      )}
    </div>
  );
}

// Renders tool input JSON using monaco editor (read-only)
function ToolInputViewer({ span }: { span: SpanDoc }) {
  const [_editorReady, setEditorReady] = useState(false); // reserved if we want to show state later
  const [EditorComp, setEditorComp] = useState<MonacoEditorComponent | null>(null);
  const inputValue = useMemo(() => {
    const attrs = (span.attributes || {}) as Record<string, unknown>;
    const toolObj = attrs['tool'] as Record<string, unknown> | undefined;
    const outputObj = attrs['output'] as Record<string, unknown> | undefined;
    const input =
      (attrs['input'] !== undefined ? attrs['input'] : undefined) ??
      (attrs['args'] !== undefined ? attrs['args'] : undefined) ??
      (toolObj && toolObj['input']) ??
      (outputObj && outputObj['input']);
    if (input == null) return '// (no input)';
    if (typeof input === 'string') {
      // If already JSON string try to pretty format
      try {
        return JSON.stringify(JSON.parse(input), null, 2);
      } catch {
        return input;
      }
    }
    try {
      return JSON.stringify(input, null, 2);
    } catch {
      return String(input);
    }
  }, [span.attributes]);

  useEffect(() => {
    let cancelled = false;
    ensureMonaco().then((Monaco) => {
      if (!cancelled) {
        setEditorComp(() => Monaco);
        setEditorReady(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, minHeight: 200, border: '1px solid #e1e4e8', borderRadius: 4, overflow: 'hidden' }}>
        {EditorComp ? (
          <EditorComp
            height="100%"
            defaultLanguage="json"
            value={inputValue}
            theme="vs-light"
            options={{ readOnly: true, minimap: { enabled: false }, fontSize: 12, scrollBeyondLastLine: false }}
          />
        ) : (
          <pre style={{ margin: 0, padding: 8, fontSize: 12, background: '#f6f8fa' }}>Loading editor…</pre>
        )}
      </div>
    </div>
  );
}
