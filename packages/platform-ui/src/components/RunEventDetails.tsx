import { Clock, MessageSquare, Bot, Wrench, FileText, Terminal, Users, ChevronDown, ChevronRight, Copy, ExternalLink, User, Settings } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Badge } from './Badge';
import { IconButton } from './IconButton';
import { JsonViewer } from './JsonViewer';
import { MarkdownContent } from './MarkdownContent';
import { Dropdown } from './Dropdown';
import { StatusIndicator, type Status } from './StatusIndicator';
import { useNow } from '@/hooks/useNow';
import { computeDurationMs, formatAbsoluteTimestamp, formatDurationShort, formatRelativeTimeShort } from '@/utils/time';
import { LLMContextViewer } from '@/components/agents/LLMContextViewer';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

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

const extractToolCallArguments = (call: Record<string, unknown>): unknown => {
  if ('arguments' in call) {
    return (call as { arguments?: unknown }).arguments;
  }

  const functionField = (call as { function?: unknown }).function;
  if (isRecord(functionField) && 'arguments' in functionField) {
    return (functionField as { arguments?: unknown }).arguments;
  }

  return undefined;
};

const extractContextId = (value: unknown): string | null => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (isRecord(value) && typeof value.id === 'string') {
    const trimmed = value.id.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  return null;
};

const toContextIds = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    const ids = value
      .map((item) => extractContextId(item))
      .filter((id): id is string => typeof id === 'string' && id.length > 0);
    return Array.from(new Set(ids));
  }

  const single = extractContextId(value);
  return single ? [single] : [];
};

export interface RunEventData extends Record<string, unknown> {
  messageSubtype?: MessageSubtype;
  content?: unknown;
  toolSubtype?: ToolSubtype;
  toolName?: string;
  response?: string;
  context?: unknown;
  newContextCount?: number;
  tokens?: {
    input?: number;
    cached?: number;
    output?: number;
    reasoning?: number;
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
  toolCalls?: Array<{ callId?: string; name?: string; arguments?: unknown }>;
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

type ContextMessageRole = 'system' | 'user' | 'assistant' | 'tool' | 'other';

const normalizeContextMessageRole = (value: unknown): ContextMessageRole => {
  if (typeof value !== 'string') return 'other';
  const normalized = value.trim().toLowerCase();
  if (normalized === 'system' || normalized === 'user' || normalized === 'assistant' || normalized === 'tool') {
    return normalized;
  }
  return 'other';
};

type ToolCallDisplay = {
  key: string;
  name: string;
  callId?: string;
  payload: unknown;
};

const EVENTS_WITHOUT_DURATION: ReadonlySet<EventType> = new Set<EventType>(['message']);

const shouldDisplayEventDuration = (event: RunEvent): boolean => !EVENTS_WITHOUT_DURATION.has(event.type);

const deriveDurationLabel = (event: RunEvent, now: number): string | null => {
  if (!shouldDisplayEventDuration(event)) return null;
  const isRunning = event.status === 'running';
  const durationMs = computeDurationMs(
    {
      startedAt: event.startedAt ?? event.timestamp,
      endedAt: isRunning ? undefined : event.endedAt,
      durationMs: isRunning ? null : event.durationMs,
    },
    now,
    { fallbackToNow: isRunning },
  );

  if (durationMs === null) return null;
  return formatDurationShort(durationMs);
};

export interface RunEventDetailsProps {
  event: RunEvent;
}

export interface RunEvent {
  id: string;
  type: EventType;
  timestamp: string;
  startedAt?: string | null;
  endedAt?: string | null;
  durationMs?: number | null;
  status?: Status;
  data: RunEventData;
}

export function RunEventDetails({ event }: RunEventDetailsProps) {
  const now = useNow();
  const timestampLabel = formatRelativeTimeShort(event.timestamp, now);
  const timestampAbsolute = formatAbsoluteTimestamp(event.timestamp);
  const durationLabel = deriveDurationLabel(event, now);
  const [outputViewMode, setOutputViewMode] = useState<OutputViewMode>('text');
  const [expandedToolCalls, setExpandedToolCalls] = useState<Set<string>>(new Set());

  const toggleToolCall = (key: string) => {
    setExpandedToolCalls((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const llmContextIds = useMemo<string[]>(() => {
    if (event.type !== 'llm') return [];
    return toContextIds(event.data.context);
  }, [event.data, event.type]);

  const highlightContextCount = event.type === 'llm' ? asNumber(event.data.newContextCount) : undefined;

  const llmToolCalls = useMemo<ToolCallDisplay[]>(() => {
    if (event.type !== 'llm') return [];
    const toolCallGroups = [event.data.toolCalls, event.data.tool_calls, event.data.additional_kwargs?.tool_calls];
    const calls: ToolCallDisplay[] = [];
    toolCallGroups.forEach((group) => {
      if (!Array.isArray(group)) return;
      group.forEach((call) => {
        if (!isRecord(call)) return;
        const name = asString(call.name, 'Tool Call');
        const callIdCandidate = asString((call as { callId?: unknown; id?: unknown }).callId ?? (call as { id?: unknown }).id);
        const payload = extractToolCallArguments(call) ?? call;
        const key = callIdCandidate.length > 0 ? callIdCandidate : `tool-call-${calls.length}`;
        calls.push({
          key,
          name,
          callId: callIdCandidate.length > 0 ? callIdCandidate : undefined,
          payload,
        });
      });
    });
    return calls;
  }, [event.data.additional_kwargs?.tool_calls, event.data.toolCalls, event.data.tool_calls, event.type]);

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
                <span title={timestampAbsolute}>{timestampLabel}</span>
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
    const highlightCount = typeof highlightContextCount === 'number' && highlightContextCount > 0
      ? Math.floor(highlightContextCount)
      : undefined;
    const toolCalls = llmToolCalls;
    const hasToolCalls = toolCalls.length > 0;

    const tokens = event.data.tokens;
    const tokenEntries = [
      { key: 'input', label: 'Input', value: typeof tokens?.input === 'number' ? tokens.input : undefined },
      { key: 'cached', label: 'Cached', value: typeof tokens?.cached === 'number' ? tokens.cached : undefined },
      { key: 'output', label: 'Output', value: typeof tokens?.output === 'number' ? tokens.output : undefined },
      { key: 'reasoning', label: 'Reasoning', value: typeof tokens?.reasoning === 'number' ? tokens.reasoning : undefined },
      { key: 'total', label: 'Total', value: typeof tokens?.total === 'number' ? tokens.total : undefined },
    ] as const;

    const hasTokenMetrics = tokenEntries.some(({ value }) => typeof value === 'number');

    const formatTokenValue = (value: number | undefined) => (typeof value === 'number' ? value.toLocaleString() : '—');

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
                <span title={timestampAbsolute}>{timestampLabel}</span>
                {durationLabel && (
                  <>
                    <span>•</span>
                    <span>{durationLabel}</span>
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
        <div className="grid grid-cols-1 gap-4 flex-1 min-h-0 md:grid-cols-2">
          {/* Input */}
          <div className="flex flex-col min-h-0 min-w-0 gap-4">
            {/* Model */}
            {model && (
              <div className="flex flex-col rounded-[10px] border border-[var(--agyn-border-subtle)] bg-white p-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm text-[var(--agyn-gray)]">Model</span>
                  <IconButton icon={<Copy className="w-3 h-3" />} size="sm" variant="ghost" />
                </div>
                <div className="text-sm font-mono text-[var(--agyn-dark)] break-all">{model}</div>
              </div>
            )}
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[10px] border border-[var(--agyn-border-subtle)]">
              <div className="border-b border-[var(--agyn-border-subtle)] px-4 py-2 text-sm font-medium text-[var(--agyn-gray)]">
                Context
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3">
                {llmContextIds.length === 0 ? (
                  <div className="text-sm text-[var(--agyn-gray)]">No context messages</div>
                ) : (
                  <LLMContextViewer ids={llmContextIds} highlightLastCount={highlightCount} />
                )}
              </div>
            </div>
          </div>

          {/* Output */}
          <div className="flex flex-col min-h-0 min-w-0 gap-4">
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[10px] border border-[var(--agyn-border-subtle)] bg-white">
              <div className="flex items-center justify-between border-b border-[var(--agyn-border-subtle)] px-4 py-2">
                <span className="text-sm text-[var(--agyn-gray)]">Output</span>
                <IconButton icon={<Copy className="w-3 h-3" />} size="sm" variant="ghost" />
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3">
                {response ? (
                  <div className="prose prose-sm max-w-none">
                    <MarkdownContent content={response} />
                  </div>
                ) : (
                  <div className="text-sm text-[var(--agyn-gray)]">No response available</div>
                )}
              </div>
            </div>

            {hasToolCalls && (
              <div className="space-y-3 rounded-[10px] border border-[var(--agyn-border-subtle)] bg-white p-4">
                <div className="text-sm font-medium text-[var(--agyn-dark)]">Tool Calls</div>
                <div className="space-y-2">
                  {toolCalls.map((call, index) => {
                    const toggleKey = call.key ?? `tool-call-${index}`;
                    const isExpanded = expandedToolCalls.has(toggleKey);
                    return (
                      <div key={toggleKey} className="rounded-[8px] border border-[var(--agyn-border-subtle)] bg-[var(--agyn-bg-light)]/60">
                        <button
                          type="button"
                          onClick={() => toggleToolCall(toggleKey)}
                          className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left"
                        >
                          <span className="flex items-center gap-2 text-sm font-medium text-[var(--agyn-dark)]">
                            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            <Wrench className="h-4 w-4 text-[var(--agyn-blue)]" />
                            <span>{call.name}</span>
                            {call.callId && <span className="text-xs text-[var(--agyn-gray)]">({call.callId})</span>}
                          </span>
                        </button>
                        {isExpanded && (
                          <div className="border-t border-[var(--agyn-border-subtle)] px-3 py-3 text-xs text-[var(--agyn-dark)]">
                            <JsonViewer data={call.payload} />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {hasTokenMetrics && (
              <div className="space-y-3 rounded-[10px] border border-[var(--agyn-border-subtle)] bg-white p-4">
                <div className="text-sm font-medium text-[var(--agyn-dark)]">Token Usage</div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                  {tokenEntries.map(({ key, label, value }) => (
                    <div
                      key={key}
                      className="rounded-[8px] border border-[var(--agyn-border-subtle)] bg-[var(--agyn-bg-light)]/40 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]"
                    >
                      <div className="text-xs text-[var(--agyn-gray)]">{label}</div>
                      <div className="text-sm font-semibold text-[var(--agyn-dark)]">{formatTokenValue(value)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderContextMessages = (contextArray: Record<string, unknown>[]) =>
    contextArray.map((message, index) => {
      const role = normalizeContextMessageRole((message as { role?: unknown }).role);
      const contextItemId = asString((message as { contextItemId?: string }).contextItemId);
      const isHighlighted = Boolean((message as { __highlight?: boolean }).__highlight);

      const bodyClasses = ['ml-5', 'space-y-3'];
      if (isHighlighted) {
        bodyClasses.push(
          'rounded-[8px]',
          'border',
          'border-[var(--agyn-blue)]/30',
          'bg-[var(--agyn-blue)]/5',
          'px-3',
          'py-3'
        );
      }

      const getRoleConfig = () => {
        switch (role) {
          case 'system':
            return {
              color: 'text-[var(--agyn-gray)]',
              icon: <Settings className="w-3.5 h-3.5" />,
            };
          case 'user':
            return {
              color: 'text-[var(--agyn-blue)]',
              icon: <User className="w-3.5 h-3.5" />,
            };
          case 'assistant':
            return {
              color: 'text-[var(--agyn-purple)]',
              icon: <Bot className="w-3.5 h-3.5" />,
            };
          case 'tool':
            return {
              color: 'text-[var(--agyn-cyan)]',
              icon: <Wrench className="w-3.5 h-3.5" />,
            };
          default:
            return {
              color: 'text-[var(--agyn-gray)]',
              icon: <MessageSquare className="w-3.5 h-3.5" />,
            };
        }
      };

      const roleConfig = getRoleConfig();

      const formatTimestamp = (timestamp: unknown) => {
        if (typeof timestamp !== 'string' && typeof timestamp !== 'number') {
          return null;
        }
        const date = new Date(timestamp);
        if (Number.isNaN(date.getTime())) {
          return null;
        }
        return date.toLocaleString('en-US', {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        });
      };

      const timestamp = formatTimestamp((message as { timestamp?: unknown }).timestamp);
      const reasoning = isRecord((message as { reasoning?: unknown }).reasoning) ? (message as { reasoning?: unknown }).reasoning : undefined;
      const reasoningTokens = asNumber((reasoning as { tokens?: unknown })?.tokens);
      const reasoningScore = asNumber((reasoning as { score?: unknown })?.score);

      const getReasoningVariant = () => {
        if (reasoningTokens !== undefined) {
          if (reasoningTokens < 50) return 'secondary';
          if (reasoningTokens < 150) return 'default';
          return 'error';
        }
        return 'neutral';
      };

      const additionalKwargs = isRecord((message as { additional_kwargs?: unknown }).additional_kwargs)
        ? (message as { additional_kwargs?: unknown }).additional_kwargs
        : undefined;
      const toolCallsRaw =
        (message as { tool_calls?: unknown }).tool_calls ||
        (message as { toolCalls?: unknown }).toolCalls ||
        (additionalKwargs as { tool_calls?: unknown } | undefined)?.tool_calls;
      const toolCalls = Array.isArray(toolCallsRaw) ? toolCallsRaw.filter(isRecord) : [];
      const hasToolCalls = toolCalls.length > 0;

      const toolResultValue = (message as { tool_result?: unknown; tool_result_if_exists?: unknown }).tool_result
        ?? (message as { tool_result_if_exists?: unknown }).tool_result_if_exists;
      const hasToolResult = toolResultValue !== undefined;

      const renderAssistantContent = () => {
        const content = (message as { content?: unknown; response?: unknown }).content
          ?? (message as { response?: unknown }).response;
        if (typeof content === 'string') {
          return <MarkdownContent content={content} />;
        }
        if (Array.isArray(content) || isRecord(content)) {
          return <JsonViewer data={content} />;
        }
        return null;
      };

      return (
        <div key={contextItemId || index} className="mb-4 last:mb-0">
          <div className={`flex items-center gap-1.5 ${roleConfig.color} mb-2`}>
            {roleConfig.icon}
            <span className={`text-xs font-medium ${role === 'tool' ? '' : 'capitalize'}`}>
              {role === 'tool'
                ? asString((message as { name?: unknown }).name, 'Tool')
                : role === 'other'
                  ? asString((message as { role?: unknown }).role, 'Other')
                  : role}
            </span>
            {timestamp && <span className="ml-1 text-xs text-[var(--agyn-gray)]">{timestamp}</span>}
            {isHighlighted && (
              <Badge
                variant="info"
                className="ml-2 border-[var(--agyn-blue)] bg-transparent text-[10px] font-semibold uppercase text-[var(--agyn-blue)]"
              >
                New
              </Badge>
            )}
            {role === 'tool' && (
              <div className="ml-auto">
                <Dropdown
                  value={outputViewMode}
                  onValueChange={(value) => setOutputViewMode(value as OutputViewMode)}
                  options={outputViewModeOptions}
                  variant="flat"
                  className="text-xs"
                />
              </div>
            )}
            {(reasoningTokens !== undefined || reasoningScore !== undefined) && (
              <Badge variant={getReasoningVariant()} className="ml-auto">
                <span className="text-xs">
                  {reasoningTokens !== undefined ? (
                    <span>{reasoningTokens.toLocaleString()} tokens</span>
                  ) : (
                    <span>Score: {reasoningScore}</span>
                  )}
                </span>
              </Badge>
            )}
          </div>
          <div
            className={bodyClasses.join(' ')}
            data-context-item-id={contextItemId || undefined}
            data-context-item-role={role}
            data-new-context={isHighlighted ? 'true' : undefined}
          >
            {(role === 'system' || role === 'user') && (
              <div className="prose prose-sm max-w-none">
                <MarkdownContent content={asString((message as { content?: unknown }).content)} />
              </div>
            )}

            {role === 'tool' && (
              <div className="text-sm">
                {renderOutputContent((message as { content?: unknown }).content || toolResultValue || '')}
              </div>
            )}

            {role === 'assistant' && (
              <div className="space-y-3">
                {renderAssistantContent()}
                {hasToolCalls && (
                  <div className="space-y-1">
                    {toolCalls.map((toolCall, tcIndex) => {
                      const toolCallRecord = toolCall as Record<string, unknown>;
                      const toolFunction = isRecord(toolCallRecord.function) ? toolCallRecord.function : undefined;
                      const toggleKey = `${index}-${tcIndex}`;
                      const isExpanded = expandedToolCalls.has(toggleKey);
                      const toolLabel =
                        asString(toolCallRecord.name) ||
                        asString((toolFunction as { name?: unknown } | undefined)?.name) ||
                        'Tool Call';

                      return (
                        <div key={toggleKey} className="space-y-1">
                          <button
                            onClick={() => toggleToolCall(toggleKey)}
                            className="flex items-center gap-1.5 text-sm text-[var(--agyn-dark)] transition-colors hover:text-[var(--agyn-blue)]"
                            type="button"
                          >
                            {isExpanded ? (
                              <ChevronDown className="h-3.5 w-3.5" />
                            ) : (
                              <ChevronRight className="h-3.5 w-3.5" />
                            )}
                            <Wrench className="h-3.5 w-3.5" />
                            <span className="font-medium">{toolLabel}</span>
                          </button>
                          {isExpanded && (
                            <div className="ml-5 mt-2">
                              <JsonViewer
                                data={
                                  (toolCallRecord as { arguments?: unknown }).arguments
                                    ?? (toolFunction as { arguments?: unknown } | undefined)?.arguments
                                    ?? toolCallRecord
                                }
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {hasToolResult && role !== 'tool' && (
              <div className="rounded-[6px] border border-[var(--agyn-border-subtle)] bg-[var(--agyn-bg-light)] p-3">
                <div className="mb-1 text-xs text-[var(--agyn-gray)]">Tool Result</div>
                <pre className="whitespace-pre-wrap text-xs">
                  {typeof toolResultValue === 'string'
                    ? toolResultValue
                    : JSON.stringify(toolResultValue, null, 2)}
                </pre>
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
              {renderOutputContent(event.data.output)}
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
    const command = input?.command;
    const worker = input?.worker;
    const threadAlias = input?.threadAlias;
    const message = input?.message;
    const output = parseOutput();
    const subthreadId = output?.subthreadId || output?.threadId;
    const runId = output?.runId;

    return (
      <>
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
                  {subthreadId && (
                    <a
                      href={`#/thread/${subthreadId}`}
                      className="inline-flex items-center gap-1 text-xs text-[var(--agyn-blue)] hover:text-[var(--agyn-blue)]/80 transition-colors"
                    >
                      <ExternalLink className="w-3 h-3" />
                      <span>View Thread</span>
                    </a>
                  )}
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
                  {runId && (
                    <a
                      href={`#/run/${runId}`}
                      className="inline-flex items-center gap-1 text-xs text-[var(--agyn-blue)] hover:text-[var(--agyn-blue)]/80 transition-colors"
                    >
                      <ExternalLink className="w-3 h-3" />
                      <span>View Run</span>
                    </a>
                  )}
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
                <span title={timestampAbsolute}>{timestampLabel}</span>
                {durationLabel && (
                  <>
                    <span>•</span>
                    <span>{durationLabel}</span>
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
    const oldContext = Array.isArray(event.data.oldContext) ? event.data.oldContext : [];
    const newContext = Array.isArray(event.data.newContext) ? event.data.newContext : [];

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
                <span title={timestampAbsolute}>{timestampLabel}</span>
                {durationLabel && (
                  <>
                    <span>•</span>
                    <span>{durationLabel}</span>
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
              {oldContext.length > 0 ? (
                renderContextMessages(oldContext)
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
                {newContext.length > 0 ? (
                  renderContextMessages(newContext)
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
