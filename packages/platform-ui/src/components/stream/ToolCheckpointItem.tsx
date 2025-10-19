import { useState } from 'react';
import { Button } from '@hautech/ui';
import type { CheckpointWriteClient } from '@/hooks/useCheckpointStream';
import { CheckpointItemUI } from './CheckpointItemUI';
import { ExpandableText, JsonBlock } from './CheckpointItemUtils.tsx';
import type { ParsedMessage, ParsedMessageType, ToolCall } from './parsedMessage';

function parseToolContent(content: string) {
  try {
    const parsed = JSON.parse(content);
    return { content: parsed.kwargs.content, name: parsed.kwargs.name, tool_call_id: parsed.kwargs.tool_call_id };
  } catch {
    return null;
  }
}

export function ToolCheckpointItem({
  item,
  parsed,
  kindBadge,
  rawToggleButton,
}: {
  item: CheckpointWriteClient;
  parsed: ParsedMessage;
  kindBadge: Record<ParsedMessageType, string>;
  rawToggleButton?: React.ReactNode;
}) {
  const time = item.createdAt instanceof Date ? item.createdAt : new Date(item.createdAt);
  const [showInfo, setShowInfo] = useState(false);
  const [openTools, setOpenTools] = useState<Record<number, boolean>>({});

  return (
    <CheckpointItemUI
      time={time}
      kind={parsed.kind}
      kindBadge={kindBadge}
      toolCallId={parseToolContent(parsed.content ?? '')?.tool_call_id}
      infoButton={
        parsed.info && (
          <Button type="button" size="sm" variant="outline" onClick={() => setShowInfo((s) => !s)}>
            {showInfo ? 'hide info' : 'info'}
          </Button>
        )
      }
      rawToggleButton={rawToggleButton}
      content={
        parsed.content && (
          <div className="rounded bg-muted/40 p-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-words">
            <ExpandableText text={parseToolContent(parsed.content)?.content ?? parsed.content} limit={200} />
          </div>
        )
      }
      infoBlock={
        showInfo &&
        parsed.info && (
          <div className="rounded border border-border/50 bg-card/40 p-2">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">info</div>
            <JsonBlock value={parsed.info} />
          </div>
        )
      }
      toolCallsBlock={
        parsed.toolCalls &&
        parsed.toolCalls.length > 0 && (
          <div className="space-y-1">
            {parsed.toolCalls.map((tc: ToolCall, i: number) => {
              const open = openTools[i];
              return (
                <div key={i} className="rounded border border-border/50 bg-card/40">
                  <Button
                    type="button"
                    variant="ghost"
                    className="flex w-full items-center justify-between px-2 py-1 text-left font-mono text-[10px] hover:bg-muted/40 h-auto"
                    onClick={() => setOpenTools((o) => ({ ...o, [i]: !o[i] }))}
                  >
                    <span className="truncate">{tc.name} ({(tc.raw as { id?: string })?.id ?? ''})</span>
                    <span className="text-muted-foreground">{open ? '−' : '+'}</span>
                  </Button>
                  {open && (
                    <div className="border-t border-border/50 p-2">
                      <JsonBlock value={tc.args ?? tc.raw} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )
      }
      rawBlock={!parsed.content && !parsed.info && !parsed.toolCalls && <JsonBlock value={parsed.raw} />}
      taskId={item.taskId}
    />
  );
}
