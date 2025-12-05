import {
  Clock,
  MessageSquare,
  Bot,
  Wrench,
  FileText,
  Terminal,
  Users,
  Copy,
  User,
  Settings,
  ExternalLink,
  Loader2,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { runs } from '@/api/modules/runs';
import type { ContextItem, ContextItemRole } from '@/api/types/agents';
import { useToolOutputStreaming } from '@/hooks/useToolOutputStreaming';
import { Badge } from './Badge';
import { IconButton } from './IconButton';
import { JsonViewer } from './JsonViewer';
import { MarkdownContent } from './MarkdownContent';
import { Dropdown } from './Dropdown';
import { StatusIndicator, type Status } from './StatusIndicator';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const asRecordArray = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value) ? value.filter(isRecord) : [];

const asString = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value : fallback;

const asNumber = (value: unknown): number | undefined =>
  typeof value === 'number' ? value : undefined;

const safeJsonParse = (value: string): unknown => {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

const EMPTY_CONTEXT_HIGHLIGHTS: ReadonlySet<string> = new Set();

const parseContextRole = (value: unknown): ContextItemRole => {
  if (typeof value !== 'string') {
    return 'other';
  }
  const normalized = value.toLowerCase();
  switch (normalized) {
    case 'system':
    case 'user':
    case 'assistant':
    case 'tool':
    case 'memory':
    case 'summary':
      return normalized;
    default:
      return 'other';
  }
};

const normalizeContextRecord = (record: Record<string, unknown>, fallbackId: string, fallbackTimestamp: string): ContextItem => {
  const role = parseContextRole(record.role);
  const id = typeof record.id === 'string' && record.id.length > 0 ? record.id : fallbackId;
  const createdAtCandidate =
    typeof record.created_at === 'string'
      ? record.created_at
      : typeof record.createdAt === 'string'
      ? record.createdAt
      : typeof record.timestamp === 'string'
      ? record.timestamp
      : fallbackTimestamp;
  const sizeRaw = record.size_bytes ?? record.sizeBytes;
  const sizeBytes = typeof sizeRaw === 'number' && Number.isFinite(sizeRaw) ? sizeRaw : 0;
  const textContent = typeof record.content === 'string'
    ? record.content
    : typeof record.text === 'string'
    ? record.text
    : typeof record.message === 'string'
    ? record.message
    : null;
  const contentJsonCandidate =
    record.content_json ??
    record.contentJson ??
    (typeof record.content !== 'string' ? record.content : null) ??
    record.data ??
    null;
  const metadata = record.metadata ?? null;

  return {
    id,
    role,
    contentText: typeof textContent === 'string' ? textContent : null,
    contentJson: contentJsonCandidate,
    metadata,
    sizeBytes,
    createdAt: typeof createdAtCandidate === 'string' ? createdAtCandidate : fallbackTimestamp,
  };
};

const toContextItems = (value: unknown, prefix: string, fallbackTimestamp: string): ContextItem[] =>
  asRecordArray(value).map((record, index) => normalizeContextRecord(record, `${prefix}-${index}`, fallbackTimestamp));

export interface RunEventData extends Record<string, unknown> {
  messageSubtype?: MessageSubtype;
  content?: unknown;
  toolSubtype?: ToolSubtype;
  toolName?: string;
  response?: string;
  context?: unknown;
  tokens?: {
    total?: number;
    [key: string]: unknown;
  };
  cost?: string;
  model?: string;
  input?: unknown;
  output?: unknown;
  command?: string;
  workingDir?: string;
  tool_calls?: unknown[];
  toolCalls?: unknown[];
  additional_kwargs?: {
    tool_calls?: unknown[];
    [key: string]: unknown;
  };
  tool_result?: unknown;
  oldContext?: unknown;
  newContext?: unknown;
  summary?: string;
}

export type EventType = 'message' | 'llm' | 'tool' | 'summarization';
export type ToolSubtype = 'generic' | 'shell' | 'manage' | string;
export type MessageSubtype = 'source' | 'intermediate' | 'result';
export type OutputViewMode = 'text' | 'terminal' | 'markdown' | 'json' | 'yaml';

export interface RunEventDetailsProps {
  event: RunEvent;
  runId?: string;
}

export interface RunEvent {
  id: string;
  type: EventType;
  timestamp: string;
  duration?: string;
  status?: Status;
  data: RunEventData;
}

export function RunEventDetails({ event, runId }: RunEventDetailsProps) {
  const [outputViewMode, setOutputViewMode] = useState<OutputViewMode>('text');
  const [contextItems, setContextItems] = useState<ContextItem[]>([]);
  const [contextPrevCursorId, setContextPrevCursorId] = useState<string | null>(null);
  const [contextTotalCount, setContextTotalCount] = useState<number | null>(null);
  const [contextHighlightIds, setContextHighlightIds] = useState<string[]>([]);
  const [contextLoading, setContextLoading] = useState(false);
  const [contextFetchingOlder, setContextFetchingOlder] = useState(false);
  const [contextError, setContextError] = useState<string | null>(null);

  const isShellToolEvent =
    event.type === 'tool' &&
    (event.data.toolSubtype === 'shell' || event.data.toolName === 'shell_command');
  const shouldStreamOutput = Boolean(runId) && event.status === 'running' && isShellToolEvent;
  const { text, hydrated } = useToolOutputStreaming({
    runId: runId ?? '',
    eventId: event.id,
    enabled: shouldStreamOutput,
  });
  const streamedText = hydrated ? text : undefined;
  const displayedOutput = streamedText ?? event.data.output ?? '';

  const renderOutputContent = (output: unknown) => {
    const outputString = typeof output === 'string'
      ? output
      : (() => {
          try {
            return JSON.stringify(output, null, 2);
          } catch {
            return String(output);
          }
        })();

    switch (outputViewMode) {
      case 'json':
        {
          const parsed = typeof output === 'string' ? safeJsonParse(output) : output;
          if (Array.isArray(parsed) || isRecord(parsed)) {
            return <JsonViewer data={parsed} className="flex-1 overflow-auto" />;
          }
          return (
            <pre className="text-sm text-[var(--agyn-dark)] overflow-auto whitespace-pre-wrap flex-1">
              {outputString}
            </pre>
          );
        }
      case 'markdown':
        return (
          <div className="flex-1 overflow-auto prose prose-sm max-w-none">
            <MarkdownContent content={outputString} />
          </div>
        );
      case 'terminal':
        return (
          <pre className="text-sm text-white bg-[var(--agyn-dark)] overflow-auto whitespace-pre-wrap flex-1 px-3 py-2 rounded-[6px] font-mono">
            {outputString}
          </pre>
        );
      case 'yaml':
        return (
          <pre className="text-sm text-[var(--agyn-dark)] overflow-auto whitespace-pre-wrap flex-1 font-mono">
            {outputString}
          </pre>
        );
      case 'text':
      default:
        return (
          <div className="text-sm text-[var(--agyn-dark)] overflow-y-auto whitespace-pre-wrap flex-1 font-mono max-w-full" style={{ wordBreak: 'break-word', overflowX: 'hidden' }}>
            {outputString}
          </div>
        );
    }
  };

  const outputViewModeOptions = [
    { value: 'text', label: 'Text' },
    { value: 'terminal', label: 'Terminal' },
    { value: 'markdown', label: 'Markdown' },
    { value: 'json', label: 'JSON' },
    { value: 'yaml', label: 'YAML' },
  ];

  const isLlmEvent = event.type === 'llm';
  const highlightSet = useMemo(() => new Set(contextHighlightIds), [contextHighlightIds]);
  const oldestContextId = useMemo(() => (contextItems.length > 0 ? contextItems[0].id : null), [contextItems]);
  const loadMoreCursor = oldestContextId ?? contextPrevCursorId;
  const totalContextCount = contextTotalCount ?? contextItems.length;
  const canLoadOlderContext =
    !contextLoading &&
    loadMoreCursor !== null &&
    (contextPrevCursorId !== null || totalContextCount > contextItems.length || contextItems.length === 0);

  useEffect(() => {
    if (!runId || !isLlmEvent) {
      setContextItems([]);
      setContextPrevCursorId(null);
      setContextTotalCount(null);
      setContextHighlightIds([]);
      setContextError(null);
      setContextLoading(false);
      setContextFetchingOlder(false);
      return;
    }

    let cancelled = false;
    setContextItems([]);
    setContextPrevCursorId(null);
    setContextTotalCount(null);
    setContextHighlightIds([]);
    setContextError(null);
    setContextLoading(true);

    runs
      .eventContext(runId, event.id)
      .then(({ items, nextBeforeId, totalCount }) => {
        if (cancelled) return;
        setContextItems(items);
        setContextPrevCursorId(nextBeforeId);
        setContextTotalCount(totalCount);
        setContextHighlightIds(items.map((item) => item.id));
      })
      .catch(() => {
        if (cancelled) return;
        setContextError('Failed to load context items');
      })
      .finally(() => {
        if (cancelled) return;
        setContextLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [event.id, isLlmEvent, runId]);

  const handleLoadOlderContext = useCallback(() => {
    if (!runId || !isLlmEvent) return;
    if (!loadMoreCursor) return;

    setContextFetchingOlder(true);
    setContextError(null);

    runs
      .eventContext(runId, event.id, { beforeId: loadMoreCursor })
      .then(({ items, nextBeforeId, totalCount }) => {
        setContextItems((prev) => {
          if (items.length === 0) return prev;
          const existing = new Set(prev.map((item) => item.id));
          const deduped = items.filter((item) => !existing.has(item.id));
          if (deduped.length === 0) return prev;
          return [...deduped, ...prev];
        });
        setContextPrevCursorId(nextBeforeId);
        setContextTotalCount(totalCount);
      })
      .catch(() => {
        setContextError('Failed to load older context');
      })
      .finally(() => {
        setContextFetchingOlder(false);
      });
  }, [event.id, isLlmEvent, loadMoreCursor, runId]);

  const renderMessageEvent = () => {
    const subtypeCandidate = event.data.messageSubtype;
    const messageSubtype: MessageSubtype =
      subtypeCandidate === 'intermediate' || subtypeCandidate === 'result' ? subtypeCandidate : 'source';
    const content = asString(event.data.content);

    const getMessageLabel = (): string => {
      switch (messageSubtype) {
        case 'source':
          return 'Source';
        case 'intermediate':
          return 'Intermediate';
        case 'result':
          return 'Result';
        default:
          return 'Message';
      }
    };

    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[var(--agyn-blue)]/10 flex items-center justify-center">
              <MessageSquare className="w-5 h-5 text-[var(--agyn-blue)]" />
            </div>
            <div>
              <h3 className="text-[var(--agyn-dark)] mb-1">Message • {getMessageLabel()}</h3>
              <div className="flex items-center gap-2 text-xs text-[var(--agyn-gray)]">
                <Clock className="w-3 h-3" />
                <span>{event.timestamp}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Message Content */}
        <div className="border border-[var(--agyn-border-subtle)] rounded-[10px] p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-[var(--agyn-gray)]">Content</span>
            <IconButton icon={<Copy className="w-3 h-3" />} size="sm" variant="ghost" />
          </div>
          <p className="text-[var(--agyn-dark)] leading-relaxed whitespace-pre-wrap">{content}</p>
        </div>
      </div>
    );
  };

  const renderLLMEvent = () => {
    const response = asString(event.data.response);
    const totalTokens = asNumber(event.data.tokens?.total);
    const cost = typeof event.data.cost === 'string' ? event.data.cost : '';
    const model = asString(event.data.model);
    const showingCount = contextItems.length;

    return (
      <div className="space-y-6 h-full flex flex-col">
        {/* Header with Token Usage */}
        <div className="flex items-start flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[var(--agyn-purple)]/10 flex items-center justify-center">
              <Bot className="w-5 h-5 text-[var(--agyn-purple)]" />
            </div>
            <div>
              <h3 className="text-[var(--agyn-dark)] mb-1">LLM Call</h3>
              <div className="flex items-center gap-2 text-xs text-[var(--agyn-gray)]">
                <Clock className="w-3 h-3" />
                <span>{event.timestamp}</span>
                {event.duration && (
                  <>
                    <span>•</span>
                    <span>{event.duration}</span>
                  </>
                )}
                {totalTokens !== undefined && (
                  <>
                    <span>•</span>
                    <span>{totalTokens.toLocaleString()} tokens</span>
                    {cost && (
                      <>
                        <span>•</span>
                        <span>{cost}</span>
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Input & Output Side by Side */}
        <div className="grid grid-cols-2 gap-4 flex-1 min-h-0">
          {/* Input */}
          <div className="flex flex-col min-h-0 min-w-0">
            {/* Model */}
            {model && (
              <div className="flex-shrink-0 mb-4">
                <div className="flex items-center gap-2 mb-3 h-8">
                  <span className="text-sm text-[var(--agyn-gray)]">Model</span>
                  <IconButton icon={<Copy className="w-3 h-3" />} size="sm" variant="ghost" />
                </div>
                <div className="text-[var(--agyn-dark)] text-sm font-mono">{model}</div>
              </div>
            )}

            {/* Context */}
            <div className="flex-1 flex flex-col min-h-0">
              <div className="flex items-center gap-2 mb-3 h-8 flex-shrink-0">
                <span className="text-sm text-[var(--agyn-gray)]">Context</span>
              </div>
              <div className="flex-1 overflow-y-auto min-h-0 border border-[var(--agyn-border-subtle)] rounded-[10px] p-4 space-y-4">
                {contextLoading ? (
                  <div className="flex items-center gap-2 text-sm text-[var(--agyn-gray)]">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading context…
                  </div>
                ) : showingCount === 0 ? (
                  <div className="space-y-4">
                    {contextError ? (
                      <div className="text-sm text-[var(--agyn-red)]">{contextError}</div>
                    ) : (
                      <div className="text-sm text-[var(--agyn-gray)]">No context messages</div>
                    )}
                    {canLoadOlderContext && (
                      <button
                        type="button"
                        onClick={handleLoadOlderContext}
                        disabled={contextFetchingOlder}
                        className="w-full rounded-[6px] border border-[var(--agyn-border-subtle)] px-3 py-2 text-left text-sm font-medium text-[var(--agyn-blue)] transition-colors hover:text-[var(--agyn-blue)]/80 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Load older context ({showingCount} of {totalContextCount})
                      </button>
                    )}
                    {contextFetchingOlder && (
                      <div className="flex items-center gap-2 text-sm text-[var(--agyn-gray)]">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading older context…
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {contextError && (
                      <div className="text-sm text-[var(--agyn-red)]">{contextError}</div>
                    )}
                    {canLoadOlderContext && (
                      <button
                        type="button"
                        onClick={handleLoadOlderContext}
                        disabled={contextFetchingOlder}
                        className="w-full rounded-[6px] border border-[var(--agyn-border-subtle)] px-3 py-2 text-left text-sm font-medium text-[var(--agyn-blue)] transition-colors hover:text-[var(--agyn-blue)]/80 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Load older context ({showingCount} of {totalContextCount})
                      </button>
                    )}
                    {renderContextMessages(contextItems, highlightSet)}
                    {contextFetchingOlder && (
                      <div className="flex items-center gap-2 text-sm text-[var(--agyn-gray)]">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading older context…
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Output */}
          <div className="flex flex-col min-h-0 min-w-0">
                <div className="flex items-center gap-2 mb-3 h-8 flex-shrink-0">
                  <span className="text-sm text-[var(--agyn-gray)]">Output</span>
                  <IconButton icon={<Copy className="w-3 h-3" />} size="sm" variant="ghost" />
                </div>
                <div className="flex-1 overflow-y-auto min-h-0 border border-[var(--agyn-border-subtle)] rounded-[10px] p-4">
                  {response ? (
                    <div className="prose prose-sm max-w-none">
                      <MarkdownContent content={response} />
                    </div>
                  ) : (
                    <div className="text-sm text-[var(--agyn-gray)]">No response available</div>
                  )}
                </div>
              </div>
        </div>
      </div>
    );
  };

  const renderContextMessages = (contextArray: ContextItem[], highlightIds: ReadonlySet<string>) =>
    contextArray.map((message) => {
      const role = message.role;

      const getRoleConfig = () => {
        switch (role) {
          case 'system':
            return { color: 'text-[var(--agyn-gray)]', icon: <Settings className="w-3.5 h-3.5" /> };
          case 'user':
            return { color: 'text-[var(--agyn-blue)]', icon: <User className="w-3.5 h-3.5" /> };
          case 'assistant':
            return { color: 'text-[var(--agyn-purple)]', icon: <Bot className="w-3.5 h-3.5" /> };
          case 'tool':
            return { color: 'text-[var(--agyn-cyan)]', icon: <Wrench className="w-3.5 h-3.5" /> };
          default:
            return { color: 'text-[var(--agyn-gray)]', icon: <MessageSquare className="w-3.5 h-3.5" /> };
        }
      };

      const roleConfig = getRoleConfig();
      const timestamp = new Date(message.createdAt);
      const formattedTimestamp = Number.isNaN(timestamp.getTime())
        ? null
        : timestamp.toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false,
          });

      const metadata = isRecord(message.metadata) ? (message.metadata as Record<string, unknown>) : null;
      const textContent = typeof message.contentText === 'string' ? message.contentText : null;
      const contentJson = message.contentJson;
      const isHighlighted = highlightIds.has(message.id);

      const renderJsonContent = () => {
        if (contentJson === null || contentJson === undefined) return null;
        if (Array.isArray(contentJson) || isRecord(contentJson)) {
          return <JsonViewer data={contentJson} />;
        }
        return (
          <pre className="text-sm whitespace-pre-wrap text-[var(--agyn-dark)]">
            {typeof contentJson === 'string' ? contentJson : JSON.stringify(contentJson, null, 2)}
          </pre>
        );
      };

      const renderMarkdownOrFallback = () => {
        if (textContent && textContent.trim().length > 0) {
          return (
            <div className="prose prose-sm max-w-none">
              <MarkdownContent content={textContent} />
            </div>
          );
        }
        return renderJsonContent();
      };

      const wrapperClasses = ['mb-4', 'last:mb-0'];
      if (isHighlighted) {
        wrapperClasses.push('rounded-[8px]', 'border', 'border-[var(--agyn-blue)]/40', 'bg-[var(--agyn-blue)]/5', 'px-3', 'py-2');
      }

      return (
        <div key={message.id} className={wrapperClasses.join(' ')}>
          <div className={`flex items-center gap-1.5 ${roleConfig.color} mb-2`}>
            {roleConfig.icon}
            <span className="text-xs font-medium capitalize">{role}</span>
            {formattedTimestamp && (
              <span className="text-xs text-[var(--agyn-gray)] ml-1">{formattedTimestamp}</span>
            )}
            <Badge variant="outline" className="ml-auto text-xs capitalize">
              {Math.max(0, message.sizeBytes).toLocaleString()} bytes
            </Badge>
            {isHighlighted && <Badge variant="default" className="text-xs">New</Badge>}
            {role === 'tool' && (
              <Dropdown
                value={outputViewMode}
                onValueChange={(value) => setOutputViewMode(value as OutputViewMode)}
                options={outputViewModeOptions}
                variant="flat"
                className="ml-2 text-xs"
              />
            )}
          </div>
          <div className="ml-5 space-y-3">
            {(role === 'system' || role === 'user') && renderMarkdownOrFallback()}

            {role === 'assistant' && <div className="space-y-3">{renderMarkdownOrFallback()}</div>}

            {role === 'tool' && <div className="text-sm">{renderOutputContent(textContent ?? contentJson ?? '')}</div>}

            {(role === 'summary' || role === 'memory' || role === 'other') && renderMarkdownOrFallback()}

            {metadata && (
              <div className="rounded-[6px] border border-[var(--agyn-border-subtle)] bg-[var(--agyn-bg-light)] p-3">
                <div className="text-xs text-[var(--agyn-gray)] mb-1">Metadata</div>
                <JsonViewer data={metadata} />
              </div>
            )}
          </div>
        </div>
      );
    });

  const renderGenericToolView = () => {
    const parseInput = () => {
      try {
        return typeof event.data.input === 'string' ? JSON.parse(event.data.input) : event.data.input;
      } catch {
        return event.data.input;
      }
    };

    return (
      <>
        {/* Tool Input & Output - Side by Side */}
        <div className="grid grid-cols-2 gap-4 h-full">
          {/* Tool Input */}
          <div className="flex flex-col min-h-0 min-w-0">
            <div className="flex items-center gap-2 mb-3 h-8 flex-shrink-0">
              <span className="text-sm text-[var(--agyn-gray)]">Input</span>
              <IconButton icon={<Copy className="w-3 h-3" />} size="sm" variant="ghost" />
            </div>
            <div className="flex-1 overflow-y-auto min-h-0 border border-[var(--agyn-border-subtle)] rounded-[10px] p-4">
              <JsonViewer data={parseInput()} />
            </div>
          </div>

          {/* Tool Output */}
          <div className="flex flex-col min-h-0 min-w-0">
            <div className="flex items-center gap-2 mb-3 h-8 flex-shrink-0">
              <span className="text-sm text-[var(--agyn-gray)]">Output</span>
              <IconButton icon={<Copy className="w-3 h-3" />} size="sm" variant="ghost" />
              <div className="flex-shrink-0">
                <Dropdown
                  value={outputViewMode}
                  onValueChange={(value) => setOutputViewMode(value as OutputViewMode)}
                  options={outputViewModeOptions}
                  size="sm"
                  className="w-[120px] [&_button]:!h-8 [&_button]:text-xs"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto overflow-x-hidden min-h-0 min-w-0 flex flex-col border border-[var(--agyn-border-subtle)] rounded-[10px] p-4">
              {renderOutputContent(event.data.output)}
            </div>
          </div>
        </div>
      </>
    );
  };

  const renderShellToolView = () => {
    const parseInput = () => {
      try {
        return typeof event.data.input === 'string' ? JSON.parse(event.data.input) : event.data.input;
      } catch {
        return event.data.input;
      }
    };

    const input = parseInput();
    const command = input?.command || event.data.command || '';
    const cwd = input?.cwd || event.data.workingDir || '';
    const outputValue =
      outputViewMode === 'text' || outputViewMode === 'terminal'
        ? displayedOutput
        : event.data.output;

    return (
      <>
        {/* Tool Input & Output - Side by Side */}
        <div className="grid grid-cols-2 gap-4 h-full">
          {/* Tool Input */}
          <div className="flex flex-col min-h-0 min-w-0 space-y-4">
            {/* Working Directory */}
            {cwd && (
              <div className="flex-shrink-0">
                <div className="flex items-center gap-2 mb-3 h-8">
                  <span className="text-sm text-[var(--agyn-gray)]">Working Directory</span>
                  <IconButton icon={<Copy className="w-3 h-3" />} size="sm" variant="ghost" />
                </div>
                <div className="text-[var(--agyn-dark)] text-sm font-mono break-all">
                  {cwd}
                </div>
              </div>
            )}
            
            {/* Command */}
            <div className="flex-1 flex flex-col min-h-0">
              <div className="flex items-center gap-2 mb-3 h-8 flex-shrink-0">
                <span className="text-sm text-[var(--agyn-gray)]">Command</span>
                <IconButton icon={<Copy className="w-3 h-3" />} size="sm" variant="ghost" />
              </div>
              <div className="bg-[var(--agyn-dark)] text-white px-3 py-2 rounded-[6px] text-sm font-mono whitespace-pre-wrap break-words overflow-y-auto flex-1 border border-[var(--agyn-border-subtle)]">
                {command}
              </div>
            </div>
          </div>

          {/* Tool Output */}
          <div className="flex flex-col min-h-0 min-w-0">
            <div className="flex items-center gap-2 mb-3 h-8 flex-shrink-0">
              <span className="text-sm text-[var(--agyn-gray)]">Output</span>
              <IconButton icon={<Copy className="w-3 h-3" />} size="sm" variant="ghost" />
              <div className="flex-shrink-0">
                <Dropdown
                  value={outputViewMode}
                  onValueChange={(value) => setOutputViewMode(value as OutputViewMode)}
                  options={outputViewModeOptions}
                  size="sm"
                  className="w-[120px] [&_button]:!h-8 [&_button]:text-xs"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto overflow-x-hidden min-h-0 min-w-0 flex flex-col border border-[var(--agyn-border-subtle)] rounded-[10px] p-4">
              {renderOutputContent(outputValue)}
            </div>
          </div>
        </div>
      </>
    );
  };

  const renderManageToolView = () => {
    const parseInput = () => {
      try {
        return typeof event.data.input === 'string' ? JSON.parse(event.data.input) : event.data.input;
      } catch {
        return event.data.input;
      }
    };

    const parseOutput = () => {
      try {
        return typeof event.data.output === 'string' ? JSON.parse(event.data.output) : event.data.output;
      } catch {
        return event.data.output;
      }
    };

    const input = parseInput();
    const output = parseOutput();
    const inputRecord = isRecord(input) ? input : null;
    const outputRecord = isRecord(output) ? output : null;
    const inputChildRunRecord = isRecord(inputRecord?.childRun) ? (inputRecord?.childRun as Record<string, unknown>) : null;
    const outputChildRunRecord = isRecord(outputRecord?.childRun) ? (outputRecord?.childRun as Record<string, unknown>) : null;

    const pickId = (...candidates: unknown[]): string | undefined => {
      for (const candidate of candidates) {
        if (typeof candidate === 'string') {
          const trimmed = candidate.trim();
          if (trimmed.length > 0) return trimmed;
        }
      }
      return undefined;
    };

    const childThreadId = pickId(
      event.data.childThreadId,
      event.data.threadId,
      event.data.subthreadId,
      inputRecord?.childThreadId,
      inputRecord?.threadId,
      inputRecord?.subthreadId,
      outputRecord?.childThreadId,
      outputRecord?.threadId,
      outputRecord?.subthreadId,
    );

    const childRunId = pickId(
      event.data.childRunId,
      event.data.runId,
      inputRecord?.childRunId,
      inputRecord?.runId,
      inputChildRunRecord?.id,
      outputRecord?.childRunId,
      outputRecord?.runId,
      outputChildRunRecord?.id,
    );

    const command = input?.command;
    const worker = input?.worker;
    const threadAlias = input?.threadAlias;
    const message = input?.message;
    const linksClassName = 'inline-flex items-center gap-1 text-xs text-[var(--agyn-blue)] hover:text-[var(--agyn-blue)]/80 transition-colors';

    return (
      <>
        {childThreadId && (
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <Link to={`/agents/threads/${childThreadId}`} className={linksClassName}>
              <ExternalLink className="w-3 h-3" />
              <span>View thread</span>
            </Link>
            {childThreadId && childRunId && (
              <Link to={`/agents/threads/${childThreadId}/runs/${childRunId}/timeline`} className={linksClassName}>
                <ExternalLink className="w-3 h-3" />
                <span>View run</span>
              </Link>
            )}
          </div>
        )}
        {/* Tool Input & Output - Side by Side */}
        <div className="grid grid-cols-2 gap-4 h-full">
          {/* Tool Input */}
          <div className="flex flex-col min-h-0 min-w-0 space-y-4">
            {/* Command */}
            {command && (
              <div className="flex-shrink-0">
                <div className="flex items-center gap-2 mb-3 h-8">
                  <span className="text-sm text-[var(--agyn-gray)]">Command</span>
                  <IconButton icon={<Copy className="w-3 h-3" />} size="sm" variant="ghost" />
                </div>
                <div className="text-[var(--agyn-dark)] text-sm font-mono break-all">
                  {command}
                </div>
              </div>
            )}

            {/* Worker */}
            {worker && (
              <div className="flex-shrink-0">
                <div className="flex items-center gap-2 mb-3 h-8">
                  <span className="text-sm text-[var(--agyn-gray)]">Worker</span>
                  <IconButton icon={<Copy className="w-3 h-3" />} size="sm" variant="ghost" />
                </div>
                <div className="text-[var(--agyn-dark)] text-sm font-mono break-all">
                  {worker}
                </div>
              </div>
            )}

            {/* Thread Alias */}
            {threadAlias && (
              <div className="flex-shrink-0">
                <div className="flex items-center gap-2 mb-3 h-8">
                  <span className="text-sm text-[var(--agyn-gray)]">Thread Alias</span>
                  <IconButton icon={<Copy className="w-3 h-3" />} size="sm" variant="ghost" />
                </div>
                <div className="text-[var(--agyn-dark)] text-sm font-mono break-all">
                  {threadAlias}
                </div>
              </div>
            )}
            
            {/* Message */}
            {message && (
              <div className="flex-1 flex flex-col min-h-0">
                <div className="flex items-center gap-2 mb-3 h-8 flex-shrink-0">
                  <span className="text-sm text-[var(--agyn-gray)]">Message</span>
                  <IconButton icon={<Copy className="w-3 h-3" />} size="sm" variant="ghost" />
                </div>
                <div className="flex-1 overflow-y-auto min-h-0 border border-[var(--agyn-border-subtle)] rounded-[10px] p-4">
                  <div className="prose prose-sm max-w-none">
                    <MarkdownContent content={message} />
                  </div>
                </div>
              </div>
            )}

            {/* If no input structure, show the full input as JSON */}
            {!command && !worker && !threadAlias && !message && input && (
              <div className="flex-1 flex flex-col min-h-0">
                <div className="flex items-center gap-2 mb-3 h-8 flex-shrink-0">
                  <span className="text-sm text-[var(--agyn-gray)]">Input</span>
                  <IconButton icon={<Copy className="w-3 h-3" />} size="sm" variant="ghost" />
                </div>
                <div className="flex-1 overflow-y-auto min-h-0 border border-[var(--agyn-border-subtle)] rounded-[10px] p-4">
                  <JsonViewer data={input} />
                </div>
              </div>
            )}
          </div>

          {/* Tool Output */}
          <div className="flex flex-col min-h-0 min-w-0">
            <div className="flex items-center gap-2 mb-3 h-8 flex-shrink-0">
              <span className="text-sm text-[var(--agyn-gray)]">Output</span>
              <IconButton icon={<Copy className="w-3 h-3" />} size="sm" variant="ghost" />
              <div className="flex-shrink-0">
                <Dropdown
                  value={outputViewMode}
                  onValueChange={(value) => setOutputViewMode(value as OutputViewMode)}
                  options={outputViewModeOptions}
                  size="sm"
                  className="w-[120px] [&_button]:!h-8 [&_button]:text-xs"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto overflow-x-hidden min-h-0 min-w-0 flex flex-col border border-[var(--agyn-border-subtle)] rounded-[10px] p-4">
              {output ? renderOutputContent(output) : (
                <div className="text-sm text-[var(--agyn-gray)]">No output available</div>
              )}
            </div>
          </div>
        </div>
      </>
    );
  };

  const renderToolEvent = () => {
    const toolSubtype: ToolSubtype = event.data.toolSubtype || 'generic';

    return (
      <div className="space-y-6 flex flex-col h-full">
        {/* Header */}
        <div className="flex items-start justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[var(--agyn-cyan)]/10 flex items-center justify-center">
              {toolSubtype === 'shell' ? (
                <Terminal className="w-5 h-5 text-[var(--agyn-cyan)]" />
              ) : toolSubtype === 'manage' ? (
                <Users className="w-5 h-5 text-[var(--agyn-cyan)]" />
              ) : (
                <Wrench className="w-5 h-5 text-[var(--agyn-cyan)]" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-[var(--agyn-dark)]">{event.data.toolName || 'Tool Call'}</h3>
                {event.status && <StatusIndicator status={event.status} size="sm" />}
              </div>
              <div className="flex items-center gap-2 text-xs text-[var(--agyn-gray)]">
                <Clock className="w-3 h-3" />
                <span>{event.timestamp}</span>
                {event.duration && (
                  <>
                    <span>•</span>
                    <span>{event.duration}</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Tool-specific content */}
        <div className="flex-1 min-h-0">
          {toolSubtype === 'shell' && renderShellToolView()}
          {toolSubtype === 'manage' && renderManageToolView()}
          {toolSubtype === 'generic' && renderGenericToolView()}
        </div>
      </div>
    );
  };

  const renderSummarizationEvent = () => {
    const oldContextItems = toContextItems(event.data.oldContext, 'old', event.timestamp);
    const newContextItems = toContextItems(event.data.newContext, 'new', event.timestamp);
    const newContextHighlights = new Set(newContextItems.map((item) => item.id));

    return (
      <div className="space-y-6 h-full flex flex-col">
        {/* Header */}
        <div className="flex items-start flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[var(--agyn-gray)]/10 flex items-center justify-center">
              <FileText className="w-5 h-5 text-[var(--agyn-gray)]" />
            </div>
            <div>
              <h3 className="text-[var(--agyn-dark)] mb-1">Summarization</h3>
              <div className="flex items-center gap-2 text-xs text-[var(--agyn-gray)]">
                <Clock className="w-3 h-3" />
                <span>{event.timestamp}</span>
                {event.duration && (
                  <>
                    <span>•</span>
                    <span>{event.duration}</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Three Column Layout */}
        <div className="grid grid-cols-[1fr_1fr] gap-4 flex-1 min-h-0">
          {/* Old Context */}
          <div className="flex flex-col min-h-0 min-w-0">
            <div className="flex items-center gap-2 mb-3 h-8 flex-shrink-0">
              <span className="text-sm text-[var(--agyn-gray)]">Old Context</span>
            </div>
            <div className="flex-1 overflow-y-auto min-h-0 border border-[var(--agyn-border-subtle)] rounded-[10px] p-4">
              {oldContextItems.length > 0 ? (
                renderContextMessages(oldContextItems, EMPTY_CONTEXT_HIGHLIGHTS)
              ) : (
                <div className="text-sm text-[var(--agyn-gray)]">No old context</div>
              )}
            </div>
          </div>

          {/* Right Side: Summary + New Context */}
          <div className="flex flex-col min-h-0 min-w-0 space-y-4">
            {/* Summary */}
            <div className="flex flex-col min-h-0 max-h-[300px]">
              <div className="flex items-center gap-2 mb-3 h-8 flex-shrink-0">
                <span className="text-sm text-[var(--agyn-gray)]">Summary</span>
                <IconButton icon={<Copy className="w-3 h-3" />} size="sm" variant="ghost" />
              </div>
              <div className="flex-1 overflow-y-auto min-h-0 border border-[var(--agyn-border-subtle)] rounded-[10px] p-4">
                <div className="prose prose-sm max-w-none">
                  <MarkdownContent content={event.data.summary || ''} />
                </div>
              </div>
            </div>

            {/* New Context */}
            <div className="flex-1 flex flex-col min-h-0">
              <div className="flex items-center gap-2 mb-3 h-8 flex-shrink-0">
                <span className="text-sm text-[var(--agyn-gray)]">New Context</span>
              </div>
              <div className="flex-1 overflow-y-auto min-h-0 border border-[var(--agyn-border-subtle)] rounded-[10px] p-4">
                {newContextItems.length > 0 ? (
                  renderContextMessages(newContextItems, newContextHighlights)
                ) : (
                  <div className="text-sm text-[var(--agyn-gray)]">No new context</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="bg-white h-full flex flex-col">
      <div className="flex-1 overflow-y-auto p-6">
        {event.type === 'message' && renderMessageEvent()}
        {event.type === 'llm' && renderLLMEvent()}
        {event.type === 'tool' && renderToolEvent()}
        {event.type === 'summarization' && renderSummarizationEvent()}
      </div>
    </div>
  );
}
