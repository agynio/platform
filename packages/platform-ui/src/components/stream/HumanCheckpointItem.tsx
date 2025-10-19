import { useState } from 'react';
import { Button } from '@hautech/ui';
import type { CheckpointWriteClient } from '@/hooks/useCheckpointStream';
import { CheckpointItemUI } from './CheckpointItemUI';
import { ExpandableText, JsonBlock } from './CheckpointItemUtils.tsx';
import type { ParsedMessage, ParsedMessageType } from './parsedMessage';

export function HumanCheckpointItem({ item, parsed, kindBadge, rawToggleButton }: {
  item: CheckpointWriteClient;
  parsed: ParsedMessage;
  kindBadge: Record<ParsedMessageType, string>;
  rawToggleButton?: React.ReactNode;
}) {
  const time = item.createdAt instanceof Date ? item.createdAt : new Date(item.createdAt);
  const [showInfo, setShowInfo] = useState(false);

  return (
    <CheckpointItemUI
      time={time}
      kind={parsed.kind}
      kindBadge={kindBadge}
      infoButton={parsed.info && (
        <Button type="button" size="sm" variant="outline" onClick={() => setShowInfo((s) => !s)}>
          {showInfo ? 'hide info' : 'info'}
        </Button>
      )}
      rawToggleButton={rawToggleButton}
      content={parsed.content && (
        <div className="rounded bg-muted/40 p-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-words">
          <ExpandableText text={parsed.content} limit={200} />
        </div>
      )}
      infoBlock={showInfo && parsed.info && (
        <div className="rounded border border-border/50 bg-card/40 p-2">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">info</div>
          <JsonBlock value={parsed.info} />
        </div>
      )}
      rawBlock={!parsed.content && !parsed.info && !parsed.toolCalls && <JsonBlock value={parsed.raw} />}
      taskId={item.taskId}
    />
  );
}
