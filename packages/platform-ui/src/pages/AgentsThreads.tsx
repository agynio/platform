import { useCallback, useEffect, useMemo, useRef, useState, type UIEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { QueryKey } from '@tanstack/react-query';
import ThreadsScreen from '@/components/screens/ThreadsScreen';
import type { Thread } from '@/components/ThreadItem';
import type {
  ConversationMessage,
  Run as ConversationRun,
  ReminderData as ConversationReminderData,
  QueuedMessageData as ConversationQueuedMessageData,
} from '@/components/Conversation';
import type { AutocompleteOption } from '@/components/AutocompleteInput';
import { formatDuration } from '@/components/agents/runTimelineFormatting';
import { notifyError } from '@/lib/notify';
import { LruCache } from '@/lib/lru/LruCache.ts';
import { graphSocket } from '@/lib/graph/socket';
import { threads, type ThreadTreeItem } from '@/api/modules/threads';
import { runs as runsApi } from '@/api/modules/runs';
import { useThreadById, useThreadReminders, useThreadContainers } from '@/api/hooks/threads';
import { useThreadRuns } from '@/api/hooks/runs';
import type { ThreadNode, ThreadMetrics, ThreadReminder, RunMessageItem, RunMeta } from '@/api/types/agents';
import type { ContainerItem } from '@/api/modules/containers';
import type { ApiError } from '@/api/http';
import { ContainerTerminalDialog } from '@/components/monitoring/ContainerTerminalDialog';
import { graph as graphApi } from '@/api/modules/graph';
import type { TemplateSchema } from '@/api/types/graph';
import type { PersistedGraph, PersistedGraphNode } from '@agyn/shared';
import { normalizeAgentName, normalizeAgentRole } from '@/utils/agentDisplay';
import { clearDraft, readDraft, writeDraft, THREAD_MESSAGE_MAX_LENGTH } from '@/utils/draftStorage';
import { useUser } from '@/user/user.runtime';
import { cancelReminder as cancelReminderApi } from '@/features/reminders/api';

const INITIAL_THREAD_LIMIT = 50;
const THREAD_LIMIT_STEP = 50;
const MAX_THREAD_LIMIT = 500;

const defaultMetrics: ThreadMetrics = { remindersCount: 0, containersCount: 0, activity: 'idle', runsCount: 0 };
const THREAD_CACHE_CAPACITY = 10;
const SCROLL_BOTTOM_THRESHOLD = 4;
const SCROLL_RESTORE_ATTEMPTS = 5;
const SCROLL_PERSIST_DEBOUNCE_MS = 75;

type FilterMode = 'open' | 'closed' | 'all';

type ThreadChildrenEntry = {
  nodes: ThreadNode[];
  status: 'idle' | 'loading' | 'success' | 'error';
  error?: string | null;
  hasChildren: boolean;
};

type ThreadChildrenState = Record<string, ThreadChildrenEntry>;

type ToggleThreadStatusContext = {
  previousDetail: ThreadNode | undefined;
  previousRoots: Array<[QueryKey, { items: ThreadNode[] } | undefined]>;
  previousChildrenState: ThreadChildrenState;
  previousOptimisticStatus?: 'open' | 'closed';
};

type SocketMessage = {
  id: string;
  kind: 'user' | 'assistant' | 'system' | 'tool';
  text: string | null;
  source: unknown;
  createdAt: string;
  runId?: string;
};

type SocketRun = { id: string; status: 'running' | 'finished' | 'terminated'; createdAt: string; updatedAt: string };

type ConversationMessageWithMeta = ConversationMessage & { createdAtRaw: string };

type ScrollState = {
  atBottom: boolean;
  dFromBottom: number;
  lastScrollTop: number;
  lastMeasured: number;
};

type ThreadViewCacheEntry = {
  threadId: string;
  runs: RunMeta[];
  runMessagesByRunId: Record<string, ConversationMessageWithMeta[]>;
  scroll: ScrollState | null;
  messagesLoaded: boolean;
  updatedAt: number;
};

type ThreadDraft = {
  id: string;
  agentNodeId?: string;
  agentName?: string;
  inputValue: string;
  createdAt: string;
};

type AgentOption = { id: string; name: string; graphTitle?: string };

const DRAFT_SUMMARY_LABEL = '(new conversation)';
const DRAFT_RECIPIENT_PLACEHOLDER = '(no recipient)';
const UNKNOWN_AGENT_LABEL = '(unknown agent)';

function isDraftThreadId(threadId: string | null | undefined): threadId is string {
  return typeof threadId === 'string' && threadId.startsWith('draft:');
}

function createDraftId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `draft:${crypto.randomUUID()}`;
  }
  return `draft:${Math.random().toString(36).slice(2, 10)}`;
}

function mapDraftToThread(draft: ThreadDraft): Thread {
  return {
    id: draft.id,
    summary: DRAFT_SUMMARY_LABEL,
    agentName: draft.agentName ?? DRAFT_RECIPIENT_PLACEHOLDER,
    createdAt: draft.createdAt,
    status: 'pending',
    isOpen: true,
    hasChildren: false,
    childrenError: null,
  } satisfies Thread;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function formatReminderScheduledTime(value: string | null | undefined): string {
  if (!value) return '00:00';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '00:00';
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}

function formatReminderDate(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

function sanitizeSummary(summary: string | null | undefined): string {
  const trimmed = summary?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : '(no summary yet)';
}

function resolveThreadAgentName(node: ThreadNode): string {
  const explicit = normalizeAgentName(node.agentName);
  if (explicit) return explicit;
  return UNKNOWN_AGENT_LABEL;
}

function resolveThreadAgentRole(node: ThreadNode): string | undefined {
  return normalizeAgentRole(node.agentRole);
}

function containerDisplayName(container: ContainerItem): string {
  return container.name;
}

const sendMessageErrorMap: Record<string, string> = {
  bad_message_payload: 'Please enter a message up to 8000 characters.',
  thread_not_found: 'Thread not found. It may have been removed.',
  thread_closed: 'This thread is resolved. Reopen it to send messages.',
  agent_unavailable: 'Agent is not currently available for this thread.',
  agent_unready: 'Agent is starting up. Try again shortly.',
  send_failed: 'Failed to send the message. Please retry.',
};

const createThreadErrorMap: Record<string, string> = {
  bad_message_payload: 'Please enter a message up to 8000 characters.',
  agent_unavailable: 'Agent is not currently available for new threads.',
  agent_unready: 'Agent is starting up. Try again shortly.',
  create_failed: 'Failed to create the thread. Please retry.',
  parent_not_found: 'Parent thread not found. It may have been removed.',
};

function resolveApiError(error: unknown, map: Record<string, string>, fallback: string): string {
  if (error && typeof error === 'object') {
    const apiError = error as ApiError;
    const payload = apiError.response?.data as { error?: unknown; message?: unknown } | undefined;
    if (payload && typeof payload === 'object') {
      const code = typeof payload.error === 'string' ? payload.error : undefined;
      if (code && map[code]) {
        return map[code];
      }
      const message = typeof payload.message === 'string' ? payload.message : undefined;
      if (message) return message;
    }
    if (typeof apiError.message === 'string' && apiError.message.trim().length > 0) {
      return apiError.message;
    }
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}

const resolveSendMessageError = (error: unknown) => resolveApiError(error, sendMessageErrorMap, 'Failed to send the message.');

const resolveCreateThreadError = (error: unknown) => resolveApiError(error, createThreadErrorMap, 'Failed to create the thread.');

function updateThreadChildrenStatus(state: ThreadChildrenState, threadId: string, next: 'open' | 'closed'): ThreadChildrenState {
  let changed = false;
  const nextState: ThreadChildrenState = {};
  for (const [id, entry] of Object.entries(state)) {
    if (!entry) {
      nextState[id] = entry;
      continue;
    }
    if (entry.nodes.length === 0) {
      nextState[id] = entry;
      continue;
    }
    const nodes = entry.nodes.map((node) => {
      if (node.id !== threadId) return node;
      changed = true;
      return { ...node, status: next };
    });
    nextState[id] = nodes === entry.nodes ? entry : { ...entry, nodes };
  }
  return changed ? nextState : state;
}

type StatusOverride = {
  hasRunningRun?: boolean;
  hasPendingReminder?: boolean;
  status?: 'open' | 'closed';
};

type StatusOverrides = Record<string, StatusOverride>;

function computeStatusInputs(node: ThreadNode, override: StatusOverride | undefined): {
  hasRunningRun: boolean;
  hasPendingReminder: boolean;
  activity: ThreadMetrics['activity'];
} {
  const metrics = node.metrics ?? defaultMetrics;
  return {
    hasRunningRun: override?.hasRunningRun ?? metrics.activity === 'working',
    hasPendingReminder: override?.hasPendingReminder ?? metrics.remindersCount > 0,
    activity: metrics.activity,
  };
}

function computeThreadStatus(node: ThreadNode, children: Thread[], overrides: StatusOverrides): Thread['status'] {
  const inputs = computeStatusInputs(node, overrides[node.id]);
  if (inputs.hasRunningRun) return 'running';
  const hasActiveChild = children.some((child) => child.status === 'running' || child.status === 'pending');
  if (inputs.hasPendingReminder || inputs.activity === 'waiting' || hasActiveChild) {
    return 'pending';
  }
  return 'finished';
}

function matchesFilter(status: 'open' | 'closed', filter: FilterMode): boolean {
  if (filter === 'all') return true;
  return filter === status;
}

function cloneThreadNode(item: ThreadTreeItem): ThreadNode {
  return {
    id: item.id,
    alias: item.alias,
    summary: item.summary ?? null,
    status: item.status,
    parentId: item.parentId ?? null,
    createdAt: item.createdAt,
    metrics: item.metrics ? { ...item.metrics } : undefined,
    agentRole: item.agentRole,
    agentName: item.agentName,
  } satisfies ThreadNode;
}

function areThreadNodesEqual(a: ThreadNode, b: ThreadNode): boolean {
  if (a.id !== b.id) return false;
  if ((a.alias ?? null) !== (b.alias ?? null)) return false;
  if ((a.summary ?? null) !== (b.summary ?? null)) return false;
  if ((a.status ?? null) !== (b.status ?? null)) return false;
  if ((a.parentId ?? null) !== (b.parentId ?? null)) return false;
  if (a.createdAt !== b.createdAt) return false;
  if ((a.agentRole ?? null) !== (b.agentRole ?? null)) return false;
  if ((a.agentName ?? null) !== (b.agentName ?? null)) return false;
  const metricsA = a.metrics;
  const metricsB = b.metrics;
  if (!metricsA && !metricsB) return true;
  if (!metricsA || !metricsB) return false;
  return (
    metricsA.remindersCount === metricsB.remindersCount &&
    metricsA.containersCount === metricsB.containersCount &&
    metricsA.runsCount === metricsB.runsCount &&
    metricsA.activity === metricsB.activity
  );
}

function mergeChildrenEntry(prev: ThreadChildrenEntry | undefined, nodes: ThreadNode[], hasChildren: boolean): ThreadChildrenEntry {
  const dedup = new Map<string, ThreadNode>();
  for (const node of nodes) dedup.set(node.id, node);
  const merged = Array.from(dedup.values());
  merged.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

  if (!prev || prev.status !== 'success') {
    return { nodes: merged, status: 'success', error: null, hasChildren };
  }

  const prevMap = new Map(prev.nodes.map((node) => [node.id, node] as const));
  let changed = prev.hasChildren !== hasChildren || prev.nodes.length !== merged.length;

  const normalized = merged.map((node) => {
    const existing = prevMap.get(node.id);
    if (existing && areThreadNodesEqual(existing, node)) {
      return existing;
    }
    changed = true;
    return node;
  });

  if (!changed) return prev;

  return { nodes: normalized, status: 'success', error: null, hasChildren };
}

function buildThreadTree(node: ThreadNode, children: ThreadChildrenState, overrides: StatusOverrides): Thread {
  const entry = children[node.id];
  const childNodes = entry?.nodes ?? [];
  const mappedChildren = childNodes.map((child) => buildThreadTree(child, children, overrides));
  const override = overrides[node.id];
  const status = override?.status ?? node.status ?? 'open';
  return {
    id: node.id,
    summary: sanitizeSummary(node.summary ?? null),
    agentName: resolveThreadAgentName(node),
    agentRole: resolveThreadAgentRole(node),
    createdAt: node.createdAt,
    status: computeThreadStatus(node, mappedChildren, overrides),
    isOpen: status === 'open',
    subthreads: mappedChildren.length > 0 ? mappedChildren : undefined,
    hasChildren: entry ? entry.hasChildren : true,
    isChildrenLoading: entry?.status === 'loading',
    childrenError: entry?.status === 'error' ? entry.error ?? 'Unable to load subthreads' : null,
  };
}

function findThreadNode(nodes: ThreadNode[], children: ThreadChildrenState, targetId: string): ThreadNode | undefined {
  for (const node of nodes) {
    if (node.id === targetId) return node;
    const entry = children[node.id];
    if (entry) {
      const found = findThreadNode(entry.nodes, children, targetId);
      if (found) return found;
    }
  }
  return undefined;
}

function compareRunMeta(a: RunMeta, b: RunMeta): number {
  const diff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  if (diff !== 0) return diff;
  return a.id.localeCompare(b.id);
}

function mapRunStatus(status: RunMeta['status']): ConversationRun['status'] {
  if (status === 'terminated') return 'failed';
  if (status === 'finished') return 'finished';
  return 'running';
}

function computeRunDuration(run: RunMeta): string | undefined {
  const start = Date.parse(run.createdAt);
  if (!Number.isFinite(start)) return undefined;
  const endCandidate = run.status === 'running' ? Date.now() : Date.parse(run.updatedAt);
  const end = Number.isFinite(endCandidate) ? endCandidate : start;
  const ms = Math.max(0, end - start);
  const label = formatDuration(ms);
  return label === '—' ? undefined : label;
}

function compareMessages(a: ConversationMessageWithMeta, b: ConversationMessageWithMeta): number {
  const diff = Date.parse(a.createdAtRaw) - Date.parse(b.createdAtRaw);
  if (diff !== 0) return diff;
  return a.id.localeCompare(b.id);
}

function mergeMessages(base: ConversationMessageWithMeta[], additions: ConversationMessageWithMeta[]): ConversationMessageWithMeta[] {
  if (additions.length === 0) return base;
  if (base.length === 0) return [...additions].sort(compareMessages);
  const map = new Map<string, ConversationMessageWithMeta>();
  for (const msg of base) map.set(msg.id, msg);
  for (const msg of additions) map.set(msg.id, msg);
  const merged = Array.from(map.values());
  merged.sort(compareMessages);
  return merged;
}

function areMessageListsEqual(a: ConversationMessageWithMeta[], b: ConversationMessageWithMeta[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    const left = a[i];
    const right = b[i];
    if (left.id !== right.id || left.role !== right.role || left.content !== right.content || left.timestamp !== right.timestamp) {
      return false;
    }
  }
  return true;
}

function mapApiMessages(items: RunMessageItem[]): ConversationMessageWithMeta[] {
  return items.map((item) => ({
    id: item.id,
    role: item.kind,
    content: item.text ?? '',
    timestamp: formatDate(item.createdAt),
    createdAtRaw: item.createdAt,
  }));
}

async function fetchRunMessages(runId: string): Promise<ConversationMessageWithMeta[]> {
  const [input, injected, output] = await Promise.all([
    runsApi.messages(runId, 'input'),
    runsApi.messages(runId, 'injected'),
    runsApi.messages(runId, 'output'),
  ]);
  const combined = [...mapApiMessages(input.items), ...mapApiMessages(injected.items), ...mapApiMessages(output.items)];
  combined.sort(compareMessages);
  return combined;
}

function mapSocketMessage(message: SocketMessage): ConversationMessageWithMeta {
  return {
    id: message.id,
    role: message.kind,
    content: message.text ?? '',
    timestamp: formatDate(message.createdAt),
    createdAtRaw: message.createdAt,
  };
}

function createEmptyCacheEntry(threadId: string): ThreadViewCacheEntry {
  return {
    threadId,
    runs: [],
    runMessagesByRunId: {},
    scroll: null,
    messagesLoaded: false,
    updatedAt: Date.now(),
  };
}

function cloneRunMessagesMap(map: Record<string, ConversationMessageWithMeta[]>): Record<string, ConversationMessageWithMeta[]> {
  const result: Record<string, ConversationMessageWithMeta[]> = {};
  for (const [runId, messages] of Object.entries(map)) {
    result[runId] = [...messages];
  }
  return result;
}

function computeScrollStateFromNode(node: HTMLDivElement): ScrollState {
  const { scrollTop, scrollHeight, clientHeight } = node;
  const maxScrollTop = Math.max(0, scrollHeight - clientHeight);
  const distanceFromBottom = Math.max(0, scrollHeight - clientHeight - scrollTop);
  const atBottom = maxScrollTop - scrollTop <= SCROLL_BOTTOM_THRESHOLD;
  return {
    atBottom,
    dFromBottom: atBottom ? 0 : distanceFromBottom,
    lastScrollTop: scrollTop,
    lastMeasured: Date.now(),
  };
}

function restoreScrollPosition(node: HTMLDivElement, state: ScrollState | null): void {
  if (!state || state.atBottom) {
    node.scrollTop = node.scrollHeight;
    return;
  }
  const target = Math.max(0, node.scrollHeight - node.clientHeight - state.dFromBottom);
  node.scrollTop = target;
}

function mapReminders(items: ThreadReminder[]): { id: string; title: string; time: string }[] {
  return items.map((reminder) => ({
    id: reminder.id,
    title: sanitizeSummary(reminder.note ?? null),
    time: formatDate(reminder.at),
  }));
}

function mapContainers(items: ContainerItem[]): { id: string; name: string; status: 'running' | 'finished' }[] {
  return items.map((container) => ({
    id: container.containerId,
    name: containerDisplayName(container),
    status: container.status === 'running' ? 'running' : 'finished',
  }));
}

export function AgentsThreads() {
  const params = useParams<{ threadId?: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useUser();
  const userEmail = user?.email ?? null;

  const [filterMode, setFilterMode] = useState<FilterMode>('open');
  const [threadLimit, setThreadLimit] = useState<number>(INITIAL_THREAD_LIMIT);
  const [childrenState, setChildrenState] = useState<ThreadChildrenState>({});
  const [optimisticStatus, setOptimisticStatus] = useState<Record<string, 'open' | 'closed'>>({});
  const [inputValue, setInputValue] = useState('');
  const [drafts, setDrafts] = useState<ThreadDraft[]>([]);
  const [selectedThreadIdState, setSelectedThreadIdState] = useState<string | null>(params.threadId ?? null);
  const [runMessages, setRunMessages] = useState<Record<string, ConversationMessageWithMeta[]>>({});
  const [queuedMessages, setQueuedMessages] = useState<ConversationQueuedMessageData[]>([]);
  const [cancellingReminderIds, setCancellingReminderIds] = useState<ReadonlySet<string>>(() => new Set());
  const [prefetchedRuns, setPrefetchedRuns] = useState<RunMeta[]>([]);
  const [messagesError, setMessagesError] = useState<string | null>(null);
  const [isRunsInfoCollapsed, setRunsInfoCollapsed] = useState(false);
  const [selectedContainerId, setSelectedContainerId] = useState<string | null>(null);
  const [detailPreloaderVisible, setDetailPreloaderVisible] = useState(false);
  const [initialMessagesLoaded, setInitialMessagesLoaded] = useState(false);

  const pendingMessagesRef = useRef<Map<string, ConversationMessageWithMeta[]>>(new Map());
  const seenMessageIdsRef = useRef<Map<string, Set<string>>>(new Map());
  const runIdsRef = useRef<Set<string>>(new Set());
  const draftsRef = useRef<ThreadDraft[]>([]);
  const lastSelectedIdRef = useRef<string | null>(null);
  const lastNonDraftIdRef = useRef<string | null>(null);
  const threadCacheRef = useRef(new LruCache<string, ThreadViewCacheEntry>(THREAD_CACHE_CAPACITY));
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const latestScrollStateRef = useRef<ScrollState | null>(null);
  const pendingScrollRestoreRef = useRef<ScrollState | null>(null);
  const scrollPersistTimerRef = useRef<number | null>(null);
  const scrollRestoreTokenRef = useRef(0);
  const pendingRestoreFrameRef = useRef<number | null>(null);
  const draftSaveTimerRef = useRef<number | null>(null);
  const latestInputValueRef = useRef<string>('');
  const lastPersistedTextRef = useRef<string>('');
  const previousThreadIdRef = useRef<string | null>(params.threadId ?? null);
  const activeThreadIdRef = useRef<string | null>(params.threadId ?? null);

  const updateCacheEntry = useCallback(
    (threadId: string, updates: Partial<Omit<ThreadViewCacheEntry, 'threadId'>>) => {
      if (!threadId) return;
      const cache = threadCacheRef.current;
      const base = cache.has(threadId) ? cache.get(threadId)! : createEmptyCacheEntry(threadId);
      const next: ThreadViewCacheEntry = {
        ...base,
        runs: updates.runs ? [...updates.runs] : [...base.runs],
        runMessagesByRunId: updates.runMessagesByRunId
          ? cloneRunMessagesMap(updates.runMessagesByRunId)
          : { ...base.runMessagesByRunId },
        scroll: updates.scroll ?? base.scroll,
        messagesLoaded: updates.messagesLoaded ?? base.messagesLoaded,
        updatedAt: Date.now(),
      };
      cache.set(threadId, next);
    },
    [],
  );

  const selectedThreadId = params.threadId ?? selectedThreadIdState;
  const isDraftSelected = isDraftThreadId(selectedThreadId);
  const activeQueuedMessagesQueryKey = useMemo(
    () => (selectedThreadId && !isDraftSelected ? (['agents', 'threads', selectedThreadId, 'queued'] as const) : null),
    [selectedThreadId, isDraftSelected],
  );

  useEffect(() => {
    activeThreadIdRef.current = selectedThreadId ?? null;
  }, [selectedThreadId]);

  useEffect(() => {
    if (params.threadId) {
      setSelectedThreadIdState(params.threadId);
    }
  }, [params.threadId]);

  useEffect(() => {
    draftsRef.current = drafts;
  }, [drafts]);

  const cancelDraftSave = useCallback(() => {
    if (typeof window === 'undefined') return;
    if (draftSaveTimerRef.current !== null) {
      window.clearTimeout(draftSaveTimerRef.current);
      draftSaveTimerRef.current = null;
    }
  }, []);

  const persistDraftNow = useCallback(
    (threadId: string, value: string) => {
      if (!threadId || isDraftThreadId(threadId)) return;
      const trimmed = value.trim();
      if (trimmed.length === 0) {
        clearDraft(threadId, userEmail);
        lastPersistedTextRef.current = '';
        return;
      }
      const limited = value.slice(0, THREAD_MESSAGE_MAX_LENGTH);
      if (limited === lastPersistedTextRef.current) return;
      writeDraft(threadId, limited, userEmail);
      lastPersistedTextRef.current = limited;
    },
    [userEmail],
  );

  const scheduleDraftPersist = useCallback(
    (threadId: string, value: string) => {
      if (typeof window === 'undefined') return;
      cancelDraftSave();
      draftSaveTimerRef.current = window.setTimeout(() => {
        draftSaveTimerRef.current = null;
        persistDraftNow(threadId, value);
      }, 250);
    },
    [cancelDraftSave, persistDraftNow],
  );

  useEffect(() => {
    const prevSelectedId = lastSelectedIdRef.current;
    if (prevSelectedId && prevSelectedId !== selectedThreadId && isDraftThreadId(prevSelectedId)) {
      setDrafts((prev) => {
        const draft = prev.find((item) => item.id === prevSelectedId);
        if (!draft) return prev;
        const hasContent = draft.inputValue.trim().length > 0 || !!draft.agentNodeId;
        if (hasContent) return prev;
        return prev.filter((item) => item.id !== prevSelectedId);
      });
    }

    lastSelectedIdRef.current = selectedThreadId ?? null;
    if (selectedThreadId && !isDraftSelected) {
      lastNonDraftIdRef.current = selectedThreadId;
    }
  }, [selectedThreadId, isDraftSelected]);

  useEffect(() => {
    const prevThreadId = previousThreadIdRef.current;
    const nextThreadId = selectedThreadId ?? null;

    if (prevThreadId && prevThreadId !== nextThreadId) {
      cancelDraftSave();
      persistDraftNow(prevThreadId, latestInputValueRef.current);
    }

    previousThreadIdRef.current = nextThreadId;

    if (!nextThreadId || isDraftThreadId(nextThreadId)) {
      cancelDraftSave();
      lastPersistedTextRef.current = '';
      return;
    }

    const previousValue = latestInputValueRef.current;
    const stored = readDraft(nextThreadId, userEmail);
    const nextValue = stored?.text ?? '';
    lastPersistedTextRef.current = nextValue;
    latestInputValueRef.current = nextValue;
    if (nextValue === previousValue) return;
    setInputValue(nextValue);
  }, [selectedThreadId, userEmail, cancelDraftSave, persistDraftNow]);

  useEffect(() => {
    latestInputValueRef.current = inputValue;
  }, [inputValue]);

  useEffect(() => {
    return () => {
      cancelDraftSave();
      const currentThreadId = activeThreadIdRef.current;
      if (currentThreadId) {
        persistDraftNow(currentThreadId, latestInputValueRef.current);
      }
    };
  }, [cancelDraftSave, persistDraftNow]);

  const loadThreadChildren = useCallback(
    async (threadId: string) => {
      let shouldFetch = true;
      setChildrenState((prev) => {
        const entry = prev[threadId];
        if (entry?.status === 'loading') {
          shouldFetch = false;
          return prev;
        }
        if (entry?.status === 'success') {
          const canSkip = entry.hasChildren === false || entry.nodes.length > 0;
          if (canSkip) {
            shouldFetch = false;
            return prev;
          }
        }
        if (entry && entry.hasChildren === false && entry.nodes.length === 0) {
          shouldFetch = false;
          return prev;
        }
        return {
          ...prev,
          [threadId]: {
            nodes: entry?.nodes ?? [],
            status: 'loading',
            error: null,
            hasChildren: entry?.hasChildren ?? true,
          },
        };
      });
      if (!shouldFetch) return;
      try {
        const res = await threads.children(threadId, filterMode);
        const nodes = res.items ?? [];
        setChildrenState((prev) => ({
          ...prev,
          [threadId]: {
            nodes,
            status: 'success',
            error: null,
            hasChildren: nodes.length > 0,
          },
        }));
      } catch (error) {
        const details = error instanceof Error && error.message ? error.message : null;
        const message = details ? `Failed to load subthreads (${details})` : 'Failed to load subthreads';
        setChildrenState((prev) => ({
          ...prev,
          [threadId]: {
            nodes: prev[threadId]?.nodes ?? [],
            status: 'error',
            error: message,
            hasChildren: true,
          },
        }));
      }
    },
    [filterMode],
  );

  const shouldLoadAgents = drafts.length > 0;
  const fullGraphQuery = useQuery<PersistedGraph>({
    queryKey: ['agents', 'graph', 'full'],
    queryFn: () => graphApi.getFullGraph(),
    enabled: shouldLoadAgents,
    staleTime: 60000,
  });
  const graphTemplatesQuery = useQuery<TemplateSchema[]>({
    queryKey: ['agents', 'graph', 'templates'],
    queryFn: () => graphApi.getTemplates(),
    enabled: shouldLoadAgents,
    staleTime: 60000,
  });

  const agentOptions = useMemo<AgentOption[]>(() => {
    const graphData = fullGraphQuery.data;
    if (!graphData) return [];
    const templates = graphTemplatesQuery.data ?? [];
    const templateByName = new Map<string, TemplateSchema>();
    for (const template of templates) {
      if (!template?.name) continue;
      templateByName.set(template.name, template);
    }

    const result: AgentOption[] = [];
    const seen = new Set<string>();
    for (const node of (graphData.nodes ?? []) as PersistedGraphNode[]) {
      if (!node?.id || seen.has(node.id)) continue;
      const template = templateByName.get(node.template);
      if (template?.kind !== 'agent') continue;
      const config = node.config && typeof node.config === 'object' ? (node.config as Record<string, unknown>) : undefined;
      const rawName = typeof config?.name === 'string' ? config.name.trim() : '';
      const configTitleCandidate = typeof config?.title === 'string' ? config.title.trim() : '';
      const templateTitle = typeof template?.title === 'string' ? template.title.trim() : '';
      const name = rawName.length > 0 ? rawName : UNKNOWN_AGENT_LABEL;
      seen.add(node.id);
      result.push({
        id: node.id,
        name,
        graphTitle: configTitleCandidate || templateTitle || undefined,
      });
    }

    result.sort((a, b) => a.name.localeCompare(b.name));
    return result;
  }, [fullGraphQuery.data, graphTemplatesQuery.data]);

  const draftFetchOptions = useCallback(
    async (query: string): Promise<AutocompleteOption[]> => {
      const normalized = query.trim().toLowerCase();
      return agentOptions
        .filter((option) => normalized.length === 0 || option.name.toLowerCase().includes(normalized))
        .map((option) => ({ value: option.id, label: option.name }));
    },
    [agentOptions],
  );

  const limitKey = useMemo(() => ({ limit: threadLimit }), [threadLimit]);
  const threadsQueryKey = useMemo(() => ['agents', 'threads', 'roots', filterMode, limitKey] as const, [filterMode, limitKey]);

  const threadsQuery = useQuery<{ items: ThreadTreeItem[] }, Error>({
    queryKey: threadsQueryKey,
    queryFn: () => threads.treeRoots(filterMode, threadLimit, 2),
    placeholderData: (previousData) => previousData,
    staleTime: 60000,
    refetchOnWindowFocus: false,
  });

  const rootNodes = useMemo<ThreadNode[]>(() => {
    const data = threadsQuery.data?.items ?? [];
    const dedup = new Map<string, ThreadNode>();
    for (const item of data) dedup.set(item.id, cloneThreadNode(item));
    const nodes = Array.from(dedup.values());
    nodes.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    return nodes;
  }, [threadsQuery.data]);

  useEffect(() => {
    const items = threadsQuery.data?.items ?? [];
    if (items.length === 0) return;
    setChildrenState((prev) => {
      let changed = false;
      const next: ThreadChildrenState = { ...prev };
      for (const item of items) {
        const childItems = item.children ?? [];
        const childNodes = childItems.map(cloneThreadNode);
        const rootEntry = mergeChildrenEntry(next[item.id], childNodes, item.hasChildren ?? childNodes.length > 0);
        if (rootEntry !== next[item.id]) {
          next[item.id] = rootEntry;
          changed = true;
        }
        for (const child of childItems) {
          const grandchildItems = child.children ?? [];
          const grandchildNodes = grandchildItems.map(cloneThreadNode);
          const childEntry = mergeChildrenEntry(next[child.id], grandchildNodes, child.hasChildren ?? grandchildNodes.length > 0);
          if (childEntry !== next[child.id]) {
            next[child.id] = childEntry;
            changed = true;
          }
        }
      }
      return changed ? next : prev;
    });
  }, [threadsQuery.data]);

  const effectiveSelectedThreadId = isDraftSelected ? undefined : selectedThreadId ?? undefined;

  const threadDetailQuery = useThreadById(effectiveSelectedThreadId);
  const runsQuery = useThreadRuns(effectiveSelectedThreadId);

  const runList = useMemo<RunMeta[]>(() => {
    const items = runsQuery.data?.items ?? [];
    const sorted = [...items];
    sorted.sort(compareRunMeta);
    return sorted;
  }, [runsQuery.data]);

  const hasRunningRun = useMemo(() => runList.some((run) => run.status === 'running'), [runList]);
  const queuedMessagesQuery = useQuery({
    queryKey: ['agents', 'threads', selectedThreadId ?? 'draft', 'queued'] as const,
    queryFn: async () => {
      return threads.queuedMessages(selectedThreadId!);
    },
    enabled: Boolean(selectedThreadId) && !isDraftSelected,
    refetchInterval: hasRunningRun ? 7000 : false,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    scrollRestoreTokenRef.current += 1;
    if (pendingRestoreFrameRef.current !== null) {
      window.cancelAnimationFrame(pendingRestoreFrameRef.current);
      pendingRestoreFrameRef.current = null;
    }
    if (scrollPersistTimerRef.current !== null) {
      window.clearTimeout(scrollPersistTimerRef.current);
      scrollPersistTimerRef.current = null;
    }

    pendingMessagesRef.current = new Map();
    runIdsRef.current = new Set();
    setMessagesError(null);
    setQueuedMessages([]);
    setCancellingReminderIds(new Set());

    if (!selectedThreadId || isDraftSelected) {
      setRunMessages({});
      setPrefetchedRuns([]);
      seenMessageIdsRef.current = new Map();
      latestScrollStateRef.current = null;
      pendingScrollRestoreRef.current = null;
      setInitialMessagesLoaded(true);
      setDetailPreloaderVisible(false);
      return;
    }

    const cache = threadCacheRef.current;
    const cachedEntry = cache.has(selectedThreadId) ? cache.get(selectedThreadId)! : undefined;
    let overlayNeeded = true;

    if (cachedEntry) {
      overlayNeeded = false;
      setPrefetchedRuns([...cachedEntry.runs]);
      setRunMessages(cloneRunMessagesMap(cachedEntry.runMessagesByRunId));
      const seen = new Map<string, Set<string>>();
      for (const run of cachedEntry.runs) {
        const messages = cachedEntry.runMessagesByRunId[run.id] ?? [];
        seen.set(run.id, new Set(messages.map((message) => message.id)));
        runIdsRef.current.add(run.id);
      }
      seenMessageIdsRef.current = seen;
      latestScrollStateRef.current = cachedEntry.scroll;
      pendingScrollRestoreRef.current = cachedEntry.scroll;
      setInitialMessagesLoaded(true);
    } else {
      setPrefetchedRuns([]);
      setRunMessages({});
      seenMessageIdsRef.current = new Map();
      latestScrollStateRef.current = null;
      pendingScrollRestoreRef.current = null;
      setInitialMessagesLoaded(false);
    }

    setDetailPreloaderVisible(overlayNeeded);
  }, [selectedThreadId, isDraftSelected]);

  useEffect(() => {
    if (runsQuery.isLoading && prefetchedRuns.length > 0) {
      return;
    }
    const currentIds = new Set(runList.map((run) => run.id));
    runIdsRef.current = currentIds;
    setRunMessages((prev) => {
      const next: Record<string, ConversationMessageWithMeta[]> = {};
      for (const id of currentIds) {
        if (prev[id]) next[id] = prev[id];
      }
      return next;
    });
    for (const id of currentIds) {
      if (!seenMessageIdsRef.current.has(id)) seenMessageIdsRef.current.set(id, new Set());
    }
    for (const id of Array.from(seenMessageIdsRef.current.keys())) {
      if (!currentIds.has(id)) seenMessageIdsRef.current.delete(id);
    }
    for (const id of Array.from(pendingMessagesRef.current.keys())) {
      if (!currentIds.has(id)) pendingMessagesRef.current.delete(id);
    }
  }, [runList, runsQuery.isLoading, prefetchedRuns]);

  const flushPendingForRun = useCallback((runId: string) => {
    const pending = pendingMessagesRef.current.get(runId);
    if (!pending || pending.length === 0) return;
    pendingMessagesRef.current.delete(runId);
    setRunMessages((prev) => {
      const existing = prev[runId] ?? [];
      const merged = mergeMessages(existing, pending);
      seenMessageIdsRef.current.set(runId, new Set(merged.map((m) => m.id)));
      if (areMessageListsEqual(existing, merged)) return prev;
      return { ...prev, [runId]: merged };
    });
  }, []);

  useEffect(() => {
    if (!selectedThreadId || isDraftSelected) return;
    if (runList.length === 0) {
      if (!runsQuery.isLoading) {
        setInitialMessagesLoaded(true);
        updateCacheEntry(selectedThreadId, { messagesLoaded: true });
      }
      return;
    }

    let cancelled = false;
    const concurrency = 3;
    let index = 0;
    let inflight = 0;
    let remaining = runList.length;

    const markComplete = () => {
      if (cancelled) return;
      setInitialMessagesLoaded(true);
      updateCacheEntry(selectedThreadId, { messagesLoaded: true });
    };

    const queue = runList.map((run) => async () => {
      try {
        const msgs = await fetchRunMessages(run.id);
        if (!cancelled) {
          setRunMessages((prev) => {
            const existing = prev[run.id] ?? [];
            const merged = mergeMessages(existing, msgs);
            seenMessageIdsRef.current.set(run.id, new Set(merged.map((m) => m.id)));
            if (areMessageListsEqual(existing, merged)) return prev;
            return { ...prev, [run.id]: merged };
          });
        }
      } catch (error) {
        if (!cancelled) {
          setMessagesError(error instanceof Error ? error.message : 'Failed to load messages.');
        }
      } finally {
        remaining -= 1;
        if (remaining === 0) {
          markComplete();
        }
      }
    });

    if (remaining === 0) {
      markComplete();
      return;
    }

    const pump = () => {
      while (inflight < concurrency && index < queue.length) {
        const fn = queue[index++];
        inflight += 1;
        fn().finally(() => {
          inflight -= 1;
          if (!cancelled) pump();
        });
      }
    };

    pump();
    return () => {
      cancelled = true;
    };
  }, [selectedThreadId, isDraftSelected, runList, runsQuery.isLoading, updateCacheEntry]);

  useEffect(() => {
    for (const run of runList) {
      flushPendingForRun(run.id);
    }
  }, [runList, flushPendingForRun]);

  useEffect(() => {
    if (!selectedThreadId || isDraftSelected) return;
    if (runsQuery.isLoading) return;
    updateCacheEntry(selectedThreadId, { runs: runList });
  }, [selectedThreadId, isDraftSelected, runList, runsQuery.isLoading, updateCacheEntry]);

  useEffect(() => {
    if (!selectedThreadId || isDraftSelected) return;
    updateCacheEntry(selectedThreadId, { runMessagesByRunId: runMessages });
  }, [selectedThreadId, isDraftSelected, runMessages, updateCacheEntry]);

  useEffect(() => {
    if (!selectedThreadId || isDraftSelected) {
      return;
    }
    if (queuedMessagesQuery.status === 'success') {
      const items = queuedMessagesQuery.data?.items ?? [];
      const mapped = items.map((item) => ({ id: item.id, content: item.text ?? '' }));
      setQueuedMessages((prev) => {
        if (prev.length === mapped.length) {
          let unchanged = true;
          for (let i = 0; i < prev.length; i += 1) {
            if (prev[i].id !== mapped[i].id || prev[i].content !== mapped[i].content) {
              unchanged = false;
              break;
            }
          }
          if (unchanged) return prev;
        }
        return mapped;
      });
      return;
    }
    if (queuedMessagesQuery.status === 'error') {
      setQueuedMessages([]);
    }
  }, [selectedThreadId, isDraftSelected, queuedMessagesQuery.status, queuedMessagesQuery.data]);

  useEffect(() => {
    const knownIds = new Set<string>();
    for (const messages of Object.values(runMessages)) {
      for (const message of messages) {
        knownIds.add(message.id);
      }
    }
    if (knownIds.size === 0) return;
    setQueuedMessages((prev) => {
      if (prev.length === 0) return prev;
      const filtered = prev.filter((item) => !knownIds.has(item.id));
      return filtered.length === prev.length ? prev : filtered;
    });
  }, [runMessages]);

  useEffect(() => {
    if (!selectedThreadId) return;
    const offMsg = graphSocket.onMessageCreated(({ threadId, message }) => {
      if (threadId !== selectedThreadId) return;
      if (!message.runId) {
        if (activeQueuedMessagesQueryKey) {
          void queryClient.invalidateQueries({ queryKey: activeQueuedMessagesQueryKey });
        }
        return;
      }
      const runId = message.runId;
      const mapped = mapSocketMessage(message as SocketMessage);
      const seen = seenMessageIdsRef.current.get(runId) ?? new Set<string>();
      if (seen.has(mapped.id)) return;
      seen.add(mapped.id);
      seenMessageIdsRef.current.set(runId, seen);

      if (!runIdsRef.current.has(runId)) {
        const buffered = pendingMessagesRef.current.get(runId) ?? [];
        const merged = mergeMessages(buffered, [mapped]);
        pendingMessagesRef.current.set(runId, merged);
        return;
      }

      setRunMessages((prev) => {
        const existing = prev[runId] ?? [];
        const merged = mergeMessages(existing, [mapped]);
        seenMessageIdsRef.current.set(runId, new Set(merged.map((m) => m.id)));
        if (areMessageListsEqual(existing, merged)) return prev;
        return { ...prev, [runId]: merged };
      });
      if (activeQueuedMessagesQueryKey) {
        void queryClient.invalidateQueries({ queryKey: activeQueuedMessagesQueryKey });
      }
    });
    return () => offMsg();
  }, [selectedThreadId, activeQueuedMessagesQueryKey, queryClient]);

  useEffect(() => {
    if (!selectedThreadId) return;
    const queryKey = ['agents', 'threads', selectedThreadId, 'runs'] as const;
    const offRun = graphSocket.onRunStatusChanged(({ threadId, run }) => {
      if (threadId !== selectedThreadId) return;
      const next = run as SocketRun;
      queryClient.setQueryData(queryKey, (prev: { items: RunMeta[] } | undefined) => {
        const items = prev?.items ?? [];
        const idx = items.findIndex((item) => item.id === next.id);
        const updated = [...items];
        if (idx >= 0) {
          const existing = updated[idx];
          if (existing.status === next.status && existing.updatedAt === next.updatedAt && existing.createdAt === next.createdAt) {
            return prev;
          }
          updated[idx] = { ...existing, status: next.status, createdAt: next.createdAt, updatedAt: next.updatedAt };
        } else {
          updated.push({ ...next, threadId: threadId ?? selectedThreadId } as RunMeta);
        }
        updated.sort(compareRunMeta);
        return { items: updated };
      });
      runIdsRef.current.add(next.id);
      if (!seenMessageIdsRef.current.has(next.id)) seenMessageIdsRef.current.set(next.id, new Set());
      flushPendingForRun(next.id);
      if (activeQueuedMessagesQueryKey) {
        void queryClient.invalidateQueries({ queryKey: activeQueuedMessagesQueryKey });
      }
    });
    const offReconnect = graphSocket.onReconnected(() => {
      queryClient.invalidateQueries({ queryKey });
      if (activeQueuedMessagesQueryKey) {
        void queryClient.invalidateQueries({ queryKey: activeQueuedMessagesQueryKey });
      }
    });
    return () => {
      offRun();
      offReconnect();
    };
  }, [selectedThreadId, queryClient, flushPendingForRun, activeQueuedMessagesQueryKey]);

  useEffect(() => {
    if (!selectedThreadId) return;
    const room = `thread:${selectedThreadId}`;
    graphSocket.subscribe([room]);
    return () => {
      graphSocket.unsubscribe([room]);
    };
  }, [selectedThreadId]);

  useEffect(() => {
    if (pendingRestoreFrameRef.current !== null) {
      window.cancelAnimationFrame(pendingRestoreFrameRef.current);
      pendingRestoreFrameRef.current = null;
    }

    if (!selectedThreadId || isDraftSelected) {
      if (detailPreloaderVisible) {
        setDetailPreloaderVisible(false);
      }
      return;
    }

    if (!initialMessagesLoaded) return;

    const hasPendingRestore = pendingScrollRestoreRef.current !== null;
    if (!detailPreloaderVisible && !hasPendingRestore) {
      return;
    }

    const desiredState = pendingScrollRestoreRef.current ?? {
      atBottom: true,
      dFromBottom: 0,
      lastScrollTop: 0,
      lastMeasured: Date.now(),
    } satisfies ScrollState;

    const token = scrollRestoreTokenRef.current;
    const activeThreadId = selectedThreadId;
    const totalFrames = detailPreloaderVisible ? SCROLL_RESTORE_ATTEMPTS : 1;
    let remaining = Math.max(totalFrames, 1);

    const applyFrame = () => {
      if (scrollRestoreTokenRef.current !== token || activeThreadId !== selectedThreadId) {
        pendingRestoreFrameRef.current = null;
        return;
      }

      const container = scrollContainerRef.current;
      if (container) {
        restoreScrollPosition(container, desiredState);
        latestScrollStateRef.current = computeScrollStateFromNode(container);
      }

      remaining -= 1;
      if (remaining > 0) {
        pendingRestoreFrameRef.current = window.requestAnimationFrame(applyFrame);
        return;
      }

      pendingScrollRestoreRef.current = null;
      updateCacheEntry(activeThreadId, { scroll: latestScrollStateRef.current });
      pendingRestoreFrameRef.current = null;

      if (detailPreloaderVisible) {
        setDetailPreloaderVisible(false);
      }
    };

    pendingRestoreFrameRef.current = window.requestAnimationFrame(applyFrame);

    return () => {
      if (pendingRestoreFrameRef.current !== null) {
        window.cancelAnimationFrame(pendingRestoreFrameRef.current);
        pendingRestoreFrameRef.current = null;
      }
    };
  }, [detailPreloaderVisible, initialMessagesLoaded, selectedThreadId, isDraftSelected, updateCacheEntry]);

  const updateThreadSummaryFromEvent = useCallback(
    ({ thread }: { thread: { id: string; alias: string; summary: string | null; status: 'open' | 'closed'; createdAt: string; parentId?: string | null } }) => {
      const node: ThreadNode = {
        id: thread.id,
        alias: thread.alias,
        summary: thread.summary,
        status: thread.status,
        parentId: thread.parentId ?? null,
        createdAt: thread.createdAt,
        metrics: defaultMetrics,
      };

      if (node.parentId) {
        setChildrenState((prev) => {
          const entry = prev[node.parentId!];
          if (!entry) {
            return {
              ...prev,
              [node.parentId!]: { nodes: [node], status: 'idle', error: null, hasChildren: true },
            };
          }
          const idx = entry.nodes.findIndex((existing) => existing.id === node.id);
          const nodes = [...entry.nodes];
          if (idx >= 0) nodes[idx] = { ...nodes[idx], summary: node.summary, status: node.status, createdAt: node.createdAt };
          else nodes.unshift(node);
          return {
            ...prev,
            [node.parentId!]: { ...entry, nodes, hasChildren: true },
          };
        });
      } else {
        queryClient.setQueryData(['agents', 'threads', 'roots', filterMode, { limit: threadLimit }] as const, (prev: { items: ThreadNode[] } | undefined) => {
          if (!prev) return prev;
          const items = prev.items ?? [];
          const idx = items.findIndex((existing) => existing.id === node.id);
          if (idx >= 0) {
            if (!matchesFilter(node.status ?? 'open', filterMode)) {
              const nextItems = items.filter((existing) => existing.id !== node.id);
              return { items: nextItems };
            }
            const nextItems = [...items];
            nextItems[idx] = { ...nextItems[idx], summary: node.summary, status: node.status, createdAt: node.createdAt };
            return { items: nextItems };
          }
          if (!matchesFilter(node.status ?? 'open', filterMode)) return prev;
          const nextItems = [node, ...items];
          nextItems.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
          return { items: nextItems.slice(0, threadLimit) };
        });
      }

      queryClient.setQueryData(['agents', 'threads', 'by-id', node.id] as const, (prev: ThreadNode | undefined) => {
        if (!prev) return prev;
        return { ...prev, summary: node.summary, status: node.status, createdAt: node.createdAt };
      });
    },
    [filterMode, threadLimit, queryClient],
  );

  const updateThreadActivity = useCallback(
    (threadId: string, activity: 'working' | 'waiting' | 'idle') => {
      const applyActivity = (node: ThreadNode): ThreadNode => ({
        ...node,
        metrics: { ...(node.metrics ?? defaultMetrics), activity },
      });

      queryClient.setQueryData(['agents', 'threads', 'roots', filterMode, { limit: threadLimit }] as const, (prev: { items: ThreadNode[] } | undefined) => {
        if (!prev) return prev;
        const items = prev.items ?? [];
        const idx = items.findIndex((existing) => existing.id === threadId);
        if (idx === -1) return prev;
        const nextItems = [...items];
        nextItems[idx] = applyActivity(nextItems[idx]);
        return { items: nextItems };
      });

      setChildrenState((prev) => {
        let mutated = false;
        const next: ThreadChildrenState = {};
        for (const [parentId, entry] of Object.entries(prev)) {
          const idx = entry.nodes.findIndex((node) => node.id === threadId);
          if (idx === -1) {
            next[parentId] = entry;
            continue;
          }
          const nodes = [...entry.nodes];
          nodes[idx] = applyActivity(nodes[idx]);
          next[parentId] = { ...entry, nodes };
          mutated = true;
        }
        return mutated ? next : prev;
      });

      queryClient.setQueryData(['agents', 'threads', 'by-id', threadId] as const, (prev: ThreadNode | undefined) => {
        if (!prev) return prev;
        return applyActivity(prev);
      });
    },
    [filterMode, threadLimit, queryClient],
  );

  const updateThreadRemindersCount = useCallback(
    (threadId: string, remindersCount: number) => {
      const applyCount = (node: ThreadNode): ThreadNode => ({
        ...node,
        metrics: { ...(node.metrics ?? defaultMetrics), remindersCount },
      });

      queryClient.setQueryData(['agents', 'threads', 'roots', filterMode, { limit: threadLimit }] as const, (prev: { items: ThreadNode[] } | undefined) => {
        if (!prev) return prev;
        const items = prev.items ?? [];
        const idx = items.findIndex((existing) => existing.id === threadId);
        if (idx === -1) return prev;
        const nextItems = [...items];
        nextItems[idx] = applyCount(nextItems[idx]);
        return { items: nextItems };
      });

      setChildrenState((prev) => {
        let mutated = false;
        const next: ThreadChildrenState = {};
        for (const [parentId, entry] of Object.entries(prev)) {
          const idx = entry.nodes.findIndex((node) => node.id === threadId);
          if (idx === -1) {
            next[parentId] = entry;
            continue;
          }
          const nodes = [...entry.nodes];
          nodes[idx] = applyCount(nodes[idx]);
          next[parentId] = { ...entry, nodes };
          mutated = true;
        }
        return mutated ? next : prev;
      });

      queryClient.setQueryData(['agents', 'threads', 'by-id', threadId] as const, (prev: ThreadNode | undefined) => {
        if (!prev) return prev;
        return applyCount(prev);
      });
    },
    [filterMode, threadLimit, queryClient],
  );

  useEffect(() => {
    graphSocket.subscribe(['threads']);
    const offCreated = graphSocket.onThreadCreated(updateThreadSummaryFromEvent);
    const offUpdated = graphSocket.onThreadUpdated(updateThreadSummaryFromEvent);
    const offActivity = graphSocket.onThreadActivityChanged(({ threadId, activity }) => updateThreadActivity(threadId, activity));
    const offReminders = graphSocket.onThreadRemindersCount(({ threadId, remindersCount }) => updateThreadRemindersCount(threadId, remindersCount));
    const offReconnect = graphSocket.onReconnected(() => {
      queryClient.invalidateQueries({ queryKey: ['agents', 'threads'] });
    });
    return () => {
      offCreated();
      offUpdated();
      offActivity();
      offReminders();
      offReconnect();
    };
  }, [updateThreadSummaryFromEvent, updateThreadActivity, updateThreadRemindersCount, queryClient]);

  useEffect(() => {
    if (!messagesError) return;
    notifyError(messagesError);
  }, [messagesError]);

  useEffect(() => {
    if (!selectedThreadId || isDraftSelected) return;
    if (detailPreloaderVisible) return;
    const container = scrollContainerRef.current;
    if (!container) return;
    const currentState = latestScrollStateRef.current;
    if (!currentState?.atBottom) return;
    window.requestAnimationFrame(() => {
      const node = scrollContainerRef.current;
      if (!node) return;
      node.scrollTop = node.scrollHeight;
      latestScrollStateRef.current = computeScrollStateFromNode(node);
      updateCacheEntry(selectedThreadId, { scroll: latestScrollStateRef.current });
    });
  }, [runMessages, selectedThreadId, isDraftSelected, detailPreloaderVisible, updateCacheEntry]);

  const remindersQuery = useThreadReminders(effectiveSelectedThreadId, Boolean(effectiveSelectedThreadId));
  const containersQuery = useThreadContainers(effectiveSelectedThreadId, Boolean(effectiveSelectedThreadId));

  const containerItems = useMemo(() => containersQuery.data?.items ?? [], [containersQuery.data]);
  const remindersForScreen = useMemo(
    () => (isDraftSelected ? [] : mapReminders(remindersQuery.data?.items ?? [])),
    [isDraftSelected, remindersQuery.data],
  );
  const conversationReminders = useMemo<ConversationReminderData[]>(
    () =>
      isDraftSelected
        ? []
        : (remindersQuery.data?.items ?? []).map((reminder) => ({
            id: reminder.id,
            content: sanitizeSummary(reminder.note),
            scheduledTime: formatReminderScheduledTime(reminder.at),
            date: formatReminderDate(reminder.at),
          })),
    [isDraftSelected, remindersQuery.data],
  );
  const containersForScreen = useMemo(
    () => (isDraftSelected ? [] : mapContainers(containerItems)),
    [isDraftSelected, containerItems],
  );
  const selectedContainer = useMemo(() => {
    if (!selectedContainerId || isDraftSelected) return null;
    return containerItems.find((item) => item.containerId === selectedContainerId) ?? null;
  }, [selectedContainerId, containerItems, isDraftSelected]);

  const runsForDisplay = useMemo<RunMeta[]>(() => {
    if (isDraftSelected) return [];
    if (runsQuery.isLoading && prefetchedRuns.length > 0) {
      return prefetchedRuns;
    }
    return runList;
  }, [isDraftSelected, runsQuery.isLoading, prefetchedRuns, runList]);

  useEffect(() => {
    if (!selectedContainerId) return;
    if (!selectedContainer) setSelectedContainerId(null);
  }, [selectedContainerId, selectedContainer]);

  const selectedThreadHasRunningRun = runsForDisplay.some((run) => run.status === 'running');
  const selectedThreadRemindersCount = remindersQuery.data?.items?.length ?? 0;
  const selectedThreadHasPendingReminder = selectedThreadRemindersCount > 0;

  const createThreadMutation = useMutation({
    mutationFn: async ({ draftId: _draftId, agentNodeId, text, parentId, alias }: { draftId: string; agentNodeId: string; text: string; parentId?: string; alias?: string }) => {
      return threads.create({ agentNodeId, text, parentId, alias });
    },
    onSuccess: ({ id }, { draftId }) => {
      setDrafts((prev) => prev.filter((draft) => draft.id !== draftId));
      setInputValue('');
      lastNonDraftIdRef.current = id;
      setSelectedThreadIdState(id);
      navigate(`/agents/threads/${encodeURIComponent(id)}`);
      void queryClient.invalidateQueries({ queryKey: ['agents', 'threads'] });
    },
    onError: (error: unknown) => {
      notifyError(resolveCreateThreadError(error));
    },
  });
  const { mutate: createThread, isPending: isCreateThreadPending } = createThreadMutation;

  const sendMessageMutation = useMutation({
    mutationFn: async ({ threadId, text }: { threadId: string; text: string }) => {
      await threads.sendMessage(threadId, text);
      return { threadId };
    },
    onSuccess: ({ threadId }) => {
      cancelDraftSave();
      clearDraft(threadId, userEmail);
      lastPersistedTextRef.current = '';
      latestInputValueRef.current = '';
      setInputValue('');
      void queryClient.invalidateQueries({ queryKey: ['agents', 'threads', threadId, 'queued'] });
    },
    onError: (error: unknown) => {
      notifyError(resolveSendMessageError(error));
    },
  });
  const { mutate: sendThreadMessage, isPending: isSendMessagePending } = sendMessageMutation;

  const cancelQueuedMessagesMutation = useMutation({
    mutationFn: async ({ threadId }: { threadId: string; queuedMessageId?: string }) => {
      return threads.clearQueuedMessages(threadId);
    },
    onMutate: async ({ threadId }) => {
      const queryKey = ['agents', 'threads', threadId, 'queued'] as const;
      await queryClient.cancelQueries({ queryKey });
      const previousQuery = queryClient.getQueryData<{ items: { id: string; text: string; enqueuedAt?: string }[] }>(queryKey);
      const previousState = queuedMessages.map((item) => ({ ...item }));
      setQueuedMessages([]);
      return { threadId, previousQuery, previousState };
    },
    onError: (error: unknown, { threadId }, context) => {
      if (context?.previousQuery) {
        queryClient.setQueryData(['agents', 'threads', threadId, 'queued'] as const, context.previousQuery);
      }
      if (context?.previousState) {
        setQueuedMessages(context.previousState);
      }
      const message = error instanceof Error && error.message ? error.message : 'Failed to clear queued messages.';
      notifyError(message);
    },
    onSuccess: (_result, { threadId }) => {
      void queryClient.invalidateQueries({ queryKey: ['agents', 'threads', threadId, 'queued'] });
    },
  });

  const cancelReminderMutation = useMutation({
    mutationFn: async ({ reminderId }: { reminderId: string; threadId: string }) => {
      return cancelReminderApi(reminderId);
    },
    onMutate: async ({ reminderId, threadId }) => {
      setCancellingReminderIds((prev) => {
        const next = new Set(prev);
        next.add(reminderId);
        return next;
      });

      const queryKey = ['agents', 'threads', threadId, 'reminders'] as const;
      await queryClient.cancelQueries({ queryKey });
      const previousData = queryClient.getQueryData<{ items: ThreadReminder[] }>(queryKey);
      const previousCount = previousData?.items?.length ?? 0;
      if (previousData) {
        const filteredItems = previousData.items.filter((item) => item.id !== reminderId);
        queryClient.setQueryData(queryKey, { items: filteredItems });
        updateThreadRemindersCount(threadId, filteredItems.length);
        return { threadId, reminderId, previousData, previousCount };
      }
      return { threadId, reminderId, previousData: undefined, previousCount };
    },
    onError: (error: unknown, { reminderId, threadId }, context) => {
      setCancellingReminderIds((prev) => {
        const next = new Set(prev);
        next.delete(reminderId);
        return next;
      });
      if (context?.previousData) {
        queryClient.setQueryData(['agents', 'threads', threadId, 'reminders'] as const, context.previousData);
        updateThreadRemindersCount(threadId, context.previousCount ?? 0);
      }
      const message = error instanceof Error && error.message ? error.message : 'Failed to cancel reminder.';
      notifyError(message);
    },
    onSuccess: (_result, { reminderId, threadId }, context) => {
      setCancellingReminderIds((prev) => {
        const next = new Set(prev);
        next.delete(reminderId);
        return next;
      });
      void queryClient.invalidateQueries({ queryKey: ['agents', 'threads', threadId, 'reminders'] });
      void queryClient.invalidateQueries({ queryKey: ['agents', 'threads', 'by-id', threadId] });
      void queryClient.invalidateQueries({ queryKey: ['agents', 'threads', threadId, 'metrics'] });
      if (context?.previousCount !== undefined) {
        const nextCount = Math.max(0, context.previousCount - 1);
        updateThreadRemindersCount(threadId, nextCount);
      }
    },
  });

  const isComposerPending = isSendMessagePending || isCreateThreadPending;

  const handleCancelQueuedMessage = useCallback(
    (queuedMessageId: string) => {
      if (!selectedThreadId || isDraftSelected) return;
      cancelQueuedMessagesMutation.mutate({ threadId: selectedThreadId, queuedMessageId });
    },
    [selectedThreadId, isDraftSelected, cancelQueuedMessagesMutation],
  );

  const handleCancelReminder = useCallback(
    (reminderId: string) => {
      if (!selectedThreadId || isDraftSelected) return;
      cancelReminderMutation.mutate({ threadId: selectedThreadId, reminderId });
    },
    [selectedThreadId, isDraftSelected, cancelReminderMutation],
  );

  const toggleThreadStatusMutation = useMutation({
    mutationFn: async ({ id, next }: { id: string; next: 'open' | 'closed' }) => {
      await threads.patchStatus(id, next);
      return { id, next };
    },
    onMutate: async ({ id, next }): Promise<ToggleThreadStatusContext> => {
      await queryClient.cancelQueries({ queryKey: ['agents', 'threads'] });

      const detailKey = ['agents', 'threads', 'by-id', id] as const;
      const previousDetail = queryClient.getQueryData<ThreadNode>(detailKey);
      const previousRoots = queryClient.getQueriesData<{ items: ThreadNode[] }>({ queryKey: ['agents', 'threads', 'roots'] });

      let fallbackDetail = previousDetail;
      if (!fallbackDetail) {
        for (const [, data] of previousRoots) {
          const match = data?.items.find((node) => node.id === id);
          if (match) {
            fallbackDetail = match;
            break;
          }
        }
      }

      const previousChildrenState = childrenState;
      const previousOptimisticStatus = optimisticStatus[id];

      setOptimisticStatus((prev) => {
        if (prev[id] === next) return prev;
        return { ...prev, [id]: next };
      });

      queryClient.setQueryData(detailKey, (prev: ThreadNode | undefined) => {
        if (prev) return { ...prev, status: next };
        return fallbackDetail ? { ...fallbackDetail, status: next } : prev;
      });

      queryClient.setQueriesData<{ items: ThreadNode[] }>({ queryKey: ['agents', 'threads', 'roots'] }, (prev) => {
        if (!prev) return prev;
        let changed = false;
        const items = prev.items.map((node) => {
          if (node.id !== id) return node;
          changed = true;
          return { ...node, status: next };
        });
        return changed ? { ...prev, items } : prev;
      });

      setChildrenState((prev) => updateThreadChildrenStatus(prev, id, next));

      return { previousDetail, previousRoots, previousChildrenState, previousOptimisticStatus };
    },
    onSuccess: async (_data, variables) => {
      const { id, next } = variables;
      setOptimisticStatus((prev) => {
        if (!(id in prev)) return prev;
        const { [id]: _removed, ...rest } = prev;
        return rest;
      });
      setChildrenState((prev) => updateThreadChildrenStatus(prev, id, next));
      queryClient.setQueryData(['agents', 'threads', 'by-id', id] as const, (prev: ThreadNode | undefined) =>
        prev ? { ...prev, status: next } : prev,
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['agents', 'threads'] }),
        queryClient.invalidateQueries({ queryKey: ['agents', 'threads', 'by-id', id] }),
      ]);
    },
    onError: (error: unknown, variables, ctx?: ToggleThreadStatusContext) => {
      if (ctx?.previousChildrenState) {
        setChildrenState(ctx.previousChildrenState);
      }
      if (ctx?.previousDetail !== undefined) {
        queryClient.setQueryData(['agents', 'threads', 'by-id', variables.id] as const, ctx.previousDetail);
      }
      if (ctx?.previousRoots) {
        for (const [key, data] of ctx.previousRoots) {
          queryClient.setQueryData(key, data);
        }
      }
      setOptimisticStatus((prev) => {
        if (ctx?.previousOptimisticStatus !== undefined) {
          if (prev[variables.id] === ctx.previousOptimisticStatus) return prev;
          return { ...prev, [variables.id]: ctx.previousOptimisticStatus };
        }
        if (!(variables.id in prev)) return prev;
        const { [variables.id]: _removed, ...rest } = prev;
        return rest;
      });
      const message = error instanceof Error ? error.message : 'Failed to update thread status.';
      notifyError(message);
    },
  });
  const { mutate: toggleThreadStatus, isPending: isToggleThreadStatusPending } = toggleThreadStatusMutation;

  const statusOverrides = useMemo<StatusOverrides>(() => {
    const overrides: StatusOverrides = {};
    for (const [id, status] of Object.entries(optimisticStatus)) {
      overrides[id] = { ...(overrides[id] ?? {}), status };
    }
    if (selectedThreadId && !isDraftThreadId(selectedThreadId)) {
      overrides[selectedThreadId] = {
        ...(overrides[selectedThreadId] ?? {}),
        hasRunningRun: selectedThreadHasRunningRun,
        hasPendingReminder: selectedThreadHasPendingReminder,
      };
    }
    return overrides;
  }, [optimisticStatus, selectedThreadId, selectedThreadHasRunningRun, selectedThreadHasPendingReminder]);

  const draftThreads = useMemo<Thread[]>(() => drafts.map((draft) => mapDraftToThread(draft)), [drafts]);

  const threadsForList = useMemo<Thread[]>(() => {
    const mappedRoots = rootNodes.map((node) => buildThreadTree(node, childrenState, statusOverrides));
    return [...draftThreads, ...mappedRoots];
  }, [rootNodes, childrenState, statusOverrides, draftThreads]);

  const handleViewRun = useCallback(
    (runId: string) => {
      if (!selectedThreadId || isDraftThreadId(selectedThreadId)) return;
      navigate(
        `/agents/threads/${encodeURIComponent(selectedThreadId)}/runs/${encodeURIComponent(runId)}/timeline`,
      );
    },
    [navigate, selectedThreadId],
  );

  const handleConversationScroll = useCallback(
    (event: UIEvent<HTMLDivElement>) => {
      const container = event.currentTarget;
      const nextState = computeScrollStateFromNode(container);
      latestScrollStateRef.current = nextState;
      if (!selectedThreadId || isDraftThreadId(selectedThreadId)) return;
      if (scrollPersistTimerRef.current !== null) {
        window.clearTimeout(scrollPersistTimerRef.current);
      }
      scrollPersistTimerRef.current = window.setTimeout(() => {
        updateCacheEntry(selectedThreadId, { scroll: nextState });
        scrollPersistTimerRef.current = null;
      }, SCROLL_PERSIST_DEBOUNCE_MS);
    },
    [selectedThreadId, updateCacheEntry],
  );

  const conversationRuns = useMemo<ConversationRun[]>(() => {
    if (isDraftSelected) return [];
    return runsForDisplay.map((run) => {
      const timelineHref = selectedThreadId
        ? `/agents/threads/${encodeURIComponent(selectedThreadId)}/runs/${encodeURIComponent(run.id)}/timeline`
        : undefined;
      return {
        id: run.id,
        status: mapRunStatus(run.status),
        duration: computeRunDuration(run),
        messages: (runMessages[run.id] ?? []) as ConversationMessage[],
        timelineHref,
        onViewRun: selectedThreadId ? handleViewRun : undefined,
      };
    });
  }, [isDraftSelected, runsForDisplay, runMessages, selectedThreadId, handleViewRun]);

  const selectedThreadNode = useMemo(() => {
    if (!selectedThreadId || isDraftThreadId(selectedThreadId)) return undefined;
    return findThreadNode(rootNodes, childrenState, selectedThreadId) ?? threadDetailQuery.data;
  }, [selectedThreadId, rootNodes, childrenState, threadDetailQuery.data]);

  useEffect(() => {
    if (!selectedThreadId || isDraftThreadId(selectedThreadId)) return;
    const entry = childrenState[selectedThreadId];
    if (!entry) {
      loadThreadChildren(selectedThreadId).catch(() => {});
      return;
    }
    if (entry.status === 'loading') return;
    if (entry.status === 'success') {
      if (entry.hasChildren !== false && entry.nodes.length === 0) {
        loadThreadChildren(selectedThreadId).catch(() => {});
      }
      return;
    }
    if (entry.status === 'error') return;
    loadThreadChildren(selectedThreadId).catch(() => {});
  }, [selectedThreadId, childrenState, loadThreadChildren]);

  useEffect(() => {
    const parentId = threadDetailQuery.data?.parentId;
    if (!parentId) return;
    const entry = childrenState[parentId];
    if (!entry || entry.status === 'idle') {
      loadThreadChildren(parentId).catch(() => {});
      return;
    }
    if (entry.status === 'loading' || entry.status === 'error') return;
    if (entry.status === 'success' && entry.hasChildren !== false && entry.nodes.length === 0) {
      loadThreadChildren(parentId).catch(() => {});
    }
  }, [threadDetailQuery.data?.parentId, childrenState, loadThreadChildren]);

  const activeDraft = useMemo(() => {
    if (!isDraftSelected || !selectedThreadId) return undefined;
    return drafts.find((draft) => draft.id === selectedThreadId);
  }, [isDraftSelected, selectedThreadId, drafts]);

  const selectedThreadForScreen = useMemo(() => {
    if (activeDraft) {
      return mapDraftToThread(activeDraft);
    }
    if (!selectedThreadNode) return undefined;
    return buildThreadTree(selectedThreadNode, childrenState, statusOverrides);
  }, [activeDraft, selectedThreadNode, childrenState, statusOverrides]);

  const threadsHasMore = (threadsQuery.data?.items?.length ?? 0) >= threadLimit && threadLimit < MAX_THREAD_LIMIT;
  const threadsIsLoading = threadsQuery.isFetching;
  const isThreadsEmpty = !threadsQuery.isLoading && threadsForList.length === 0;

  const handleOpenContainerTerminal = useCallback(
    (containerId: string) => {
      if (!containerItems.some((item) => item.containerId === containerId)) return;
      setSelectedContainerId(containerId);
    },
    [containerItems],
  );

  const handleCloseContainerTerminal = useCallback(() => {
    setSelectedContainerId(null);
  }, []);

  const handleSelectThread = useCallback(
    (threadId: string) => {
      if (isDraftThreadId(threadId)) {
        setSelectedThreadIdState(threadId);
        const draft = draftsRef.current.find((item) => item.id === threadId);
        setInputValue(draft?.inputValue ?? '');
        if (params.threadId) {
          navigate('/agents/threads');
        }
        return;
      }

      setSelectedThreadIdState(threadId);
      setInputValue('');
      lastNonDraftIdRef.current = threadId;
      navigate(`/agents/threads/${encodeURIComponent(threadId)}`);
    },
    [navigate, params.threadId],
  );

  const handleFilterChange = useCallback(
    (mode: 'all' | 'open' | 'closed') => {
      const nextMode = mode as FilterMode;
      if (nextMode === filterMode) return;
      setFilterMode(nextMode);
      setThreadLimit(INITIAL_THREAD_LIMIT);
      setChildrenState({});
    },
    [filterMode],
  );

  const handleThreadsLoadMore = useCallback(() => {
    setThreadLimit((prev) => (prev >= MAX_THREAD_LIMIT ? prev : Math.min(MAX_THREAD_LIMIT, prev + THREAD_LIMIT_STEP)));
  }, []);

  const handleToggleThreadStatus = useCallback(
    (threadId: string, next: 'open' | 'closed') => {
      if (isDraftThreadId(threadId)) return;
      toggleThreadStatus({ id: threadId, next });
    },
    [toggleThreadStatus],
  );

  const handleThreadExpand = useCallback(
    (threadId: string, isExpanded: boolean) => {
      if (isDraftThreadId(threadId)) return;
      if (!isExpanded) return;
      const entry = childrenState[threadId];
      if (entry?.status === 'loading') return;
      if (entry?.status === 'success') {
        if (entry.hasChildren !== false && entry.nodes.length === 0) {
          loadThreadChildren(threadId).catch(() => {});
        }
        return;
      }
      if (entry && entry.hasChildren === false && entry.nodes.length === 0) {
        return;
      }
      loadThreadChildren(threadId).catch(() => {});
    },
    [childrenState, loadThreadChildren],
  );

  const handleCreateDraft = useCallback(() => {
    const existingWithContent = draftsRef.current.find((draft) => draft.inputValue.trim().length > 0 || draft.agentNodeId);
    if (existingWithContent) {
      setSelectedThreadIdState(existingWithContent.id);
      setInputValue(existingWithContent.inputValue);
      if (params.threadId) {
        navigate('/agents/threads');
      }
      return;
    }

    const draftId = createDraftId();
    const newDraft: ThreadDraft = {
      id: draftId,
      inputValue: '',
      createdAt: new Date().toLocaleString(),
    };

    setDrafts((prev) => [newDraft, ...prev]);
    setSelectedThreadIdState(draftId);
    setInputValue('');
    if (params.threadId) {
      navigate('/agents/threads');
    }
  }, [navigate, params.threadId]);

  const handleInputValueChange = useCallback(
    (value: string) => {
      setInputValue(value);
      if (selectedThreadId && !isDraftThreadId(selectedThreadId)) {
        const trimmed = value.trim();
        if (trimmed.length === 0) {
          cancelDraftSave();
          persistDraftNow(selectedThreadId, value);
        } else {
          scheduleDraftPersist(selectedThreadId, value);
        }
        return;
      }
      setDrafts((prev) => {
        if (!selectedThreadId || !isDraftThreadId(selectedThreadId)) return prev;
        let mutated = false;
        const next = prev.map((draft) => {
          if (draft.id !== selectedThreadId) return draft;
          if (draft.inputValue === value) return draft;
          mutated = true;
          return { ...draft, inputValue: value };
        });
        return mutated ? next : prev;
      });
    },
    [selectedThreadId, scheduleDraftPersist, cancelDraftSave, persistDraftNow],
  );

  const handleDraftRecipientChange = useCallback(
    (agentId: string | null, agentName: string | null) => {
      if (!selectedThreadId || !isDraftThreadId(selectedThreadId)) return;
      setDrafts((prev) => {
        let mutated = false;
        const next = prev.map((draft) => {
          if (draft.id !== selectedThreadId) return draft;
          if (!agentId) {
            if (!draft.agentNodeId && !draft.agentName) return draft;
            mutated = true;
            return { ...draft, agentNodeId: undefined, agentName: undefined };
          }
          const nextName = agentName ?? agentOptions.find((item) => item.id === agentId)?.name ?? agentId;
          if (draft.agentNodeId === agentId && draft.agentName === nextName) return draft;
          mutated = true;
          return { ...draft, agentNodeId: agentId, agentName: nextName };
        });
        return mutated ? next : prev;
      });
    },
    [selectedThreadId, agentOptions],
  );

  const handleDraftCancel = useCallback(() => {
    if (!selectedThreadId || !isDraftThreadId(selectedThreadId)) return;
    setDrafts((prev) => prev.filter((draft) => draft.id !== selectedThreadId));
    setInputValue('');

    const fallbackId = lastNonDraftIdRef.current;
    const hasFallback = fallbackId
      ? Boolean(findThreadNode(rootNodes, childrenState, fallbackId) || rootNodes.some((node) => node.id === fallbackId))
      : false;

    if (fallbackId && hasFallback) {
      setSelectedThreadIdState(fallbackId);
      navigate(`/agents/threads/${encodeURIComponent(fallbackId)}`);
      return;
    }

    setSelectedThreadIdState(null);
    navigate('/agents/threads');
  }, [selectedThreadId, rootNodes, childrenState, navigate]);

  const handleSendMessage = useCallback(
    (value: string, context: { threadId: string | null }) => {
      const threadId = context.threadId;
      if (!threadId) return;

      if (isDraftThreadId(threadId)) {
        if (isCreateThreadPending) return;
        const draft = draftsRef.current.find((item) => item.id === threadId);
        if (!draft) return;
        const agentNodeId = typeof draft.agentNodeId === 'string' ? draft.agentNodeId.trim() : '';
        if (!agentNodeId) {
          notifyError('Select an agent before sending.');
          return;
        }
        const trimmed = value.trim();
        if (trimmed.length === 0) {
          notifyError('Enter a message before sending.');
          return;
        }
        if (trimmed.length > THREAD_MESSAGE_MAX_LENGTH) {
          notifyError('Messages are limited to 8000 characters.');
          return;
        }
        createThread({ draftId: draft.id, agentNodeId, text: trimmed });
        return;
      }

      if (isSendMessagePending || isCreateThreadPending) return;
      const trimmed = value.trim();
      if (trimmed.length === 0) {
        notifyError('Enter a message before sending.');
        return;
      }
      if (trimmed.length > THREAD_MESSAGE_MAX_LENGTH) {
        notifyError('Messages are limited to 8000 characters.');
        return;
      }
      cancelDraftSave();
      persistDraftNow(threadId, value);
      sendThreadMessage({ threadId, text: trimmed });
    },
    [cancelDraftSave, createThread, isCreateThreadPending, isSendMessagePending, persistDraftNow, sendThreadMessage],
  );

  const handleToggleRunsInfoCollapsed = useCallback((collapsed: boolean) => {
    setRunsInfoCollapsed(collapsed);
  }, []);

  const listErrorMessage = threadsQuery.error instanceof Error ? threadsQuery.error.message : threadsQuery.error ? 'Unable to load threads.' : null;
  const detailError: ApiError | null = threadDetailQuery.isError ? (threadDetailQuery.error as ApiError) : null;
  const threadNotFound = Boolean(detailError?.response?.status === 404);
  const detailErrorMessage = detailError
    ? threadNotFound
      ? 'Thread not found. The link might be invalid or the thread was removed.'
      : detailError.message ?? 'Unable to load thread.'
    : null;

  useEffect(() => {
    if (!detailPreloaderVisible) return;
    if (detailError || runsQuery.isError) {
      setDetailPreloaderVisible(false);
    }
  }, [detailPreloaderVisible, detailError, runsQuery.isError]);

  const listErrorNode = listErrorMessage ? <span>{listErrorMessage}</span> : undefined;
  const detailErrorNode = detailErrorMessage ? <div className="text-sm text-[var(--agyn-red)]">{detailErrorMessage}</div> : undefined;

  return (
    <div className="absolute inset-0 flex min-h-0 min-w-0 flex-col overflow-hidden">
      <div className="flex min-h-0 flex-1 flex-col">
        <ThreadsScreen
          threads={threadsForList}
          runs={conversationRuns}
          containers={containersForScreen}
          reminders={remindersForScreen}
          conversationQueuedMessages={queuedMessages}
          conversationReminders={conversationReminders}
          filterMode={filterMode}
          selectedThreadId={selectedThreadId ?? null}
          inputValue={inputValue}
          isRunsInfoCollapsed={isRunsInfoCollapsed}
          threadsHasMore={threadsHasMore}
          threadsIsLoading={threadsIsLoading}
          isLoading={detailPreloaderVisible}
          isEmpty={isThreadsEmpty}
          listError={listErrorNode}
          detailError={detailErrorNode}
          conversationScrollRef={scrollContainerRef}
          onConversationScroll={handleConversationScroll}
          onFilterModeChange={handleFilterChange}
          onSelectThread={handleSelectThread}
          onToggleRunsInfoCollapsed={handleToggleRunsInfoCollapsed}
          onInputValueChange={handleInputValueChange}
          onSendMessage={handleSendMessage}
          isSendMessagePending={isComposerPending}
          onThreadsLoadMore={threadsHasMore ? handleThreadsLoadMore : undefined}
          onThreadExpand={handleThreadExpand}
          onToggleThreadStatus={handleToggleThreadStatus}
          isToggleThreadStatusPending={isToggleThreadStatusPending}
          selectedThread={selectedThreadForScreen}
          onCreateDraft={handleCreateDraft}
          onOpenContainerTerminal={handleOpenContainerTerminal}
          draftMode={isDraftSelected}
          draftRecipientId={activeDraft?.agentNodeId ?? null}
          draftRecipientLabel={activeDraft?.agentName ?? null}
          draftFetchOptions={draftFetchOptions}
          onDraftRecipientChange={handleDraftRecipientChange}
          onDraftCancel={handleDraftCancel}
          onCancelQueuedMessage={handleCancelQueuedMessage}
          onCancelReminder={handleCancelReminder}
          isCancelQueuedMessagesPending={cancelQueuedMessagesMutation.isPending}
          cancellingReminderIds={cancellingReminderIds}
        />
      </div>
      <ContainerTerminalDialog
        container={selectedContainer}
        open={Boolean(selectedContainer)}
        onClose={handleCloseContainerTerminal}
      />
    </div>
  );
}
