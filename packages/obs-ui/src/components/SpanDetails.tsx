import React, { useEffect, useMemo, useState } from 'react';
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
  const displayedAttrs = attrsExpanded || !showCollapseToggle
    ? attrsJson
    : attrsJson.slice(0, ATTRS_COLLAPSE_THRESHOLD) + '\n… (truncated)';

  // Tabs: attributes | logs
  type TabKey = 'attributes' | 'logs';
  const [activeTab, setActiveTab] = useState<TabKey>('attributes');

  // Log severity counts (only in logs tab header badges)
  const severityCounts = useMemo(() => {
    const counts = { debug: 0, info: 0, error: 0 };
    filteredLogs.forEach(l => {
      if (l.level in counts) (counts as any)[l.level]++;
    });
    return counts;
  }, [filteredLogs]);

  return (
    <div style={{
      padding: 16,
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
      height: '100%',
      flex: 1,
      minHeight: 0,
      boxSizing: 'border-box'
    }}>
      {/* Top area now minimal; back button moved inside details panel */}
      {/* Layout: Details panel (without attributes/events) + tabbed section */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0, flexDirection: 'column', gap: 8 }}>
        {/* Back button now outside details panel */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={onClose} style={{ fontSize: 11, padding: '4px 8px', cursor: 'pointer' }}>← Back</button>
        </div>
        {/* Details panel */}
        <div style={{ flex: '0 0 auto', display: 'flex', flexDirection: 'column', overflow: 'hidden', border: '1px solid #eee', borderRadius: 6 }}>
          <div style={{ padding: '8px 10px', borderBottom: '1px solid #eee', background: '#fafbfc', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: 0.5 }}>Details</span>
          </div>
          <div style={{ overflowY: 'auto', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, fontFamily: 'monospace', color: '#222' }}>
            {/* 5-line concise layout: title, id, parent, status, time */}
            <div style={{ lineHeight: 1.35 }}><strong style={{ minWidth: 60, display: 'inline-block' }}>Title:</strong> {span.label || '(no title)'}</div>
            <div style={{ lineHeight: 1.35 }}><strong style={{ minWidth: 60, display: 'inline-block' }}>ID:</strong> {span.spanId}</div>
            <div style={{ lineHeight: 1.35 }}><strong style={{ minWidth: 60, display: 'inline-block' }}>Parent:</strong> {span.parentSpanId || '(root)'}</div>
            <div style={{ lineHeight: 1.35 }}><strong style={{ minWidth: 60, display: 'inline-block' }}>Status:</strong> {span.status}</div>
            <div style={{ lineHeight: 1.35 }}>
              <strong style={{ minWidth: 60, display: 'inline-block' }}>Time:</strong>
              <span style={{ color: '#555' }}>Start {new Date(span.startTime).toLocaleString()}</span>
              {' | '}
              <span style={{ color: '#555' }}>End {span.endTime ? new Date(span.endTime).toLocaleString() : '—'}</span>
              {' | '}
              <span style={{ color: '#555' }}>Duration {span.endTime ? (Date.parse(span.endTime) - Date.parse(span.startTime)) + ' ms' : 'running'}</span>
            </div>
          </div>
        </div>

        {/* Tabs container */}
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', border: '1px solid #ddd', borderRadius: 6, overflow: 'hidden' }}>
          <div style={{ display: 'flex', borderBottom: '1px solid #ddd', background: '#f8f9fa' }}>
            <TabButton active={activeTab === 'attributes'} onClick={() => setActiveTab('attributes')}>Attributes</TabButton>
            <TabButton active={activeTab === 'logs'} onClick={() => setActiveTab('logs')}>
              Logs
              {(severityCounts.debug + severityCounts.info + severityCounts.error) > 0 && (
                <span style={{ display: 'inline-flex', gap: 6, marginLeft: 8 }}>
                  {severityCounts.debug > 0 && <Badge color="#0366d6">D:{severityCounts.debug}</Badge>}
                  {severityCounts.info > 0 && <Badge color="#444">I:{severityCounts.info}</Badge>}
                  {severityCounts.error > 0 && <Badge color="#d00">E:{severityCounts.error}</Badge>}
                </span>
              )}
            </TabButton>
            <div style={{ marginLeft: 'auto', padding: '6px 10px', fontSize: 11, color: '#666' }}>
              {activeTab === 'logs' && (
                <>{loading ? 'loading…' : error ? 'error loading logs' : filteredLogs.length + ' entries'}</>
              )}
            </div>
          </div>
          {/* Tab content */}
          <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: 12 }}>
            {activeTab === 'attributes' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <h3 style={{ margin: 0 }}>Attributes</h3>
                  {showCollapseToggle && (
                    <button
                      onClick={() => setAttrsExpanded(v => !v)}
                      style={{ fontSize: 11, padding: '2px 6px', cursor: 'pointer' }}
                    >
                      {attrsExpanded ? 'Collapse' : 'Expand'}
                    </button>
                  )}
                </div>
                <pre style={{
                  background: '#f1f3f5',
                  padding: 8,
                  borderRadius: 4,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  fontSize: 11,
                  maxHeight: attrsExpanded ? 400 : 240,
                  overflow: 'auto'
                }}>{displayedAttrs}</pre>
              </div>
            )}
            {activeTab === 'logs' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minHeight: 0, height: '100%' }}>
                {(!loading && !error && filteredLogs.length === 0) && (
                  <div style={{ fontSize: 12, color: '#666' }}>No logs in subtree</div>
                )}
                {(!loading && filteredLogs.length > 0) && (
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
                              <td style={{
                                ...tdStyle,
                                fontWeight: 600,
                                color: l.level === 'error' ? '#d00' : l.level === 'debug' ? '#0366d6' : '#222'
                              }}>{l.level.toUpperCase()}</td>
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
          </div>
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
        color: active ? '#0366d6' : '#333'
      }}
    >{children}</button>
  );
}

function Badge({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <span style={{
      background: color,
      color: '#fff',
      padding: '2px 6px',
      borderRadius: 10,
      fontSize: 10,
      lineHeight: 1,
      fontWeight: 600,
      display: 'inline-block'
    }}>{children}</span>
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
