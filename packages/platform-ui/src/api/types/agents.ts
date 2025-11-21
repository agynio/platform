export type ThreadStatus = 'open' | 'closed';

export type ThreadMetrics = {
  remindersCount: number;
  containersCount: number;
  activity: 'working' | 'waiting' | 'idle';
  runsCount: number;
};

export type ThreadReminder = {
  id: string;
  threadId: string;
  note: string;
  at: string;
  createdAt: string;
  completedAt: string | null;
};

export type ReminderItem = ThreadReminder;

export type ThreadNode = {
  id: string;
  alias: string;
  summary?: string | null;
  status?: ThreadStatus;
  parentId?: string | null;
  createdAt: string;
  metrics?: ThreadMetrics;
  agentTitle?: string;
};

export type RunMeta = {
  id: string;
  threadId: string;
  status: 'running' | 'finished' | 'terminated';
  createdAt: string;
  updatedAt: string;
};

export type RunMessageItem = { id: string; kind: 'user' | 'assistant' | 'system' | 'tool'; text?: string | null; source: unknown; createdAt: string };

export type ContextItemRole = 'system' | 'user' | 'assistant' | 'tool' | 'memory' | 'summary' | 'other';

export type ContextItem = {
  id: string;
  role: ContextItemRole;
  contentText: string | null;
  contentJson: unknown;
  metadata: unknown;
  sizeBytes: number;
  createdAt: string;
};

export type RunEventType = 'invocation_message' | 'injection' | 'llm_call' | 'tool_execution' | 'summarization';
export type RunEventStatus = 'pending' | 'running' | 'success' | 'error' | 'cancelled';
export type EventSourceKind = 'internal' | 'tracing';
export type ToolExecStatus = 'success' | 'error';
export type AttachmentKind = 'prompt' | 'response' | 'tool_input' | 'tool_output' | 'provider_raw' | 'other';

export type RunTimelineSummary = {
  runId: string;
  threadId: string;
  status: RunMeta['status'];
  createdAt: string;
  updatedAt: string;
  firstEventAt: string | null;
  lastEventAt: string | null;
  countsByType: Record<RunEventType, number>;
  countsByStatus: Record<RunEventStatus, number>;
  totalEvents: number;
};

export type RunTimelineEvent = {
  id: string;
  runId: string;
  threadId: string;
  type: RunEventType;
  status: RunEventStatus;
  ts: string;
  startedAt: string | null;
  endedAt: string | null;
  durationMs: number | null;
  nodeId: string | null;
  sourceKind: EventSourceKind;
  sourceSpanId: string | null;
  metadata: unknown;
  errorCode: string | null;
  errorMessage: string | null;
  llmCall?: {
    provider: string | null;
    model: string | null;
    temperature: number | null;
    topP: number | null;
    stopReason: string | null;
    contextItemIds: string[];
    responseText: string | null;
    rawResponse: unknown;
    toolCalls: Array<{ callId: string; name: string; arguments: unknown }>;
    usage?: {
      inputTokens: number | null;
      cachedInputTokens: number | null;
      outputTokens: number | null;
      reasoningTokens: number | null;
      totalTokens: number | null;
    };
  };
  toolExecution?: {
    toolName: string;
    toolCallId: string | null;
    execStatus: ToolExecStatus;
    input: unknown;
    output: unknown;
    errorMessage: string | null;
    raw: unknown;
  };
  summarization?: {
    summaryText: string;
    newContextCount: number;
    oldContextTokens: number | null;
    raw: unknown;
  };
  injection?: {
    messageIds: string[];
    reason: string | null;
  };
  message?: {
    messageId: string;
    role: string;
    kind: string | null;
    text: string | null;
    source: unknown;
    createdAt: string;
  };
  attachments: Array<{
    id: string;
    kind: AttachmentKind;
    isGzip: boolean;
    sizeBytes: number;
    contentJson: unknown;
    contentText: string | null;
  }>;
};

export type RunTimelineEventsCursor = {
  ts: string;
  id: string;
};

export type RunTimelineEventsResponse = {
  items: RunTimelineEvent[];
  nextCursor: RunTimelineEventsCursor | null;
};
