import { useState, useRef, useEffect } from 'react';
import { useCheckpointStream } from '@/hooks/useCheckpointStream';
import { Button } from '@/components/ui/button';
import { CheckpointItem } from './CheckpointItem';

interface Props {
  defaultThreadId?: string;
  defaultCheckpointId?: string;
  url?: string;
}

export function CheckpointStreamPanel({ defaultThreadId = '', defaultCheckpointId = '', url }: Props) {
  const [threadId, setThreadId] = useState(defaultThreadId);
  const [checkpointId, setCheckpointId] = useState(defaultCheckpointId);
  const [autoScroll, setAutoScroll] = useState(true);

  const { items, status, error, connected, isPaused, pause, resume, clear, retry, dropped } = useCheckpointStream({
    url,
    threadId: threadId || undefined,
    checkpointId: checkpointId || undefined,
  });

  const listRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (autoScroll && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [items, autoScroll]);

  return (
    <div className="w-full max-w-5xl space-y-4">
      <div className="flex flex-wrap gap-2">
        <input
          className="h-9 flex-1 min-w-[160px] rounded border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          placeholder="threadId (optional)"
          value={threadId}
          onChange={(e) => setThreadId(e.target.value)}
        />
        <input
          className="h-9 flex-1 min-w-[160px] rounded border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          placeholder="checkpointId (optional)"
          value={checkpointId}
          onChange={(e) => setCheckpointId(e.target.value)}
        />
        <Button
          type="button"
          variant={isPaused ? 'secondary' : 'outline'}
          onClick={() => (isPaused ? resume() : pause())}
        >
          {isPaused ? 'Resume' : 'Pause'}
        </Button>
        <Button type="button" variant="outline" onClick={() => setAutoScroll((a) => !a)}>
          {autoScroll ? 'Auto-scroll: on' : 'Auto-scroll: off'}
        </Button>
        <Button type="button" variant="outline" onClick={() => clear()} disabled={!items.length}>
          Clear
        </Button>
        {status === 'error' && (
          <Button type="button" variant="destructive" onClick={retry}>
            Retry
          </Button>
        )}
      </div>

      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <div>
          <span className="font-medium text-foreground">{items.length}</span> items
          {dropped > 0 && <span className="ml-2 text-xs text-amber-600">({dropped} dropped)</span>}
        </div>
        <StatusChip status={status} connected={connected} />
        {error && <span className="text-red-600 text-xs">{error}</span>}
      </div>

      <div
        ref={listRef}
        className="max-h-[480px] overflow-auto rounded border border-border bg-card p-2"
        onScroll={(e) => {
          const el = e.currentTarget;
          const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 12;
          if (!atBottom) setAutoScroll(false);
        }}
      >
        {!items.length && status === 'ready' && (
          <p className="p-4 text-center text-sm text-muted-foreground">No writes yet.</p>
        )}
        {status === 'connecting' && <p className="p-2 text-xs text-muted-foreground">Connecting…</p>}
        {items.map((item) => (
          <CheckpointItem key={item.id} item={item} />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">Leave both inputs empty to stream all writes (capped live list).</p>
    </div>
  );
}

function StatusChip({ status, connected }: { status: string; connected: boolean }) {
  const base = 'inline-flex items-center rounded px-2 py-0.5 text-[10px] font-medium';
  if (status === 'error')
    return <span className={base + ' bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'}>error</span>;
  if (status === 'connecting')
    return (
      <span className={base + ' bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'}>connecting</span>
    );
  if (status === 'ready')
    return (
      <span className={base + ' bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'}>
        {connected ? 'live' : 'disconnected'}
      </span>
    );
  return <span className={base + ' bg-muted text-foreground'}>idle</span>;
}
