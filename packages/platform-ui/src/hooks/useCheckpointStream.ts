import { useCallback, useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
<<<<<<< HEAD
import { getApiBase } from '@/api/client';
=======
import { getApiBase } from '@/api/client';
>>>>>>> e30249f6 (test(platform-ui): standardize imports to '@/api/graph' and '@/api/tracing' across graph tests/hooks; wrap NodeObsSidebar filtering test in ObsUiProvider with serverUrl to satisfy context; adjust dynamic import paths to alias for consistency)

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

interface ServerCheckpointWrite {
  id: string;
  checkpointId: string;
  threadId: string;
  taskId: string;
  channel: string;
  type: string;
  idx: number;
  value: unknown;
  createdAt: string;
}

interface InitialPayload {
  items: ServerCheckpointWrite[];
}

export function useCheckpointStream({
  url = getApiBase(),
  threadId,
  agentId,
  maxItems = 500,
  autoStart = true,
}: UseCheckpointStreamParams) {
  // Channels we do not want to keep in the in-memory list (internal branch transitions, etc.)
  const EXCLUDED_CHANNELS = useRef<Set<string>>(new Set(['branch:to:call_model', 'branch:to:summarize', 'summary']));
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
      try {
        socketRef.current.disconnect();
      } catch {
        /* ignore */
      }
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
      const normalized = payload.items
        .filter((n) => !EXCLUDED_CHANNELS.current.has(n.channel))
        .map((n): CheckpointWriteClient => ({
          ...n,
          createdAt: new Date(n.createdAt),
        }));
      setItems(normalized);
      setStatus('ready');
    });

    socket.on('append', (doc: ServerCheckpointWrite) => {
      if (sessionRef.current !== sid) return;
      if (isPaused) return;
      if (EXCLUDED_CHANNELS.current.has(doc.channel)) return;
      setItems((prev) => {
        if (prev.some((p) => p.id === doc.id)) return prev; // dedupe
        const next = [...prev, { ...doc, createdAt: new Date(doc.createdAt) } as CheckpointWriteClient];
        if (next.length > maxItems) {
          const overflow = next.length - maxItems;
          setDropped((d) => d + overflow);
          return next.slice(overflow);
        }
        return next;
      });
    });

    socket.on('error', (e: unknown) => {
      if (sessionRef.current !== sid) return;
      const msg = e instanceof Error ? e.message : 'Unknown error';
      setError(msg);
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
