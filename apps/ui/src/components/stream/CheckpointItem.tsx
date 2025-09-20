import type { CheckpointWriteClient } from '@/hooks/useCheckpointStream';
import { cn } from '@/lib/utils';
import { useState, useMemo } from 'react';

interface Props {
  item: CheckpointWriteClient;
}

type ParsedMessageType = 'human' | 'ai' | 'tool' | 'unknown';

interface ParsedMessage {
  kind: ParsedMessageType;
  content: string | null;
  info?: Record<string, unknown> | null;
  toolCalls?: Array<{ name: string; args?: unknown; raw: unknown }>; // extracted tool calls
  raw: unknown;
}

function parseValue(value: unknown): ParsedMessage {
  // Expecting value to often be an array with one object containing kwargs
  try {
    if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'object' && value[0] !== null) {
      const first: any = value[0]; // eslint-disable-line @typescript-eslint/no-explicit-any
      const ids: string[] | undefined = first.id;
      const kwargs: any = first.kwargs || {}; // eslint-disable-line @typescript-eslint/no-explicit-any
      let kind: ParsedMessageType = 'unknown';
      if (ids?.includes('HumanMessage')) kind = 'human';
      else if (ids?.includes('AIMessage')) kind = 'ai';
      else if (ids?.includes('ToolMessage')) kind = 'tool';

      // content may itself be JSON string in human/tool messages
      let content: string | null = null;
      let info: Record<string, unknown> | null = null;
      const rawContent = kwargs.content ?? '';
      if (typeof rawContent === 'string') {
        // Attempt to parse JSON envelope with content & info
        try {
          const parsed = JSON.parse(rawContent);
          if (parsed && typeof parsed === 'object' && 'content' in parsed) {
            content = String((parsed as any).content ?? ''); // eslint-disable-line
            if ('info' in parsed) info = (parsed as any).info || null; // eslint-disable-line
          } else {
            content = rawContent;
          }
        } catch {
          content = rawContent;
        }
      } else if (rawContent && typeof rawContent === 'object') {
        content = JSON.stringify(rawContent, null, 2);
      }

      // Extract tool calls from AI or Tool messages
      const toolCalls: Array<{ name: string; args?: unknown; raw: unknown }> = [];
      const tcSource = kwargs.tool_calls || kwargs.toolCalls || kwargs.additional_kwargs?.tool_calls;
      if (Array.isArray(tcSource)) {
        for (const tc of tcSource) {
          if (tc && typeof tc === 'object') {
            const name = (tc.name || tc.function?.name || 'tool') as string;
            const args = tc.args || tc.function?.arguments;
            toolCalls.push({ name, args, raw: tc });
          }
        }
      }

      return { kind, content, info, toolCalls: toolCalls.length ? toolCalls : undefined, raw: value };
    }
    // Primitive fallback
    if (value == null) return { kind: 'unknown', content: 'null', raw: value } as ParsedMessage;
    if (typeof value === 'string') return { kind: 'unknown', content: value, raw: value };
    return { kind: 'unknown', content: JSON.stringify(value, null, 2), raw: value };
  } catch {
    return { kind: 'unknown', content: JSON.stringify(value), raw: value };
  }
}

function useParsed(item: CheckpointWriteClient) {
  return useMemo(() => parseValue(item.value), [item.value]);
}

function ExpandableText({ text, className, limit = 200 }: { text: string; className?: string; limit?: number }) {
  const [open, setOpen] = useState(false);
  if (text.length <= limit) {
    return <span className={className}>{text}</span>;
  }
  const visible = open ? text : text.slice(0, limit) + '…';
  return (
    <span className={cn('inline', className)}>
      {visible}{' '}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="text-xs underline text-primary hover:text-primary/80"
      >
        {open ? 'show less' : 'show more'}
      </button>
    </span>
  );
}

function JsonBlock({ value }: { value: unknown }) {
  return (
    <pre className="m-0 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded bg-muted/40 p-2 font-mono text-[10px] leading-relaxed">
      {typeof value === 'string' ? value : JSON.stringify(value, null, 2)}
    </pre>
  );
}

function parseToolContent(content: string) {
  try {
    const parsed = JSON.parse(content);
    return { content: parsed.kwargs.content, name: parsed.kwargs.name, tool_call_id: parsed.kwargs.tool_call_id };
  } catch {
    return null;
  }
}

export function CheckpointItem({ item }: Props) {
  const time = item.createdAt instanceof Date ? item.createdAt : new Date(item.createdAt);
  const parsed = useParsed(item);
  const [showInfo, setShowInfo] = useState(false);
  const [openTools, setOpenTools] = useState<Record<number, boolean>>({});

  // Hide any channel containing 'call_model'
  if (item.channel === 'branch:to:call_model' || item.channel === 'branch:to:tools') return null;

  const kindBadge: Record<ParsedMessageType, string> = {
    human: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    ai: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
    tool: 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300',
    unknown: 'bg-muted text-foreground',
  };

  return (
    <div className="border-b border-border py-2 text-xs">
      <div className="mb-1 flex flex-wrap items-center gap-2 font-mono">
        <span className="text-muted-foreground tabular-nums">{time.toLocaleTimeString()}</span>

        <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-medium', kindBadge[parsed.kind])}>
          {parsed.kind}
        </span>
        <span className="truncate text-muted-foreground max-w-[300px]" title={item.taskId}>
          {parsed.kind === 'tool' ? parseToolContent(parsed.content ?? '')?.tool_call_id : ''}
        </span>
        {parsed.info && (
          <button
            type="button"
            onClick={() => setShowInfo((s) => !s)}
            className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium hover:bg-muted/70"
          >
            {showInfo ? 'hide info' : 'info'}
          </button>
        )}
      </div>
      <div className="space-y-1">
        <>
          {parsed.content && (
            <div className="rounded bg-muted/40 p-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-words">
              <ExpandableText
                text={parsed.kind === 'tool' ? parseToolContent(parsed.content)?.content : parsed.content}
                limit={200}
              />
            </div>
          )}
          {showInfo && parsed.info && (
            <div className="rounded border border-border/50 bg-card/40 p-2">
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">info</div>
              <JsonBlock value={parsed.info} />
            </div>
          )}
          {parsed.toolCalls && parsed.toolCalls.length > 0 && (
            <div className="space-y-1">
              {parsed.toolCalls.map((tc, i) => {
                const open = openTools[i];
                return (
                  <div key={i} className="rounded border border-border/50 bg-card/40">
                    <button
                      type="button"
                      onClick={() => setOpenTools((o) => ({ ...o, [i]: !o[i] }))}
                      className="flex w-full items-center justify-between px-2 py-1 text-left font-mono text-[10px] hover:bg-muted/40"
                    >
                      <span className="truncate">
                        tool: {tc.name} ({(tc?.raw as { id?: string })?.id ?? ''})
                      </span>
                      <span className="text-muted-foreground">{open ? '−' : '+'}</span>
                    </button>
                    {open && (
                      <div className="border-t border-border/50 p-2">
                        <JsonBlock value={tc.args ?? tc.raw} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {!parsed.content && !parsed.info && !parsed.toolCalls && <JsonBlock value={parsed.raw} />}
        </>
      </div>
    </div>
  );
}
