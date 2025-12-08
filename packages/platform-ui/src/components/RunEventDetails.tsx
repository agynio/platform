import { Clock, MessageSquare, Bot, Wrench, FileText, Terminal, Users, ChevronDown, ChevronRight, Copy, User, Settings, ExternalLink } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
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
  const [expandedToolCalls, setExpandedToolCalls] = useState<Set<string>>(new Set());

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
    const context = asRecordArray(event.data.context);
    const response = asString(event.data.response);
    const totalTokens = asNumber(event.data.tokens?.total);
    const cost = typeof event.data.cost === 'string' ? event.data.cost : '';
    const model = asString(event.data.model);

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
                <div className="text-[var(--agyn-dark)] text-sm font-mono">
                  {model}
                </div>
              </div>
            )}
            
            {/* Context */}
            <div className="flex-1 flex flex-col min-h-0">
              <div className="flex items-center gap-2 mb-3 h-8 flex-shrink-0">
                <span className="text-sm text-[var(--agyn-gray)]">Context</span>
              </div>
              <div className="flex-1 overflow-y-auto min-h-0 border border-[var(--agyn-border-subtle)] rounded-[10px] p-4">
                {context.length > 0 ? (
                  <div>
                    <button className="w-full text-sm text-[var(--agyn-blue)] hover:text-[var(--agyn-blue)]/80 py-2 mb-4 border border-[var(--agyn-border-subtle)] rounded-[6px] transition-colors">
                      Load older context
                    </button>
                    {renderContextMessages(context)}
                  </div>
                ) : (
                  <div className="text-sm text-[var(--agyn-gray)]">No context messages</div>
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

  const renderContextMessages = (contextArray: Record<string, unknown>[]) =>
    contextArray.map((message, index) => {
      const roleValue = asString(message.role).toLowerCase();
      const role = roleValue || 'user';

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

      const timestamp = formatTimestamp(message.timestamp);
      const reasoning = isRecord(message.reasoning) ? message.reasoning : undefined;
      const reasoningTokens = asNumber(reasoning?.tokens);
      const reasoningScore = asNumber(reasoning?.score);

      const getReasoningVariant = () => {
        if (reasoningTokens !== undefined) {
          if (reasoningTokens < 50) return 'secondary';
          if (reasoningTokens < 150) return 'default';
          return 'error';
        }
        return 'neutral';
      };

      const additionalKwargs = isRecord(message.additional_kwargs) ? message.additional_kwargs : undefined;
      const toolCallsRaw = message.tool_calls || message.toolCalls || additionalKwargs?.tool_calls;
      const toolCalls = Array.isArray(toolCallsRaw) ? toolCallsRaw.filter(isRecord) : [];
      const hasToolCalls = toolCalls.length > 0;

      const toolResultValue = message.tool_result ?? message.tool_result_if_exists;
      const hasToolResult = toolResultValue !== undefined;

      const renderAssistantContent = () => {
        const content = message.content ?? message.response;
        if (typeof content === 'string') {
          return <MarkdownContent content={content} />;
        }
        if (Array.isArray(content) || isRecord(content)) {
          return <JsonViewer data={content} />;
        }
        return null;
      };

      return (
        <div key={index} className="mb-4 last:mb-0">
          <div className={`flex items-center gap-1.5 ${roleConfig.color} mb-2`}>
            {roleConfig.icon}
            <span className={`text-xs font-medium ${role === 'tool' ? '' : 'capitalize'}`}>
              {role === 'tool' ? asString(message.name, 'Tool') : role}
            </span>
            {timestamp && (
              <span className="text-xs text-[var(--agyn-gray)] ml-1">{timestamp}</span>
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
          <div className="ml-5 space-y-3">
            {(role === 'system' || role === 'user') && (
              <div className="prose prose-sm max-w-none">
                <MarkdownContent content={asString(message.content)} />
              </div>
            )}

            {role === 'tool' && (
              <div className="text-sm">
                {renderOutputContent(message.content || toolResultValue || '')}
              </div>
            )}

            {role === 'assistant' && (
              <div className="space-y-3">
                {renderAssistantContent()}
                {hasToolCalls && (
                  <div className="space-y-1">
                    {toolCalls.map((toolCall, tcIndex) => {
                      const toolCallRecord = toolCall;
                      const toolFunction = isRecord(toolCallRecord.function) ? toolCallRecord.function : undefined;
                      const toggleKey = `${index}-${tcIndex}`;
                      const isExpanded = expandedToolCalls.has(toggleKey);
                      const toolLabel =
                        asString(toolCallRecord.name) ||
                        asString(toolFunction?.name) ||
                        'Tool Call';

                      return (
                        <div key={toggleKey} className="space-y-1">
                          <button
                            onClick={() => toggleToolCall(toggleKey)}
                            className="flex items-center gap-1.5 text-sm text-[var(--agyn-dark)] hover:text-[var(--agyn-blue)] transition-colors"
                            type="button"
                          >
                            {isExpanded ? (
                              <ChevronDown className="w-3.5 h-3.5" />
                            ) : (
                              <ChevronRight className="w-3.5 h-3.5" />
                            )}
                            <Wrench className="w-3.5 h-3.5" />
                            <span className="font-medium">{toolLabel}</span>
                          </button>
                          {isExpanded && (
                            <div className="ml-5 mt-2">
                              <JsonViewer
                                data={
                                  toolCallRecord.arguments ??
                                  toolFunction?.arguments ??
                                  toolCallRecord
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
              <div className="bg-[var(--agyn-bg-light)] border border-[var(--agyn-border-subtle)] rounded-[6px] p-3">
                <div className="text-xs text-[var(--agyn-gray)] mb-1">Tool Result</div>
                <pre className="text-xs whitespace-pre-wrap overflow-auto">
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
