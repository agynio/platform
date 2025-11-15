import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Badge, Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@agyn/ui';
import type { ContainerItem, ContainerTerminalSessionResponse } from '@/api/modules/containers';
import { useCreateContainerTerminalSession } from '@/api/hooks/containers';

type Props = {
  container: ContainerItem | null;
  open: boolean;
  onClose: () => void;
};

export function ContainerTerminalDialog({ container, open, onClose }: Props) {
  const mutation = useCreateContainerTerminalSession();
  const [session, setSession] = useState<ContainerTerminalSessionResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loading = mutation.status === 'pending';

  const containerId = container?.containerId;

  useEffect(() => {
    if (!open || !containerId) {
      setSession(null);
      setError(null);
      mutation.reset();
      return;
    }
    let cancelled = false;
    setSession(null);
    setError(null);
    (async () => {
      try {
        const next = await mutation.mutateAsync({ containerId });
        if (!cancelled) setSession(next);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, containerId, mutation]);

  const handleRetry = () => {
    if (!containerId) return;
    setSession(null);
    setError(null);
    mutation.reset();
    void mutation.mutateAsync({ containerId }).then(setSession).catch((err: unknown) => {
      setError(err instanceof Error ? err.message : String(err));
    });
  };

  const title = container ? `Terminal for ${container.containerId.substring(0, 12)}` : 'Terminal';

  return (
    <Dialog open={open} onOpenChange={(value) => { if (!value) onClose(); }}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <span>{title}</span>
            {container?.role && <Badge variant="outline">{container.role}</Badge>}
          </DialogTitle>
          <DialogDescription>
            {container?.threadId ? (
              <span className="font-mono text-xs">Thread {container.threadId}</span>
            ) : (
              <span className="text-xs text-muted-foreground">Detached container</span>
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          {loading && <div className="text-sm text-muted-foreground">Starting terminal session…</div>}
          {error && (
            <div className="flex items-center justify-between rounded border border-red-500/50 bg-red-500/10 px-3 py-2 text-sm text-red-600">
              <span>{error}</span>
              <Button size="sm" variant="ghost" onClick={handleRetry}>Retry</Button>
            </div>
          )}
          {session && container && (
            <TerminalConsole session={session} container={container} onClose={onClose} />
          )}
        </div>
        <DialogFooter className="flex items-center justify-between">
          <div className="text-xs text-muted-foreground">
            Session expires at {session ? new Date(session.expiresAt).toLocaleString() : 'pending…'}
          </div>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type TerminalConsoleProps = {
  session: ContainerTerminalSessionResponse;
  container: ContainerItem;
  onClose: () => void;
};

function TerminalConsole({ session, container, onClose }: TerminalConsoleProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const focusTrapRef = useRef<HTMLDivElement | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const pingRef = useRef<number | null>(null);
  const isMounted = useRef(true);
  const dimsRef = useRef<{ cols: number; rows: number }>({ ...session.negotiated });
  const pendingResizeRef = useRef<{ cols: number; rows: number } | null>(session.negotiated);

  const [output, setOutput] = useState('');
  const [status, setStatus] = useState<'connecting' | 'running' | 'closed' | 'error'>('connecting');
  const [statusDetail, setStatusDetail] = useState<string | null>(null);
  const [exitCode, setExitCode] = useState<number | null>(null);

  const resolvedUrl = useMemo(() => toWsUrl(session.wsUrl), [session.wsUrl]);

  const sendMessage = useCallback((payload: unknown) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    try {
      ws.send(JSON.stringify(payload));
    } catch (err) {
      console.warn('terminal send failed', err);
    }
  }, []);

  const applyResize = useCallback((cols: number, rows: number) => {
    dimsRef.current = { cols, rows };
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      sendMessage({ type: 'resize', cols, rows });
    } else {
      pendingResizeRef.current = { cols, rows };
    }
  }, [sendMessage]);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!focusTrapRef.current) return;
    focusTrapRef.current.focus({ preventScroll: true });
  }, [session.sessionId]);

  useEffect(() => {
    const ws = new WebSocket(resolvedUrl);
    wsRef.current = ws;
    setStatus('connecting');
    setStatusDetail(null);
    setExitCode(null);

    const onOpen = () => {
      if (!isMounted.current) return;
      setStatus('running');
      const pending = pendingResizeRef.current;
      if (pending) sendMessage({ type: 'resize', cols: pending.cols, rows: pending.rows });
    };

    const onMessage = (event: MessageEvent<string>) => {
      if (!isMounted.current) return;
      try {
        const data = JSON.parse(event.data) as Record<string, unknown>;
        switch (data.type) {
          case 'output': {
            const text = typeof data.data === 'string' ? data.data : '';
            if (text) setOutput((prev) => prev + text);
            break;
          }
          case 'status': {
            const phase = typeof data.phase === 'string' ? data.phase : '';
            if (phase === 'error') {
              setStatus('error');
              setStatusDetail(typeof data.reason === 'string' ? data.reason : 'Terminal error');
            } else if (phase === 'exited') {
              setStatus('closed');
              setExitCode(typeof data.exitCode === 'number' ? data.exitCode : null);
            } else if (phase === 'running') {
              setStatus('running');
            }
            break;
          }
          case 'error': {
            setStatus('error');
            const reason = typeof data.message === 'string' ? data.message : data.code;
            setStatusDetail(typeof reason === 'string' ? reason : 'Terminal error');
            break;
          }
          case 'pong':
          default:
            break;
        }
      } catch (err) {
        console.warn('terminal payload parse failed', err);
      }
    };

    const onError = () => {
      if (!isMounted.current) return;
      setStatus('error');
      setStatusDetail('Terminal connection error');
    };

    const onClose = () => {
      if (!isMounted.current) return;
      setStatus((prev) => (prev === 'error' ? prev : 'closed'));
    };

    ws.addEventListener('open', onOpen);
    ws.addEventListener('message', onMessage as EventListener);
    ws.addEventListener('error', onError);
    ws.addEventListener('close', onClose);

    pingRef.current = window.setInterval(() => {
      sendMessage({ type: 'ping', ts: Date.now() });
    }, 20000);

    return () => {
      if (pingRef.current) window.clearInterval(pingRef.current);
      pendingResizeRef.current = dimsRef.current;
      ws.removeEventListener('open', onOpen);
      ws.removeEventListener('message', onMessage as EventListener);
      ws.removeEventListener('error', onError);
      ws.removeEventListener('close', onClose);
      try {
        ws.send(JSON.stringify({ type: 'close' }));
      } catch {
        // ignore errors during shutdown
      }
      ws.close();
      wsRef.current = null;
    };
  }, [resolvedUrl, sendMessage]);

  useLayoutEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const estimateDimensions = () => {
      const width = el.clientWidth;
      const height = el.clientHeight;
      const cols = clamp(Math.floor(width / 8), 40, 200);
      const rows = clamp(Math.floor(height / 18), 10, 120);
      applyResize(cols, rows);
    };
    estimateDimensions();
    const observer = new ResizeObserver(() => estimateDimensions());
    observer.observe(el);
    return () => observer.disconnect();
  }, [applyResize]);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [output]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.metaKey) return;
    const data = translateKey(event);
    if (!data) return;
    event.preventDefault();
    sendMessage({ type: 'input', data });
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLDivElement>) => {
    event.preventDefault();
    const text = event.clipboardData?.getData('text');
    if (text) sendMessage({ type: 'input', data: text });
  };

  const statusLabel = status === 'running' ? 'Running' : status === 'connecting' ? 'Connecting' : 'Closed';

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <Badge variant={status === 'running' ? 'outline' : 'secondary'}>{statusLabel}</Badge>
          <span>Shell: {session.negotiated.shell}</span>
          {exitCode !== null && <span>Exit code: {exitCode}</span>}
          {statusDetail && <span className="text-red-500">{statusDetail}</span>}
        </div>
        <div>
          <Button size="sm" variant="ghost" onClick={() => onClose()}>End session</Button>
        </div>
      </div>
      <div ref={viewportRef} className="h-[320px] w-full overflow-auto rounded border bg-black text-green-200">
        <div
          ref={focusTrapRef}
          role="textbox"
          tabIndex={0}
          aria-label={`Terminal for container ${container.containerId}`}
          className="min-h-full cursor-text whitespace-pre-wrap break-words p-3 font-mono text-sm outline-none"
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
        >
          {output || ' '}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Tip: click inside the terminal area and use your keyboard. ESC + . (Ctrl+C) stops the current command.
      </p>
    </div>
  );
}

function translateKey(event: React.KeyboardEvent<HTMLDivElement>): string | null {
  const { key, ctrlKey, shiftKey } = event;
  if (ctrlKey && key.length === 1) {
    const upper = key.toUpperCase();
    const code = upper.charCodeAt(0) - 64;
    if (code >= 1 && code <= 26) {
      return String.fromCharCode(code);
    }
  }
  switch (key) {
    case 'Enter':
      return '\r';
    case 'Backspace':
      return '\b';
    case 'Tab':
      return '\t';
    case 'ArrowUp':
      return '\u001b[A';
    case 'ArrowDown':
      return '\u001b[B';
    case 'ArrowLeft':
      return '\u001b[D';
    case 'ArrowRight':
      return '\u001b[C';
    case 'Delete':
      return '\u001b[3~';
    case 'Home':
      return '\u001b[H';
    case 'End':
      return '\u001b[F';
    case 'Escape':
      return '\u001b';
    default:
      break;
  }
  if (key.length === 1) {
    if (key === ' ' && !shiftKey) return ' ';
    return key;
  }
  return null;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function toWsUrl(path: string): string {
  if (path.startsWith('ws://') || path.startsWith('wss://')) return path;
  const { protocol, host } = window.location;
  const wsProto = protocol === 'https:' ? 'wss:' : 'ws:';
  if (path.startsWith('/')) return `${wsProto}//${host}${path}`;
  return `${wsProto}//${host}/${path.replace(/^\/?/, '')}`;
}
