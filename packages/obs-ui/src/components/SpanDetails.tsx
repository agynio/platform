import React, { useEffect, useState } from 'react';
import { SpanDoc, LogDoc } from '../types';
import { fetchLogs } from '../services/api';
import { spanRealtime } from '../services/socket';

export function SpanDetails({ span, onClose }: { span: SpanDoc; onClose(): void }) {
  const [logs, setLogs] = useState<LogDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchLogs({ spanId: span.spanId, traceId: span.traceId, limit: 200 })
      .then(items => { if (!cancelled) setLogs(items.reverse()); }) // show oldest first
      .catch(e => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    const off = spanRealtime.onLog(l => {
      if (l.spanId === span.spanId) {
        setLogs(prev => [...prev, l]);
      }
    });
    return () => { cancelled = true; off(); };
  }, [span.spanId, span.traceId]);

  return (
    <div style={{ padding: 16, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <h2 style={{ margin: '0 8px 0 0' }}>{span.label}</h2>
        <button onClick={onClose} style={{ marginLeft: 'auto' }}>Back to timeline</button>
      </div>
      <div style={{ fontFamily: 'monospace', fontSize: 12, color: '#555' }}>{span.spanId}</div>
      <p>Status: <strong>{span.status}</strong></p>
      <p>Start: {new Date(span.startTime).toLocaleString()}</p>
      {span.endTime && <p>End: {new Date(span.endTime).toLocaleString()}</p>}
      <p>Duration: {span.endTime ? (Date.parse(span.endTime) - Date.parse(span.startTime)) + ' ms' : 'running'}</p>
      {span.parentSpanId && <p>Parent: {span.parentSpanId}</p>}
      {span.threadId && <p>Thread: {span.threadId}</p>}
      {span.nodeId && <p>Node: {span.nodeId}</p>}
      <h3>Attributes</h3>
      <pre style={{ background: '#f1f3f5', padding: 8, borderRadius: 4 }}>{JSON.stringify(span.attributes, null, 2)}</pre>
      <h3>Events</h3>
      {span.events.length === 0 && <div style={{ color: '#666' }}>No events</div>}
      {span.events.map(e => (
        <div key={e.ts} style={{ fontSize: 13, marginBottom: 4 }}>
          <code>{new Date(e.ts).toLocaleTimeString()} - {e.name}</code>
        </div>
      ))}
      <h3>Logs</h3>
      {loading && <div style={{ color: '#666' }}>Loading logs...</div>}
      {error && <div style={{ color: 'red' }}>Error loading logs: {error}</div>}
      {!loading && !error && logs.length === 0 && <div style={{ color: '#666' }}>No logs</div>}
      {!loading && logs.length > 0 && (
        <div style={{ maxHeight: 240, overflow: 'auto', border: '1px solid #ddd', borderRadius: 4, background: '#fafafa' }}>
          {logs.map(l => (
            <div key={l.ts + l.message + Math.random()} style={{
              display: 'flex',
              gap: 8,
              padding: '4px 8px',
              borderBottom: '1px solid #eee',
              fontFamily: 'monospace',
              fontSize: 12,
              background: l.level === 'error' ? '#ffecec' : l.level === 'debug' ? '#f2f8ff' : 'transparent'
            }}>
              <span style={{ width: 90, color: '#555' }}>{new Date(l.ts).toLocaleTimeString()}</span>
              <span style={{ textTransform: 'uppercase', fontWeight: 600, color: l.level === 'error' ? '#d00' : l.level === 'debug' ? '#0366d6' : '#222', width: 50 }}>{l.level}</span>
              <span style={{ flex: 1 }}>{l.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
