import { useCallback, useEffect, useRef, useState } from 'react';
import { runs } from '@/api/modules/runs';
import type { ToolOutputChunk, ToolOutputTerminal } from '@/api/types/agents';
import { graphSocket } from '@/lib/graph/socket';

type StreamState = {
  text: string;
  stdoutText: string;
  stderrText: string;
  chunks: ToolOutputChunk[];
  lastSeq: number;
  terminal: ToolOutputTerminal | null;
  hydrated: boolean;
};

type Options = {
  runId: string;
  eventId: string;
  enabled: boolean;
};

const INITIAL_STATE: StreamState = {
  text: '',
  stdoutText: '',
  stderrText: '',
  chunks: [],
  lastSeq: 0,
  terminal: null,
  hydrated: false,
};

export function useToolOutputStreaming({ runId, eventId, enabled }: Options) {
  const [state, setState] = useState<StreamState>(INITIAL_STATE);
  const [loading, setLoading] = useState<boolean>(enabled);
  const [error, setError] = useState<Error | null>(null);

  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  const lastSeqRef = useRef(0);
  const catchupRef = useRef<Promise<void> | null>(null);

  const applyState = useCallback((updater: (prev: StreamState) => StreamState) => {
    setState((prev) => {
      const next = updater(prev);
      lastSeqRef.current = next.lastSeq;
      return next;
    });
  }, []);

  const fetchSnapshot = useCallback(
    async (sinceSeq?: number) => {
      if (!enabledRef.current) return;
      if (!runId || !eventId) return;
      const order: 'asc' | 'desc' = 'asc';
      const params: { order: 'asc' | 'desc'; sinceSeq?: number } = { order };
      if (sinceSeq && sinceSeq > 0) params.sinceSeq = sinceSeq;
      try {
        if (!sinceSeq) setLoading(true);
        const snapshot = await runs.toolOutputSnapshot(runId, eventId, params);
        setError(null);
        applyState((prev) => {
          const append = Boolean(sinceSeq && sinceSeq > 0);
          const baseSeq = append ? prev.lastSeq : 0;
          const baseChunks = append ? prev.chunks.slice() : [];
          let nextSeq = baseSeq;
          let nextText = append ? prev.text : '';
          let nextStdout = append ? prev.stdoutText : '';
          let nextStderr = append ? prev.stderrText : '';
          for (const chunk of snapshot.items ?? []) {
            if (chunk.seqGlobal <= nextSeq) continue;
            baseChunks.push(chunk);
            nextSeq = chunk.seqGlobal;
            nextText += chunk.data;
            if (chunk.source === 'stdout') {
              nextStdout += chunk.data;
            } else {
              nextStderr += chunk.data;
            }
          }
          const nextTerminal = snapshot.terminal ?? (append ? prev.terminal : null);
          return {
            text: nextText,
            stdoutText: nextStdout,
            stderrText: nextStderr,
            chunks: baseChunks,
            lastSeq: nextSeq,
            terminal: nextTerminal ?? null,
            hydrated: true,
          };
        });
      } catch (err) {
        if (!sinceSeq) {
          const normalized = err instanceof Error ? err : new Error(String(err));
          setError(normalized);
        }
        throw err;
      } finally {
        if (!sinceSeq) setLoading(false);
      }
    },
    [applyState, eventId, runId],
  );

  useEffect(() => {
    applyState(() => INITIAL_STATE);
    setError(null);
    setLoading(enabled);
    if (!enabled || !runId || !eventId) return;
    fetchSnapshot().catch(() => {
      /* error captured in state */
    });
  }, [applyState, enabled, eventId, fetchSnapshot, runId]);

  const requestCatchup = useCallback(
    (fromSeq: number) => {
      if (!enabledRef.current) return;
      if (!runId || !eventId) return;
      if (catchupRef.current) return;
      catchupRef.current = fetchSnapshot(fromSeq)
        .catch(() => {
          /* catch-up errors already surfaced via state */
        })
        .finally(() => {
          catchupRef.current = null;
        });
    },
    [eventId, fetchSnapshot, runId],
  );

  useEffect(() => {
    if (!enabled) return;
    const offChunk = graphSocket.onToolOutputChunk((payload) => {
      if (payload.runId !== runId || payload.eventId !== eventId) return;
      applyState((prev) => {
        if (payload.seqGlobal <= prev.lastSeq) return prev;
        if (payload.seqGlobal > prev.lastSeq + 1) {
          requestCatchup(prev.lastSeq);
          return prev;
        }
        const nextChunks = prev.chunks.concat(payload);
        return {
          ...prev,
          text: prev.text + payload.data,
          stdoutText: payload.source === 'stdout' ? prev.stdoutText + payload.data : prev.stdoutText,
          stderrText: payload.source === 'stderr' ? prev.stderrText + payload.data : prev.stderrText,
          chunks: nextChunks,
          lastSeq: payload.seqGlobal,
          hydrated: true,
        };
      });
    });
    const offTerminal = graphSocket.onToolOutputTerminal((payload) => {
      if (payload.runId !== runId || payload.eventId !== eventId) return;
      applyState((prev) => {
        const prevTs = prev.terminal ? Date.parse(prev.terminal.ts) || 0 : 0;
        const nextTs = Date.parse(payload.ts) || 0;
        if (prev.terminal && prevTs >= nextTs) return prev;
        return { ...prev, terminal: payload };
      });
    });
    const offReconnect = graphSocket.onReconnected(() => {
      if (!enabledRef.current) return;
      requestCatchup(lastSeqRef.current);
    });
    return () => {
      offChunk();
      offTerminal();
      offReconnect();
    };
  }, [applyState, enabled, eventId, requestCatchup, runId]);

  return {
    text: state.text,
    stdoutText: state.stdoutText,
    stderrText: state.stderrText,
    chunks: state.chunks,
    terminal: state.terminal,
    hydrated: state.hydrated,
    lastSeq: state.lastSeq,
    loading,
    error,
  };
}
