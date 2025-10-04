import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchTraces } from '../services/api';
import { SpanDoc } from '../types';

interface TraceSummary { traceId: string; root?: SpanDoc; spanCount: number; lastUpdate: string; }

export function TracesListPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [traces, setTraces] = useState<TraceSummary[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetchTraces().then(data => {
      if (cancelled) return;
      setTraces(data);
    }).catch(e => { if (!cancelled) setError(e.message || 'error'); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (loading) return <div style={{ padding: 16 }}>Loading traces...</div>;
  if (error) return <div style={{ padding: 16, color: 'red' }}>Error: {error}</div>;

  return (
    <div style={{ padding: 16 }}>
      <h1 style={{ marginTop: 0 }}>Traces</h1>
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
