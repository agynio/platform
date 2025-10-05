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

  // Collapsible attributes
  const [attrsExpanded, setAttrsExpanded] = useState(false);
  const attrsJson = useMemo(() => JSON.stringify(span.attributes, null, 2), [span.attributes]);
  const ATTRS_COLLAPSE_THRESHOLD = 1200; // characters before collapsing by default
  const showCollapseToggle = attrsJson.length > ATTRS_COLLAPSE_THRESHOLD;
  const displayedAttrs = attrsExpanded || !showCollapseToggle
    ? attrsJson
    : attrsJson.slice(0, ATTRS_COLLAPSE_THRESHOLD) + '\n… (truncated)';

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
      <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
        <h2 style={{ margin: '0 8px 0 0' }}>{span.label}</h2>
        <button onClick={onClose} style={{ marginLeft: 'auto' }}>Back to timeline</button>
      </div>
      {/* Two-region split: top scroll, bottom logs */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0, gap: 12, flexDirection: 'column' }}>
        <div style={{ flex: '0 0 auto', maxHeight: '55%', minHeight: 180, display: 'flex', flexDirection: 'column', overflow: 'hidden', border: '1px solid #eee', borderRadius: 6 }}>
          <div style={{ padding: '8px 10px', borderBottom: '1px solid #eee', fontWeight: 600, background: '#fafbfc' }}>Details</div>
          <div style={{ overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontFamily: 'monospace', fontSize: 12, color: '#555' }}>{span.spanId}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, fontSize: 12 }}>
              <div>Status: <strong>{span.status}</strong></div>
              <div>Start: {new Date(span.startTime).toLocaleString()}</div>
              {span.endTime && <div>End: {new Date(span.endTime).toLocaleString()}</div>}
              <div>Duration: {span.endTime ? Date.parse(span.endTime) - Date.parse(span.startTime) + ' ms' : 'running'}</div>
              {span.parentSpanId && <div>Parent: {span.parentSpanId}</div>}
              {span.threadId && <div>Thread: {span.threadId}</div>}
              {span.nodeId && <div>Node: {span.nodeId}</div>}
            </div>
            <div>
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
                maxHeight: attrsExpanded ? 300 : 160,
                overflow: 'auto'
              }}>{displayedAttrs}</pre>
            </div>
            <div>
              <h3 style={{ margin: '4px 0' }}>Events</h3>
              {span.events.length === 0 && <div style={{ color: '#666', fontSize: 12 }}>No events</div>}
              {span.events.map(e => (
                <div key={e.ts} style={{ fontSize: 12, marginBottom: 2 }}>
                  <code>{new Date(e.ts).toLocaleTimeString()} - {e.name}</code>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', border: '1px solid #ddd', borderRadius: 6 }}>
          <div style={{ padding: '6px 10px', borderBottom: '1px solid #ddd', background: '#f8f9fa', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
            Logs (subtree)
            {loading && <span style={{ fontWeight: 400, color: '#666', fontSize: 11 }}>loading…</span>}
            {!loading && !error && <span style={{ fontWeight: 400, color: '#666', fontSize: 11 }}>{filteredLogs.length} entries</span>}
            {error && <span style={{ color: 'red', fontWeight: 400 }}>{error}</span>}
          </div>
          {/* Logs table scroll region */}
            {(!loading && !error && filteredLogs.length === 0) && (
              <div style={{ padding: 12, fontSize: 12, color: '#666' }}>No logs in subtree</div>
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
      </div>
    </div>
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
