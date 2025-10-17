import type { CheckpointWriteClient } from '@/hooks/useCheckpointStream';
import { Button } from '@hautech/ui';
import { useMemo, useState } from 'react';
import { HumanCheckpointItem } from './HumanCheckpointItem';
import { AICheckpointItem } from './AICheckpointItem';
import { ToolCheckpointItem } from './ToolCheckpointItem';
import { CheckpointItemUI } from './CheckpointItemUI';
import type { ParsedMessage, ParsedMessageType, ToolCall } from './parsedMessage';

// The checkpoint write "value" can arrive in several shapes depending on LangGraph / LangChain
// serialization versions we encounter:
// 1. Legacy: value is an array of message objects: [ { id: [...], kwargs: { content: string | object, ... } } ]
// 2. Newer (observed): value is an envelope { method: 'append' | 'replace', items: [ { lc, type, id: [...], kwargs: {...} } ] }
// 3. Raw scalar / object: fall back to JSON display as unknown.
function parseValue(value: unknown): ParsedMessage {
  try {
    // Unwrap envelope format: { method, items: [...] }
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      'items' in (value as Record<string, unknown>) &&
      Array.isArray((value as Record<string, unknown>).items)
    ) {
      const v = value as { items: unknown[] };
      // For downstream logic we mimic legacy array form
      return parseValue(v.items as unknown); // recursion will hit array branch below
    }

    if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'object' && value[0] !== null) {
      const first = value[0] as { id?: unknown; kwargs?: Record<string, unknown> };
      // In some versions id is already a string[]; in others it's like ['langchain_core','messages','AIMessage']
      const ids: string[] | undefined = Array.isArray(first.id) ? (first.id as string[]) : undefined;
      const kwargs = (first.kwargs || {}) as Record<string, unknown> & {
        content?: unknown;
        tool_calls?: unknown;
        toolCalls?: unknown;
        additional_kwargs?: { tool_calls?: unknown };
      };
      let kind: ParsedMessageType = 'unknown';
      if (ids?.some((i) => /HumanMessage$/.test(i))) kind = 'human';
      else if (ids?.some((i) => /AIMessage$/.test(i))) kind = 'ai';
      else if (ids?.some((i) => /ToolMessage$/.test(i))) kind = 'tool';
      let content: string | null = null;
      let info: Record<string, unknown> | null = null;
      const rawContent = kwargs.content ?? '';
      if (typeof rawContent === 'string') {
        // Sometimes content itself is a JSON string with { content, info }
        try {
          const envelope = JSON.parse(rawContent);
          if (envelope && typeof envelope === 'object' && 'content' in envelope) {
            const envObj = envelope as { content?: unknown; info?: Record<string, unknown> };
            content = envObj.content == null ? '' : String(envObj.content);
            if (envObj.info && typeof envObj.info === 'object') info = envObj.info;
          } else {
            content = rawContent;
          }
        } catch {
          content = rawContent;
        }
      } else if (rawContent && typeof rawContent === 'object') {
        content = JSON.stringify(rawContent, null, 2);
      }
      const toolCalls: ToolCall[] = [];
      const tcSource =
        (kwargs as any).tool_calls || (kwargs as any).toolCalls || (kwargs as any).additional_kwargs?.tool_calls; // eslint-disable-line @typescript-eslint/no-explicit-any
      if (Array.isArray(tcSource)) {
        for (const tc of tcSource) {
          if (tc && typeof tc === 'object') {
            const name = (tc as any).name || (tc as any).function?.name || 'tool'; // eslint-disable-line @typescript-eslint/no-explicit-any
            const args = (tc as any).args || (tc as any).function?.arguments; // eslint-disable-line @typescript-eslint/no-explicit-any
            toolCalls.push({ name: String(name), args, raw: tc });
          }
        }
      }
      return { kind, content, info, toolCalls: toolCalls.length ? toolCalls : undefined, raw: value };
    }
    if (value == null) return { kind: 'unknown', content: 'null', raw: value } as ParsedMessage;
    if (typeof value === 'string') return { kind: 'unknown', content: value, raw: value } as ParsedMessage;
    return { kind: 'unknown', content: JSON.stringify(value, null, 2), raw: value } as ParsedMessage;
  } catch {
    return { kind: 'unknown', content: JSON.stringify(value), raw: value } as ParsedMessage;
  }
}

interface CheckpointItemProps {
  item: CheckpointWriteClient;
  onFilterThread?: (threadId: string) => void;
  currentThreadId?: string;
}

export function CheckpointItem({ item, onFilterThread, currentThreadId }: CheckpointItemProps) {
  const [showRaw, setShowRaw] = useState(false);
  const kindBadge = {
    human: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    ai: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
    tool: 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300',
    unknown: 'bg-muted text-foreground',
  };
  const parsed = useMemo(() => parseValue(item.value), [item.value]);
  if (item.channel === 'branch:to:call_model' || item.channel === 'branch:to:tools') return null;
  const rawToggleBtn = (
    <Button type="button" size="sm" variant="outline" onClick={() => setShowRaw((r) => !r)}>
      {showRaw ? 'parsed' : 'raw'}
    </Button>
  );

  const threadFilterBtn = onFilterThread && (
    <Button
      type="button"
      variant="outline"
      onClick={() => onFilterThread(item.threadId)}
      className={
        `h-auto px-1.5 py-0.5 text-[10px] font-medium hover:bg-muted/70 border ` +
        (currentThreadId === item.threadId
          ? 'bg-blue-500/20 text-blue-700 dark:text-blue-300 border-blue-400'
          : 'bg-muted border-transparent')
      }
      title={currentThreadId === item.threadId ? 'Currently filtered by this thread' : 'Filter by this thread'}
    >
      {currentThreadId === item.threadId ? 'thread ✓' : 'filter thread'}
    </Button>
  );

  if (showRaw) {
    const time = item.createdAt instanceof Date ? item.createdAt : new Date(item.createdAt);
    return (
      <CheckpointItemUI
        time={time}
        kind={'unknown'}
        kindBadge={kindBadge as Record<'human' | 'ai' | 'tool' | 'unknown', string>}
        rawBlock={
          <>
            channel: {item.channel} <br />
            <pre className="m-0 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded bg-muted/40 p-2 font-mono text-[10px] leading-relaxed">
              {typeof item.value === 'string' ? item.value : JSON.stringify(item.value, null, 2)}
            </pre>
          </>
        }
        rawToggleButton={
          <div className="flex gap-1">
            {rawToggleBtn}
            {threadFilterBtn}
          </div>
        }
      />
    );
  }
  switch (parsed.kind) {
    case 'human':
      return (
        <HumanCheckpointItem
          item={item}
          parsed={parsed}
          kindBadge={kindBadge}
          rawToggleButton={
            <div className="flex gap-1">
              {rawToggleBtn}
              {threadFilterBtn}
            </div>
          }
        />
      );
    case 'ai':
      return (
        <AICheckpointItem
          item={item}
          parsed={parsed}
          kindBadge={kindBadge}
          rawToggleButton={
            <div className="flex gap-1">
              {rawToggleBtn}
              {threadFilterBtn}
            </div>
          }
        />
      );
    case 'tool':
      return (
        <ToolCheckpointItem
          item={item}
          parsed={parsed}
          kindBadge={kindBadge}
          rawToggleButton={
            <div className="flex gap-1">
              {rawToggleBtn}
              {threadFilterBtn}
            </div>
          }
        />
      );
    default:
      return (
        <HumanCheckpointItem
          item={item}
          parsed={parsed}
          kindBadge={kindBadge}
          rawToggleButton={
            <div className="flex gap-1">
              {rawToggleBtn}
              {threadFilterBtn}
            </div>
          }
        />
      );
  }
}
