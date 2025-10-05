import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchTraces } from '../services/api';
import { spanRealtime } from '../services/socket';
import { SpanDoc } from '../types';

interface TraceSummary { traceId: string; root?: SpanDoc; spanCount: number; lastUpdate: string; }

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
            const next = [{ traceId: span.traceId, root, spanCount: 1, lastUpdate: span.lastUpdate }, ...prev];
            return next.sort((a,b) => Date.parse(b.lastUpdate) - Date.parse(a.lastUpdate));
        }
        const updated = prev.map(t => {
          if (t.traceId !== span.traceId) return t;
          const root = t.root || (!span.parentSpanId ? span : undefined) || t.root;
          const spanCount = t.spanCount + ( // increment if new unique
            // naive: if spanId not in current root tree count; we don't track all span ids here, so just bump when lastUpdate changes and rev===0
            0
          );
          // For simplicity (Stage1) we will refetch counts later; but keep lastUpdate fresh
          return { ...t, root, lastUpdate: span.lastUpdate, spanCount: spanCount };
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
            <th>Root Label</th>
            <th>Spans</th>
            <th>Last Update</th>
          </tr>
        </thead>
        <tbody>
          {traces.map(t => (
            <tr key={t.traceId} style={{ borderBottom: '1px solid #eee' }}>
              <td><Link to={`/trace/${t.traceId}`}>{t.traceId}</Link></td>
              <td>{t.root?.label}</td>
              <td>{t.spanCount}</td>
              <td>{new Date(t.lastUpdate).toLocaleTimeString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
