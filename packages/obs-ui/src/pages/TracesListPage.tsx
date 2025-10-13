import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchTraces } from '../services/api';
import { spanRealtime } from '../services/socket';
import { SpanDoc } from '../types';
import { emojiHash3 } from '../utils/emojiId';

interface TraceSummary { traceId: string; root?: SpanDoc; spanCount: number; failedCount: number; lastUpdate: string; }

export function TracesListPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [traces, setTraces] = useState<TraceSummary[]>([]);
  const [conn, setConn] = useState<{ connected: boolean; lastPongTs: number | null }>({ connected: false, lastPongTs: null });

  useEffect(() => {
    let cancelled = false;
    fetchTraces().then(data => {
      if (cancelled) return;
  setTraces(data);
    }).catch(e => { if (!cancelled) setError(e.message || 'error'); }).finally(() => { if (!cancelled) setLoading(false); });
    // Realtime subscription: update/insert trace summaries
    const off = spanRealtime.onSpanUpsert(span => {
      setTraces(prev => {
        // derive summary fields
        let existing = prev.find(t => t.traceId === span.traceId);
        if (!existing) {
          const root = !span.parentSpanId ? span : undefined;
            const failedCount = span.status === 'error' ? 1 : 0;
            const next = [{ traceId: span.traceId, root, spanCount: 1, failedCount, lastUpdate: span.lastUpdate }, ...prev];
            return next.sort((a,b) => Date.parse(b.lastUpdate) - Date.parse(a.lastUpdate));
        }
        const updated = prev.map(t => {
          if (t.traceId !== span.traceId) return t;
          const root = t.root || (!span.parentSpanId ? span : undefined) || t.root;
          // We cannot reliably know if it's a new span vs update without tracking IDs; approximate: if rev===0 treat as new
          const spanCount = t.spanCount + (span.rev === 0 ? 1 : 0);
          const failedCount = t.failedCount + (span.rev === 0 && span.status === 'error' ? 1 : 0) + (span.rev > 0 && span.status === 'error' && t.failedCount === 0 ? 0 : 0); // basic increment only on creation
          return { ...t, root, lastUpdate: span.lastUpdate, spanCount, failedCount };
        });
        return updated.sort((a,b) => Date.parse(b.lastUpdate) - Date.parse(a.lastUpdate));
      });
    });
    const offConn = spanRealtime.onConnectionState(s => setConn(s));
    return () => { cancelled = true; offConn(); };
  }, []);

  if (loading) return <div style={{ padding: 16 }}>Loading traces...</div>;
  if (error) return <div style={{ padding: 16, color: 'red' }}>Error: {error}</div>;

  return (
    <div style={{ padding: 16 }}>
      <h1 style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: 8 }}>Traces
        <span style={{ fontSize: 11, fontWeight: 400, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: conn.connected ? '#28a745' : '#ccc', boxShadow: conn.connected ? '0 0 4px #28a745' : 'none' }} />
          {conn.connected ? 'live' : 'offline'}
        </span>
      </h1>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ textAlign: 'left', borderBottom: '1px solid #ddd' }}>
            <th>Trace ID</th>
            <th>Thread ID</th>
            <th>Root Label</th>
            <th>Status</th>
            <th>Spans</th>
            <th>Last Update</th>
          </tr>
        </thead>
        <tbody>
          {traces.map(t => (
            <tr key={t.traceId} style={{ borderBottom: '1px solid #eee' }}>
              <td><Link to={`/trace/${t.traceId}`}>{t.traceId}</Link></td>
              <td>
                {(() => {
                  const attrThreadId = t.root?.attributes?.threadId;
                  const threadId = t.root?.threadId ?? (typeof attrThreadId === 'string' ? attrThreadId : undefined);
                  if (!threadId) return '-';
                  const e3 = emojiHash3(threadId);
                  return (
                    <Link to={`/thread/${threadId}`} title={threadId} style={{ textDecoration: 'none', color: 'inherit' }}>
                      <span style={{ fontSize: 18, marginRight: 6 }}>{e3}</span>
                      <span style={{ color: '#6c757d', fontSize: 11 }}>({threadId})</span>
                    </Link>
                  );
                })()}
              </td>
              <td>{t.root?.label}</td>
              <td>{t.root?.status && <StatusBadge status={t.root.status} />}</td>
              <td>{t.spanCount} {t.failedCount > 0 && <span style={{ color: 'red' }}>({t.failedCount})</span>}</td>
              <td>{new Date(t.lastUpdate).toLocaleTimeString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatusBadge({ status }: { status: SpanDoc['status'] }) {
  const color = status === 'error' ? '#dc3545' : status === 'ok' ? '#28a745' : status === 'running' ? '#ffc107' : '#6c757d';
  const bg = status === 'running' ? '#fff3cd' : status === 'error' ? '#f8d7da' : status === 'ok' ? '#d4edda' : '#e2e3e5';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, padding: '2px 6px', borderRadius: 12, background: bg, color }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: color }} />
      {status}
    </span>
  );
}
