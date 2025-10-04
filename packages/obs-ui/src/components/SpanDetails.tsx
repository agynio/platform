import React from 'react';
import { SpanDoc } from '../types';

export function SpanDetails({ span, onClose }: { span: SpanDoc; onClose(): void }) {
  return (
    <div style={{ padding: 16, overflow: 'auto' }}>
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
    </div>
  );
}
