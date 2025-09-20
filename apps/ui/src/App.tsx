import React, { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';

interface CheckpointWriteNormalized {
  id: string;
  checkpointId: string;
  threadId: string;
  taskId: string;
  channel: string;
  type: string;
  idx: number;
  value: any;
  createdAt: string;
}

interface UseCheckpointParams {
  url?: string;
  threadId: string;
  checkpointId: string;
}

function useCheckpointStream({ url = 'http://localhost:3010', threadId, checkpointId }: UseCheckpointParams) {
  const [items, setItems] = useState<CheckpointWriteNormalized[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const socket = io(url, { transports: ['websocket'] });
    socketRef.current = socket;

    socket.on('connect', () => {
      const payload: any = {};
      if (threadId) payload.threadId = threadId;
      if (checkpointId) payload.checkpointId = checkpointId;
      socket.emit('init', payload);
    });

    socket.on('initial', (payload: { items: any[] }) => {
      setItems(payload.items.map(i => ({ ...i, createdAt: i.createdAt }))); // keep as is
      setLoading(false);
    });

    socket.on('append', (doc: any) => {
      setItems(prev => [...prev, doc]);
    });

    socket.on('error', (e: any) => {
      setError(e?.message || 'Unknown error');
      setLoading(false);
    });

    return () => {
      socket.disconnect();
    };
  }, [url, threadId, checkpointId]);

  return { items, loading, error };
}

function CheckpointViewer({ threadId, checkpointId }: { threadId: string; checkpointId: string }) {
  const { items, loading, error } = useCheckpointStream({ threadId, checkpointId });
  const listRef = useRef<HTMLDivElement | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  useEffect(() => {
    if (autoScroll && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [items, autoScroll]);

  if (loading) return <p>Loading...</p>;
  if (error) return <p style={{ color: 'red' }}>{error}</p>;
  return (
    <div style={{ border: '1px solid #ddd', borderRadius: 4, padding: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <strong>Checkpoint Writes ({items.length})</strong>
        <label style={{ fontSize: 12 }}>
          <input
            type="checkbox"
            checked={autoScroll}
            onChange={() => setAutoScroll(s => !s)}
            style={{ marginRight: 4 }}
          />
          Auto-scroll
        </label>
      </div>
      <div
        ref={listRef}
        style={{ maxHeight: 400, overflow: 'auto', fontFamily: 'monospace', fontSize: 12 }}
        onScroll={e => {
          const el = e.currentTarget;
          const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 10;
          if (!atBottom) setAutoScroll(false);
        }}
      >
        {items.map(item => (
          <div key={item.id} style={{ padding: '4px 0', borderBottom: '1px solid #eee' }}>
            <div>
              <span style={{ color: '#555' }}>{new Date(item.createdAt).toLocaleTimeString()}</span>
              {' '}#{item.idx} {item.channel}
            </div>
            <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{JSON.stringify(item.value, null, 2)}</pre>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function App() {
  const [threadId, setThreadId] = useState('');
  const [checkpointId, setCheckpointId] = useState('');
  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', padding: '2rem' }}>
      <h1>Agents UI</h1>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input
          placeholder="threadId (optional)"
          value={threadId}
          onChange={e => setThreadId(e.target.value)}
          style={{ flex: 1 }}
        />
        <input
          placeholder="checkpointId (optional)"
          value={checkpointId}
          onChange={e => setCheckpointId(e.target.value)}
          style={{ flex: 1 }}
        />
      </div>
      <CheckpointViewer threadId={threadId} checkpointId={checkpointId} />
      <p style={{ marginTop: 24, fontSize: 12, color: '#666' }}>
        Leave both empty to stream all writes.
      </p>
    </div>
  );
}
