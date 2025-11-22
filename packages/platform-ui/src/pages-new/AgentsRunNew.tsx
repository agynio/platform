import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { RunScreen, type RunEvent as UiRunEvent } from '@agyn/ui-new';
import { runs as runsApi } from '@/api/modules/runs';
import type {
  RunEventStatus,
  RunEventType,
  RunTimelineEvent,
  RunTimelineEventsCursor,
  RunTimelineSummary,
  ToolOutputChunk,
  ToolOutputTerminal,
} from '@/api/types/agents';
import { graphSocket } from '@/lib/graph/socket';
import { notifyError, notifySuccess } from '@/lib/notify';

type Status = 'running' | 'finished' | 'failed' | 'pending' | 'terminated';

type ToolOutputState = {
  output: string;
  lastSeq: number;
  terminal?: ToolOutputTerminal;
};

function compareEvents(a: RunTimelineEvent, b: RunTimelineEvent): number {
  const timeDiff = Date.parse(a.ts) - Date.parse(b.ts);
  if (Number.isNaN(timeDiff)) return a.id.localeCompare(b.id);
  if (timeDiff !== 0) return timeDiff;
  return a.id.localeCompare(b.id);
}

function toCursor(event: RunTimelineEvent): RunTimelineEventsCursor {
  return { ts: event.ts, id: event.id };
}

function mapStatus(status: RunEventStatus): Status {
  switch (status) {
    case 'pending':
      return 'pending';
    case 'running':
      return 'running';
    case 'success':
      return 'finished';
    case 'error':
      return 'failed';
    case 'cancelled':
      return 'terminated';
    default:
      return 'pending';
  }
}

function mapEventType(type: RunEventType): UiRunEvent['type'] {
  switch (type) {
    case 'llm_call':
      return 'llm';
    case 'tool_execution':
      return 'tool';
    case 'summarization':
      return 'summarization';
    case 'invocation_message':
    case 'injection':
    default:
      return 'message';
  }
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString();
}

function formatDurationMs(durationMs: number | null, startedAt: string | null, endedAt: string | null): string | undefined {
  let millis = durationMs ?? null;
  if (millis == null && startedAt && endedAt) {
    const start = Date.parse(startedAt);
    const end = Date.parse(endedAt);
    if (Number.isFinite(start) && Number.isFinite(end)) {
      millis = Math.max(0, end - start);
    }
  }
  if (millis == null) return undefined;
  const seconds = Math.floor(millis / 1000);
  const minutes = Math.floor(seconds / 60);
  const hrs = Math.floor(minutes / 60);
  const remSeconds = seconds % 60;
  const remMinutes = minutes % 60;
  if (hrs > 0) return `${hrs}h ${remMinutes}m`;
  if (minutes > 0) return `${minutes}m ${remSeconds}s`;
  return `${remSeconds}s`;
}

function computeTokens(events: RunTimelineEvent[]) {
  let input = 0;
  let cached = 0;
  let output = 0;
  let reasoning = 0;
  for (const event of events) {
    const usage = event.llmCall?.usage;
    if (!usage) continue;
    input += usage.inputTokens ?? 0;
    cached += usage.cachedInputTokens ?? 0;
    output += usage.outputTokens ?? 0;
    reasoning += usage.reasoningTokens ?? 0;
  }
  const total = input + cached + output + reasoning;
  return { input, cached, output, reasoning, total };
}

function mergeEvents(prev: RunTimelineEvent[], incoming: RunTimelineEvent[]): RunTimelineEvent[] {
  if (incoming.length === 0) return prev;
  const map = new Map<string, RunTimelineEvent>();
  for (const event of prev) map.set(event.id, event);
  for (const event of incoming) map.set(event.id, event);
  const merged = Array.from(map.values());
  merged.sort(compareEvents);
  return merged;
}

function calculateStatistics(summary: RunTimelineSummary | null, events: RunTimelineEvent[]) {
  if (summary) {
    const counts = summary.countsByType ?? {};
    return {
      totalEvents: summary.totalEvents,
      messages: (counts.invocation_message ?? 0) + (counts.injection ?? 0),
      llm: counts.llm_call ?? 0,
      tools: counts.tool_execution ?? 0,
      summaries: counts.summarization ?? 0,
    };
  }
  const initial = { totalEvents: events.length, messages: 0, llm: 0, tools: 0, summaries: 0 };
  return events.reduce((acc, event) => {
    switch (event.type) {
      case 'llm_call':
        acc.llm += 1;
        break;
      case 'tool_execution':
        acc.tools += 1;
        break;
      case 'summarization':
        acc.summaries += 1;
        break;
      default:
        acc.messages += 1;
        break;
    }
    return acc;
  }, initial);
}

function detectToolSubtype(name: string | undefined | null): 'generic' | 'shell' | 'manage' | string {
  if (!name) return 'generic';
  const lowered = name.toLowerCase();
  if (lowered.includes('shell') || lowered.includes('bash') || lowered.includes('cmd')) return 'shell';
  if (lowered.includes('call_agent') || lowered.includes('call_engineer') || lowered.includes('manage')) return 'manage';
  return 'generic';
}

export function AgentsRunNew() {
  const params = useParams<{ threadId?: string; runId?: string }>();
  const runId = params.runId ?? '';
  const navigate = useNavigate();

  const [summary, setSummary] = useState<RunTimelineSummary | null>(null);
  const [events, setEvents] = useState<RunTimelineEvent[]>([]);
  const [, setCursorState] = useState<RunTimelineEventsCursor | null>(null);
  const [isTerminating, setIsTerminating] = useState(false);
  const [toolOutputVersion, setToolOutputVersion] = useState(0);
  const [initialLoaded, setInitialLoaded] = useState(false);

  const toolOutputRef = useRef<Map<string, ToolOutputState>>(new Map());
  const cursorRef = useRef<RunTimelineEventsCursor | null>(null);

  const setCursor = useCallback(
    (nextCursor: RunTimelineEventsCursor | null, opts?: { force?: boolean }) => {
      if (!runId) return;
      if (!nextCursor) {
        cursorRef.current = null;
        setCursorState(null);
        graphSocket.setRunCursor(runId, null, { force: true });
        return;
      }
      const current = cursorRef.current;
      const shouldUpdate = !current || opts?.force || Date.parse(nextCursor.ts) > Date.parse(current.ts) || (nextCursor.ts === current.ts && nextCursor.id.localeCompare(current.id) > 0);
      if (shouldUpdate) {
        cursorRef.current = nextCursor;
        setCursorState(nextCursor);
        graphSocket.setRunCursor(runId, nextCursor, { force: opts?.force });
      }
    },
    [runId],
  );

  const applyToolChunk = useCallback((chunk: ToolOutputChunk) => {
    if (chunk.runId !== runId) return;
    const map = toolOutputRef.current;
    const existing = map.get(chunk.eventId) ?? { output: '', lastSeq: -1 };
    if (existing.lastSeq >= chunk.seqGlobal) return;
    const prefix = chunk.source === 'stderr' ? '[stderr] ' : '';
    existing.output += `${prefix}${chunk.data}`;
    existing.lastSeq = chunk.seqGlobal;
    map.set(chunk.eventId, existing);
    setToolOutputVersion((prev) => prev + 1);
  }, [runId]);

  const applyToolTerminal = useCallback((payload: ToolOutputTerminal) => {
    if (payload.runId !== runId) return;
    const map = toolOutputRef.current;
    const existing = map.get(payload.eventId) ?? { output: '', lastSeq: -1 };
    existing.terminal = payload;
    map.set(payload.eventId, existing);
    setToolOutputVersion((prev) => prev + 1);
  }, [runId]);

  const fetchToolSnapshots = useCallback(async () => {
    if (!runId) return;
    const entries = Array.from(toolOutputRef.current.entries());
    await Promise.all(
      entries.map(async ([eventId, state]) => {
        try {
          const snapshot = await runsApi.toolOutputSnapshot(runId, eventId, {
            sinceSeq: state.lastSeq >= 0 ? state.lastSeq + 1 : undefined,
            order: 'asc',
          });
          const items = snapshot.items ?? [];
          if (items.length === 0) return;
          for (const chunk of items) {
            applyToolChunk(chunk);
          }
          if (snapshot.terminal) {
            applyToolTerminal(snapshot.terminal);
          }
        } catch (_err) {
          /* ignore snapshot errors */
        }
      }),
    );
  }, [runId, applyToolChunk, applyToolTerminal]);

  const loadInitial = useCallback(async () => {
    if (!runId) return;
    try {
      const [summaryRes, eventsRes] = await Promise.all([
        runsApi.timelineSummary(runId),
        runsApi.timelineEvents(runId, { limit: 200, order: 'asc' }),
      ]);
      setSummary(summaryRes);
      const items = eventsRes.items ?? [];
      setEvents(items);
      if (items.length > 0) {
        setCursor(toCursor(items[items.length - 1]), { force: true });
      } else {
        setCursor(null, { force: true });
      }
      toolOutputRef.current.clear();
      setToolOutputVersion((prev) => prev + 1);
      setInitialLoaded(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load run';
      notifyError(message);
    }
  }, [runId, setCursor]);

  const fetchSinceCursor = useCallback(async () => {
    if (!runId) return;
    const baseCursor = graphSocket.getRunCursor(runId) ?? cursorRef.current;
    if (!baseCursor) {
      await loadInitial();
      return;
    }
    try {
      const res = await runsApi.timelineEvents(runId, {
        cursorTs: baseCursor.ts,
        cursorId: baseCursor.id,
        order: 'asc',
      });
      const items = res.items ?? [];
      if (items.length > 0) {
        setEvents((prev) => mergeEvents(prev, items));
        setCursor(toCursor(items[items.length - 1]));
      }
      await fetchToolSnapshots();
      try {
        const summaryRes = await runsApi.timelineSummary(runId);
        setSummary(summaryRes);
      } catch (_err) {
        setSummary((prev) => (prev ? { ...prev, updatedAt: new Date().toISOString() } : prev));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to refresh run events';
      notifyError(message);
    }
  }, [runId, loadInitial, fetchToolSnapshots, setCursor]);

  useEffect(() => {
    setSummary(null);
    setEvents([]);
    setInitialLoaded(false);
    toolOutputRef.current.clear();
    setToolOutputVersion((prev) => prev + 1);
    cursorRef.current = null;
    setCursorState(null);
    if (runId) {
      loadInitial().catch(() => {});
    }
  }, [runId, loadInitial]);

  useEffect(() => {
    if (!runId) return;
    const room = `run:${runId}`;
    graphSocket.subscribe([room]);
    const offEvent = graphSocket.onRunEvent(({ runId: incomingRunId, event }) => {
      if (incomingRunId !== runId) return;
      setEvents((prev) => mergeEvents(prev, [event]));
      setCursor(toCursor(event));
    });
    const offStatus = graphSocket.onRunStatusChanged(({ run }) => {
      if (run.id !== runId) return;
      setSummary((prev) => (prev ? { ...prev, status: run.status, updatedAt: run.updatedAt } : prev));
    });
    const offReconnect = graphSocket.onReconnected(() => {
      fetchSinceCursor().catch(() => {});
    });
    const offToolChunk = graphSocket.onToolOutputChunk(applyToolChunk);
    const offToolTerminal = graphSocket.onToolOutputTerminal(applyToolTerminal);
    return () => {
      offEvent();
      offStatus();
      offReconnect();
      offToolChunk();
      offToolTerminal();
      graphSocket.unsubscribe([room]);
    };
  }, [runId, fetchSinceCursor, applyToolChunk, applyToolTerminal, setCursor]);

  const handleTerminate = useCallback(async () => {
    if (!runId) return;
    if (typeof window !== 'undefined' && !window.confirm('Terminate this run?')) return;
    setIsTerminating(true);
    try {
      await runsApi.terminate(runId);
      notifySuccess('Termination requested');
      const summaryRes = await runsApi.timelineSummary(runId);
      setSummary(summaryRes);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to terminate run';
      notifyError(message);
    } finally {
      setIsTerminating(false);
    }
  }, [runId]);

  const handleTerminateClick = useCallback(() => {
    if (isTerminating) return;
    void handleTerminate();
  }, [handleTerminate, isTerminating]);

  const uiEvents = useMemo<UiRunEvent[]>(() => {
    void toolOutputVersion; // ensures recompute when streaming tool output updates
    if (!initialLoaded) return [];
    return events.map<UiRunEvent>((event) => {
      const type = mapEventType(event.type);
      const timestamp = formatTimestamp(event.ts);
      const duration = formatDurationMs(event.durationMs, event.startedAt, event.endedAt);
      const status = mapStatus(event.status);
      const toolState = toolOutputRef.current.get(event.id);
      const base = {
        id: event.id,
        ts: event.ts,
        type,
        timestamp,
        duration,
        status,
        data: {} as UiRunEvent['data'],
      };
      if (type === 'message') {
        base.data = {
          messageSubtype: event.message?.kind ?? (event.type === 'injection' ? 'intermediate' : 'source'),
          content: event.message?.text ?? event.injection?.reason ?? '',
        };
      } else if (type === 'llm') {
        const usage = event.llmCall?.usage;
        base.data = {
          model: event.llmCall?.model ?? '',
          tokens: usage
            ? {
                input: usage.inputTokens ?? 0,
                cached: usage.cachedInputTokens ?? 0,
                output: usage.outputTokens ?? 0,
                reasoning: usage.reasoningTokens ?? 0,
                total:
                  (usage.inputTokens ?? 0) +
                  (usage.cachedInputTokens ?? 0) +
                  (usage.outputTokens ?? 0) +
                  (usage.reasoningTokens ?? 0),
              }
            : undefined,
          response: event.llmCall?.responseText ?? '',
          context: [],
        };
      } else if (type === 'tool') {
        const toolName = event.toolExecution?.toolName ?? 'Tool Call';
        base.data = {
          toolName,
          toolSubtype: detectToolSubtype(toolName),
          input: event.toolExecution?.input ?? null,
          output: toolState?.output ?? event.toolExecution?.output ?? '',
          command: event.metadata && (event.metadata as Record<string, unknown>)?.command,
          workingDir: event.metadata && (event.metadata as Record<string, unknown>)?.cwd,
          terminal: toolState?.terminal ?? null,
        };
      } else if (type === 'summarization') {
        base.data = {
          summary: event.summarization?.summaryText ?? '',
          oldContext: [],
          newContext: [],
        };
      }
      return base;
    });
  }, [events, initialLoaded, toolOutputVersion]);

  const tokens = useMemo(() => computeTokens(events), [events]);
  const statistics = useMemo(() => calculateStatistics(summary, events), [summary, events]);

  const runStatus: Status = summary?.status === 'terminated'
    ? 'terminated'
    : summary?.status === 'finished'
      ? 'finished'
      : summary?.status === 'running'
        ? 'running'
        : 'pending';

  const createdAt = summary?.createdAt ?? (events[0]?.ts ?? '');
  const duration = (() => {
    if (!summary) return '--';
    const start = Date.parse(summary.firstEventAt ?? summary.createdAt);
    const end = Date.parse(summary.lastEventAt ?? summary.updatedAt);
    if (!Number.isFinite(start) || !Number.isFinite(end)) return '--';
    const diff = Math.max(0, end - start);
    return formatDurationMs(diff, null, null) ?? '--';
  })();

  const handleBack = useCallback(() => {
    if (params.threadId) {
      navigate(`/agents/threads/${params.threadId}`);
    } else {
      navigate(-1);
    }
  }, [navigate, params.threadId]);

  return (
    <RunScreen
      runId={runId}
      status={runStatus}
      createdAt={createdAt}
      duration={typeof duration === 'string' ? duration : '--'}
      statistics={statistics}
      tokens={tokens}
      events={uiEvents}
      onTerminate={handleTerminateClick}
      onBack={handleBack}
      renderSidebar={false}
    />
  );
}
