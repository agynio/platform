import { useState, useRef, useEffect } from 'react';
import { useCheckpointStream } from '@/hooks/useCheckpointStream';
import { Button, Input } from '@hautech/ui';
import { CheckpointItem } from './CheckpointItem';
import { StatusChip } from './StatusChip';

interface Props {
  defaultThreadId?: string;
  agentId?: string;
  url?: string;
}

export function CheckpointStreamPanel({ defaultThreadId = '', agentId, url }: Props) {
  const [threadId, setThreadId] = useState(defaultThreadId);
  const [autoScroll, setAutoScroll] = useState(true);

  const { items, status, error, connected, isPaused, pause, resume, clear, retry, dropped } = useCheckpointStream({
    url,
    threadId: threadId || undefined,
    agentId,
  });

  const listRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (autoScroll && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [items, autoScroll]);

  const applyThreadFilter = (tid: string) => {
    setThreadId(tid);
  };

  const clearThreadFilter = () => {
    setThreadId('');
  };

  return (
    <div className="w-full max-w-5xl space-y-4">
      <div className="flex flex-wrap gap-2">
        <Input
          className="flex-1 min-w-[160px]"
          placeholder="threadId (optional)"
          value={threadId}
          onChange={(e) => setThreadId(e.target.value)}
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
        {threadId && (
          <Button type="button" variant="secondary" onClick={clearThreadFilter}>
            Thread: {threadId.slice(0, 8)}… (reset)
          </Button>
        )}
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
          <CheckpointItem
            key={item.id}
            item={item}
            onFilterThread={applyThreadFilter}
            currentThreadId={threadId || undefined}
          />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">Leave threadId empty to stream all writes (capped live list).</p>
    </div>
  );
}
