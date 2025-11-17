import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Badge, Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@agyn/ui';
import type { ContainerItem, ContainerTerminalSessionResponse } from '@/api/modules/containers';
import { useCreateContainerTerminalSession } from '@/api/hooks/containers';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import '@xterm/xterm/css/xterm.css';
import { toWsUrl } from './toWsUrl';

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

  const mutateAsyncRef = useRef(mutation.mutateAsync);
  const resetRef = useRef(mutation.reset);
  const prevOpenRef = useRef(open);
  const inFlightRef = useRef(false);

  useEffect(() => {
    mutateAsyncRef.current = mutation.mutateAsync;
  }, [mutation.mutateAsync]);

  useEffect(() => {
    resetRef.current = mutation.reset;
  }, [mutation.reset]);

  useEffect(() => {
    if (prevOpenRef.current && !open) {
      setSession(null);
      setError(null);
      resetRef.current?.();
      inFlightRef.current = false;
    }
    prevOpenRef.current = open;
  }, [open]);

  const containerId = container?.containerId;

  useEffect(() => {
    if (!open || !containerId) {
      setSession(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setSession(null);
    setError(null);
    const mutate = mutateAsyncRef.current;
    if (!mutate || inFlightRef.current) return;
    inFlightRef.current = true;
    (async () => {
      try {
        const next = await mutate({ containerId });
        if (!cancelled) setSession(next);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        inFlightRef.current = false;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, containerId]);

  const handleRetry = () => {
    if (!containerId) return;
    if (inFlightRef.current) return;
    setSession(null);
    setError(null);
    resetRef.current?.();
    const mutate = mutateAsyncRef.current;
    if (!mutate) return;
    inFlightRef.current = true;
    void mutate({ containerId })
      .then(setSession)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        inFlightRef.current = false;
      });
  };

  const title = container ? `Terminal for ${container.containerId.substring(0, 12)}` : 'Terminal';

  return (
    <Dialog open={open} onOpenChange={(value) => { if (!value) onClose(); }}>
      <DialogContent
        className="max-w-3xl"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
        }}
      >
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

type TerminalStatus = 'connecting' | 'running' | 'closed' | 'error';

function TerminalConsole({ session, container, onClose }: TerminalConsoleProps) {
  const { cols: negotiatedCols, rows: negotiatedRows, shell } = session.negotiated;
  const terminalContainerRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const disposablesRef = useRef<Array<{ dispose(): void }>>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const pingRef = useRef<number | null>(null);
  const pendingInputRef = useRef<string[]>([]);
  const terminalDebugRef = useRef(false);
  const isMounted = useRef(true);
  const pendingResizeRef = useRef<{ cols: number; rows: number } | null>({ cols: negotiatedCols, rows: negotiatedRows });
  const dimsRef = useRef<{ cols: number; rows: number }>({ cols: negotiatedCols, rows: negotiatedRows });

  const [status, setStatus] = useState<TerminalStatus>('connecting');
  const [statusDetail, setStatusDetail] = useState<string | null>(null);
  const [exitCode, setExitCode] = useState<number | null>(null);

  const resolvedUrl = useMemo(() => toWsUrl(session.wsUrl), [session.wsUrl]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      terminalDebugRef.current = window.localStorage?.getItem('terminalDebug') === '1';
      if (terminalDebugRef.current && typeof console !== 'undefined' && typeof console.debug === 'function') {
        console.debug(`[terminal:${session.sessionId}] debug logging enabled`);
      }
    } catch {
      terminalDebugRef.current = false;
    }
  }, [session.sessionId]);

  const debugLog = useCallback(
    (event: string, details?: Record<string, unknown>) => {
      if (!terminalDebugRef.current) return;
      if (typeof console === 'undefined' || typeof console.debug !== 'function') return;
      try {
        console.debug(`[terminal:${session.sessionId}] ${event}`, details ?? {});
      } catch {
        // ignore debug logging errors
      }
    },
    [session.sessionId],
  );

  const setStatusIfChanged = useCallback((next: TerminalStatus) => {
    setStatus((prev) => (prev === next ? prev : next));
  }, []);

  const setStatusDetailIfChanged = useCallback((next: string | null) => {
    setStatusDetail((prev) => (prev === next ? prev : next));
  }, []);

  const disposeTerminal = useCallback(() => {
    disposablesRef.current.forEach((d) => {
      try {
        d.dispose();
      } catch {
        // noop
      }
    });
    disposablesRef.current = [];
    const fit = fitAddonRef.current as unknown as { dispose?: () => void } | null;
    fit?.dispose?.();
    fitAddonRef.current = null;
    pendingInputRef.current = [];
    if (termRef.current) {
      termRef.current.dispose();
      termRef.current = null;
    }
  }, []);

  const focusTerminal = useCallback((options?: FocusOptions) => {
    const host = terminalContainerRef.current;
    if (host) host.focus(options);
    termRef.current?.focus();
  }, []);

  const sendMessage = useCallback(
    (payload: unknown) => {
      const ws = wsRef.current;
      const type = typeof payload === 'object' && payload !== null && 'type' in payload ? (payload as { type?: unknown }).type : undefined;
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        debugLog('send skipped', { reason: 'socket_not_open', readyState: ws?.readyState, type });
        return;
      }
      try {
        ws.send(JSON.stringify(payload));
        debugLog('send message', { type, readyState: ws.readyState });
      } catch (err) {
        debugLog('send failed', { type, error: err instanceof Error ? err.message : String(err) });
        console.warn('terminal send failed', err);
      }
    },
    [debugLog],
  );

  const sendOrQueueInput = useCallback(
    (data: string) => {
      const ws = wsRef.current;
      const length = data.length;
      if (ws && ws.readyState === WebSocket.OPEN) {
        debugLog('input send immediate', { length, readyState: ws.readyState });
        sendMessage({ type: 'input', data });
      } else {
        pendingInputRef.current.push(data);
        debugLog('input queued', { length, queued: pendingInputRef.current.length });
      }
    },
    [debugLog, sendMessage],
  );

  const flushPendingInput = useCallback(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      debugLog('flush skipped', { reason: 'socket_not_open', readyState: ws?.readyState });
      return;
    }
    if (!pendingInputRef.current.length) {
      debugLog('flush skipped', { reason: 'queue_empty' });
      return;
    }
    const queued = pendingInputRef.current.splice(0, pendingInputRef.current.length);
    const totalBytes = queued.reduce((sum, value) => sum + value.length, 0);
    debugLog('flush queue start', { count: queued.length, totalBytes });
    queued.forEach((data, index) => {
      debugLog('flush queue send', { index, length: data.length });
      sendMessage({ type: 'input', data });
    });
  }, [debugLog, sendMessage]);

  const handleHostClick = useCallback(() => {
    focusTerminal({ preventScroll: true });
  }, [focusTerminal]);

  const handleHostFocus = useCallback(() => {
    termRef.current?.focus();
  }, []);

  const reportSize = useCallback(() => {
    const term = termRef.current;
    if (!term) return;
    const cols = term.cols;
    const rows = term.rows;
    if (!cols || !rows) return;
    if (dimsRef.current.cols === cols && dimsRef.current.rows === rows) return;
    dimsRef.current = { cols, rows };
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      debugLog('resize send', { cols, rows });
      sendMessage({ type: 'resize', cols, rows });
      pendingResizeRef.current = null;
    } else {
      debugLog('resize queued', { cols, rows });
      pendingResizeRef.current = { cols, rows };
    }
  }, [debugLog, sendMessage]);

  const instantiateTerminal = useCallback(() => {
    const host = terminalContainerRef.current;
    if (!host) return;
    disposeTerminal();
    pendingInputRef.current = [];
    const term = new Terminal({
      convertEol: true,
      cursorBlink: true,
      fontFamily: 'Menlo, Monaco, Consolas, monospace',
      theme: {
        background: '#0f172a',
        foreground: '#f8fafc',
        cursor: '#38bdf8',
      },
      scrollback: 5000,
    });
    termRef.current = term;
    dimsRef.current = { cols: negotiatedCols, rows: negotiatedRows };

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    fitAddonRef.current = fitAddon;
    try {
      const webgl = new WebglAddon();
      term.loadAddon(webgl);
    } catch (err) {
      if (typeof console !== 'undefined' && typeof console.debug === 'function') {
        console.debug('terminal webgl addon unavailable', err);
      }
    }

    term.open(host);
    focusTerminal({ preventScroll: true });
    pendingResizeRef.current = { cols: negotiatedCols, rows: negotiatedRows };

    const disposables = [
      term.onData((data) => {
        debugLog('xterm onData', { length: data.length, containsReturn: /\r/.test(data), containsNewline: /\n/.test(data) });
        sendOrQueueInput(data);
      }),
      term.onResize(() => {
        reportSize();
      }),
    ];
    disposablesRef.current = disposables;

    requestAnimationFrame(() => {
      focusTerminal({ preventScroll: true });
      fitAddon.fit();
      reportSize();
    });
  }, [debugLog, disposeTerminal, focusTerminal, negotiatedCols, negotiatedRows, reportSize, sendOrQueueInput]);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  useEffect(() => {
    pendingResizeRef.current = { cols: negotiatedCols, rows: negotiatedRows };
    dimsRef.current = { cols: negotiatedCols, rows: negotiatedRows };
  }, [negotiatedCols, negotiatedRows, session.sessionId]);

  useEffect(() => {
    instantiateTerminal();
    return () => disposeTerminal();
  }, [instantiateTerminal, disposeTerminal, session.sessionId, container.containerId]);

  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      const fit = fitAddonRef.current;
      if (!fit) return;
      requestAnimationFrame(() => {
        fit.fit();
        reportSize();
      });
    });
    const node = terminalContainerRef.current?.parentElement;
    if (node) observer.observe(node);
    const handleWindowResize = () => {
      const fit = fitAddonRef.current;
      if (!fit) return;
      fit.fit();
      reportSize();
    };
    window.addEventListener('resize', handleWindowResize);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', handleWindowResize);
    };
  }, [reportSize]);

  useEffect(() => {
    debugLog('ws connecting', { url: resolvedUrl });
    const ws = new WebSocket(resolvedUrl);
    wsRef.current = ws;
    setStatusIfChanged('connecting');
    setStatusDetailIfChanged(null);
    setExitCode((prev) => (prev === null ? prev : null));

    const onOpen = () => {
      if (!isMounted.current) return;
      debugLog('ws open', { readyState: ws.readyState });
      setStatusIfChanged('running');
      focusTerminal({ preventScroll: true });
      const pending = pendingResizeRef.current;
      if (pending) {
        debugLog('ws applying pending resize', { cols: pending.cols, rows: pending.rows });
        sendMessage({ type: 'resize', cols: pending.cols, rows: pending.rows });
        pendingResizeRef.current = null;
      }
      if (pendingInputRef.current.length) {
        debugLog('ws flushing queued input after open', { queued: pendingInputRef.current.length });
      }
      flushPendingInput();
    };

    const onMessage = (event: MessageEvent<string>) => {
      if (!isMounted.current) return;
      debugLog('ws message received', { bytes: event.data.length });
      try {
        const data = JSON.parse(event.data) as Record<string, unknown>;
        switch (data.type) {
          case 'output': {
            const text = typeof data.data === 'string' ? data.data : '';
            if (text) {
              debugLog('ws output', { length: text.length });
              termRef.current?.write(text);
            }
            break;
          }
          case 'status': {
            const phase = typeof data.phase === 'string' ? data.phase : '';
            debugLog('ws status', { phase });
            if (phase === 'error') {
              const reason = typeof data.reason === 'string' ? data.reason : 'Terminal error';
              setStatusIfChanged('error');
              setStatusDetailIfChanged(reason);
              termRef.current?.writeln(`\r\n\x1b[31m${reason}\x1b[0m`);
            } else if (phase === 'exited') {
              const exit = typeof data.exitCode === 'number' ? data.exitCode : null;
              setStatusIfChanged('closed');
              setExitCode((prev) => (prev === exit ? prev : exit));
              termRef.current?.writeln(`\r\n\x1b[33mProcess exited${exit !== null ? ` (code ${exit})` : ''}\x1b[0m`);
            } else if (phase === 'running') {
              setStatusIfChanged('running');
              setStatusDetailIfChanged(null);
            }
            break;
          }
          case 'error': {
            const reason = typeof data.message === 'string' ? data.message : data.code;
            const text = typeof reason === 'string' ? reason : 'Terminal error';
            debugLog('ws error payload', { message: text, code: data.code });
            setStatusIfChanged('error');
            setStatusDetailIfChanged(text);
            termRef.current?.writeln(`\r\n\x1b[31m${text}\x1b[0m`);
            break;
          }
          default:
            debugLog('ws unhandled message', { type: data.type });
            break;
        }
      } catch (err) {
        debugLog('ws message parse failed', { error: err instanceof Error ? err.message : String(err) });
        console.warn('terminal payload parse failed', err);
      }
    };

    const onError = (event: Event) => {
      if (!isMounted.current) return;
      const message = 'Terminal connection error';
      debugLog('ws error event', { type: event.type });
      setStatusIfChanged('error');
      setStatusDetailIfChanged(message);
      termRef.current?.writeln(`\r\n\x1b[31m${message}\x1b[0m`);
    };

    const onClose = (event: CloseEvent) => {
      if (!isMounted.current) return;
      debugLog('ws close', { code: event.code, reason: event.reason, wasClean: event.wasClean });
      setStatus((prev) => {
        if (prev === 'error') return prev;
        termRef.current?.writeln('\r\nSession closed');
        return 'closed';
      });
    };

    ws.addEventListener('open', onOpen);
    ws.addEventListener('message', onMessage as EventListener);
    ws.addEventListener('error', onError);
    ws.addEventListener('close', onClose);

    pingRef.current = window.setInterval(() => {
      debugLog('ws ping');
      sendMessage({ type: 'ping', ts: Date.now() });
    }, 20000);

    return () => {
      debugLog('ws cleanup start');
      if (pingRef.current) window.clearInterval(pingRef.current);
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
      debugLog('ws cleanup complete');
    };
  }, [debugLog, flushPendingInput, focusTerminal, resolvedUrl, sendMessage, setStatusDetailIfChanged, setStatusIfChanged]);

  const statusLabel = status === 'running' ? 'Running' : status === 'connecting' ? 'Connecting' : 'Closed';

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <Badge variant={status === 'running' ? 'outline' : 'secondary'}>{statusLabel}</Badge>
          <span>Shell: {shell}</span>
          {exitCode !== null && <span>Exit code: {exitCode}</span>}
          {statusDetail && <span className="text-red-500">{statusDetail}</span>}
        </div>
        <div>
          <Button size="sm" variant="ghost" onClick={() => onClose()}>End session</Button>
        </div>
      </div>
      <div className="h-[320px] w-full rounded border bg-black">
        <div
          ref={terminalContainerRef}
          className="h-full w-full"
          data-testid="terminal-view"
          aria-label={`Terminal for container ${container.containerId}`}
          tabIndex={0}
          onClick={handleHostClick}
          onFocus={handleHostFocus}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Tip: click inside the terminal to focus, use your keyboard for input, and scroll to review history.
      </p>
    </div>
  );
}
