import { useCallback, useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';

export interface CheckpointWriteClient {
  id: string;
  checkpointId: string;
  threadId: string;
  taskId: string;
  channel: string;
  type: string;
  idx: number;
  value: unknown;
  createdAt: Date;
}

export interface UseCheckpointStreamParams {
  url?: string;
  threadId?: string;
  agentId?: string;
  maxItems?: number;
  autoStart?: boolean;
}

type Status = 'idle' | 'connecting' | 'ready' | 'error';

interface InitialPayload { items: any[] } // eslint-disable-line @typescript-eslint/no-explicit-any

export function useCheckpointStream({
  url = 'http://localhost:3010',
  threadId,
  agentId,
  maxItems = 500,
  autoStart = true,
}: UseCheckpointStreamParams) {
  const [items, setItems] = useState<CheckpointWriteClient[]>([]);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [dropped, setDropped] = useState(0);
  const sessionRef = useRef(0);
  const socketRef = useRef<Socket | null>(null);

  const disconnect = useCallback(() => {
    if (socketRef.current) {
      try { socketRef.current.disconnect(); } catch { /* ignore */ }
      socketRef.current = null;
    }
  }, []);

  const start = useCallback(() => {
    sessionRef.current += 1;
    const sid = sessionRef.current;
    setStatus('connecting');
    setError(null);
    setItems([]);
    setDropped(0);

    const socket = io(url, { transports: ['websocket'] });
    socketRef.current = socket;

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));

    socket.on('initial', (payload: InitialPayload) => {
      if (sessionRef.current !== sid) return; // stale
      const normalized = payload.items.map((n: any) => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
        ...n,
        createdAt: new Date(n.createdAt),
      }));
      setItems(normalized);
      setStatus('ready');
    });

    socket.on('append', (doc: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
      if (sessionRef.current !== sid) return;
      if (isPaused) return;
      setItems(prev => {
        if (prev.some(p => p.id === doc.id)) return prev; // dedupe
        const next = [...prev, { ...doc, createdAt: new Date(doc.createdAt) }];
        if (next.length > maxItems) {
          const overflow = next.length - maxItems;
            setDropped(d => d + overflow);
            return next.slice(overflow);
        }
        return next;
      });
    });

    socket.on('error', (e: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
      if (sessionRef.current !== sid) return;
      setError(e?.message || 'Unknown error');
      setStatus('error');
    });

    const initPayload: Record<string, string> = {};
    if (threadId) initPayload.threadId = threadId;
    if (agentId) initPayload.agentId = agentId;
    socket.emit('init', initPayload);

    return () => {
      socket.disconnect();
    };
  }, [url, threadId, agentId, isPaused, maxItems]);

  useEffect(() => {
    if (!autoStart) return;
    const cleanup = start();
    return cleanup;
  }, [start, autoStart]);

  useEffect(() => () => disconnect(), [disconnect]);

  const pause = () => setIsPaused(true);
  const resume = () => setIsPaused(false);
  const clear = () => setItems([]);
  const retry = () => {
    disconnect();
    start();
  };

  return { items, status, error, connected, isPaused, dropped, pause, resume, clear, retry } as const;
}
