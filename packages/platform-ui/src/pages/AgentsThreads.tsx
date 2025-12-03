import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { QueryKey } from '@tanstack/react-query';
import ThreadsScreen from '@/components/screens/ThreadsScreen';
import type { Thread } from '@/components/ThreadItem';
import type { ConversationMessage, Run as ConversationRun } from '@/components/Conversation';
import type { AutocompleteOption } from '@/components/AutocompleteInput';
import { formatDuration } from '@/components/agents/runTimelineFormatting';
import { notifyError } from '@/lib/notify';
import { graphSocket } from '@/lib/graph/socket';
import { threads } from '@/api/modules/threads';
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
import { AGENT_TITLE_FALLBACK, computeAgentDefaultTitle, normalizeAgentName, normalizeAgentRole } from '@/utils/agentDisplay';

const INITIAL_THREAD_LIMIT = 50;
const THREAD_LIMIT_STEP = 50;
const MAX_THREAD_LIMIT = 500;

const defaultMetrics: ThreadMetrics = { remindersCount: 0, containersCount: 0, activity: 'idle', runsCount: 0 };
const THREAD_PRELOAD_CONCURRENCY = 4;

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

type ThreadDraft = {
  id: string;
  agentNodeId?: string;
  agentTitle?: string;
  inputValue: string;
  createdAt: string;
};

type AgentOption = { id: string; title: string };

const DRAFT_SUMMARY_LABEL = '(new conversation)';
const DRAFT_RECIPIENT_PLACEHOLDER = '(no recipient)';

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
    agentName: draft.agentTitle ?? DRAFT_RECIPIENT_PLACEHOLDER,
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

function sanitizeSummary(summary: string | null | undefined): string {
  const trimmed = summary?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : '(no summary yet)';
}

function resolveThreadAgentTitle(node: ThreadNode): string {
  const explicit = normalizeAgentName(node.agentTitle);
  if (explicit) return explicit;
  return computeAgentDefaultTitle(node.agentName, node.agentRole, AGENT_TITLE_FALLBACK);
}

function resolveThreadAgentName(node: ThreadNode): string {
  const explicit = normalizeAgentName(node.agentName);
  if (explicit) return explicit;
  return resolveThreadAgentTitle(node);
}

function resolveThreadAgentRole(node: ThreadNode): string | undefined {
  return normalizeAgentRole(node.agentRole);
}

function containerDisplayName(container: ContainerItem): string {
  return container.name;
}

const THREAD_MESSAGE_MAX_LENGTH = 8000;

const sendMessageErrorMap: Record<string, string> = {
  bad_message_payload: 'Please enter a message up to 8000 characters.',
  thread_not_found: 'Thread not found. It may have been removed.',
  thread_closed: 'This thread is closed. Reopen it to send messages.',
  agent_unavailable: 'Agent is not currently available for this thread.',
  agent_unready: 'Agent is starting up. Try again shortly.',
  send_failed: 'Failed to send the message. Please retry.',
};

function resolveSendMessageError(error: unknown): string {
  if (error && typeof error === 'object') {
    const apiError = error as ApiError;
    const payload = apiError.response?.data as { error?: unknown; message?: unknown } | undefined;
    if (payload && typeof payload === 'object') {
      const code = typeof payload.error === 'string' ? payload.error : undefined;
      if (code && sendMessageErrorMap[code]) {
        return sendMessageErrorMap[code];
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
  return 'Failed to send the message.';
}

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
    agentTitle: resolveThreadAgentTitle(node),
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

  const [filterMode, setFilterMode] = useState<FilterMode>('open');
  const [threadLimit, setThreadLimit] = useState<number>(INITIAL_THREAD_LIMIT);
  const [childrenState, setChildrenState] = useState<ThreadChildrenState>({});
  const [optimisticStatus, setOptimisticStatus] = useState<Record<string, 'open' | 'closed'>>({});
  const [inputValue, setInputValue] = useState('');
  const [drafts, setDrafts] = useState<ThreadDraft[]>([]);
  const [selectedThreadIdState, setSelectedThreadIdState] = useState<string | null>(params.threadId ?? null);
  const [runMessages, setRunMessages] = useState<Record<string, ConversationMessageWithMeta[]>>({});
  const [messagesError, setMessagesError] = useState<string | null>(null);
  const [isRunsInfoCollapsed, setRunsInfoCollapsed] = useState(false);
  const [selectedContainerId, setSelectedContainerId] = useState<string | null>(null);

  const pendingMessagesRef = useRef<Map<string, ConversationMessageWithMeta[]>>(new Map());
  const seenMessageIdsRef = useRef<Map<string, Set<string>>>(new Map());
  const runIdsRef = useRef<Set<string>>(new Set());
  const draftsRef = useRef<ThreadDraft[]>([]);
  const lastSelectedIdRef = useRef<string | null>(null);
  const lastNonDraftIdRef = useRef<string | null>(null);

  const selectedThreadId = params.threadId ?? selectedThreadIdState;
  const isDraftSelected = isDraftThreadId(selectedThreadId);

  useEffect(() => {
    if (params.threadId) {
      setSelectedThreadIdState(params.threadId);
    }
  }, [params.threadId]);

  useEffect(() => {
    draftsRef.current = drafts;
  }, [drafts]);

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

  const loadThreadChildren = useCallback(
    async (threadId: string) => {
      setChildrenState((prev) => {
        const entry = prev[threadId];
        if (entry?.status === 'loading') return prev;
        if (entry?.hasChildren === false && entry.nodes.length === 0) return prev;
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
      const configTitleCandidate = typeof config?.title === 'string' ? config.title.trim() : '';
      const optionTitle = configTitleCandidate || template.title || node.template;
      seen.add(node.id);
      result.push({ id: node.id, title: optionTitle });
    }

    result.sort((a, b) => a.title.localeCompare(b.title));
    return result;
  }, [fullGraphQuery.data, graphTemplatesQuery.data]);

  const draftFetchOptions = useCallback(
    async (query: string): Promise<AutocompleteOption[]> => {
      const normalized = query.trim().toLowerCase();
      return agentOptions
        .filter((option) => normalized.length === 0 || option.title.toLowerCase().includes(normalized))
        .map((option) => ({ value: option.id, label: option.title }));
    },
    [agentOptions],
  );

  const limitKey = useMemo(() => ({ limit: threadLimit }), [threadLimit]);
  const threadsQueryKey = useMemo(() => ['agents', 'threads', 'roots', filterMode, limitKey] as const, [filterMode, limitKey]);

  const threadsQuery = useQuery<{ items: ThreadNode[] }, Error>({
    queryKey: threadsQueryKey,
    queryFn: () => threads.roots(filterMode, threadLimit),
    placeholderData: (previousData) => previousData,
  });

  const rootNodes = useMemo<ThreadNode[]>(() => {
    const data = threadsQuery.data?.items ?? [];
    const dedup = new Map<string, ThreadNode>();
    for (const item of data) dedup.set(item.id, item);
    const nodes = Array.from(dedup.values());
    nodes.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    return nodes;
  }, [threadsQuery.data]);

  useEffect(() => {
    if (rootNodes.length === 0) return;

    const inFlight = rootNodes.reduce((count, node) => {
      return childrenState[node.id]?.status === 'loading' ? count + 1 : count;
    }, 0);

    if (inFlight >= THREAD_PRELOAD_CONCURRENCY) return;

    const queue = rootNodes
      .map((node) => node.id)
      .filter((threadId) => {
        const entry = childrenState[threadId];
        if (!entry) return true;
        if (entry.status === 'idle') {
          if (entry.hasChildren === false) return false;
          return entry.nodes.length === 0;
        }
        return false;
      });

    if (queue.length === 0) return;

    const availableSlots = Math.max(THREAD_PRELOAD_CONCURRENCY - inFlight, 0);
    if (availableSlots === 0) return;

    const toLoad = queue.slice(0, availableSlots);
    toLoad.forEach((threadId) => {
      loadThreadChildren(threadId).catch(() => {});
    });
  }, [rootNodes, childrenState, loadThreadChildren]);

  const effectiveSelectedThreadId = isDraftSelected ? undefined : selectedThreadId ?? undefined;

  const threadDetailQuery = useThreadById(effectiveSelectedThreadId);
  const runsQuery = useThreadRuns(effectiveSelectedThreadId);

  const runList = useMemo<RunMeta[]>(() => {
    const items = runsQuery.data?.items ?? [];
    const sorted = [...items];
    sorted.sort(compareRunMeta);
    return sorted;
  }, [runsQuery.data]);

  useEffect(() => {
    setRunMessages({});
    setMessagesError(null);
    pendingMessagesRef.current.clear();
    seenMessageIdsRef.current.clear();
    runIdsRef.current = new Set();
  }, [selectedThreadId]);

  useEffect(() => {
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
  }, [runList]);

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
    if (!selectedThreadId || runList.length === 0) return;
    let cancelled = false;
    const concurrency = 3;
    let index = 0;
    let inflight = 0;

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
      }
    });

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
  }, [selectedThreadId, runList]);

  useEffect(() => {
    for (const run of runList) {
      flushPendingForRun(run.id);
    }
  }, [runList, flushPendingForRun]);

  useEffect(() => {
    if (!selectedThreadId) return;
    const offMsg = graphSocket.onMessageCreated(({ threadId, message }) => {
      if (threadId !== selectedThreadId || !message.runId) return;
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
    });
    return () => offMsg();
  }, [selectedThreadId]);

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
    });
    const offReconnect = graphSocket.onReconnected(() => {
      queryClient.invalidateQueries({ queryKey });
    });
    return () => {
      offRun();
      offReconnect();
    };
  }, [selectedThreadId, queryClient, flushPendingForRun]);

  useEffect(() => {
    if (!selectedThreadId) return;
    const room = `thread:${selectedThreadId}`;
    graphSocket.subscribe([room]);
    return () => {
      graphSocket.unsubscribe([room]);
    };
  }, [selectedThreadId]);

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
        agentTitle: undefined,
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

  const remindersQuery = useThreadReminders(effectiveSelectedThreadId, Boolean(effectiveSelectedThreadId));
  const containersQuery = useThreadContainers(effectiveSelectedThreadId, Boolean(effectiveSelectedThreadId));

  const containerItems = useMemo(() => containersQuery.data?.items ?? [], [containersQuery.data]);
  const remindersForScreen = useMemo(
    () => (isDraftSelected ? [] : mapReminders(remindersQuery.data?.items ?? [])),
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

  useEffect(() => {
    if (!selectedContainerId) return;
    if (!selectedContainer) setSelectedContainerId(null);
  }, [selectedContainerId, selectedContainer]);

  const selectedThreadHasRunningRun = runList.some((run) => run.status === 'running');
  const selectedThreadRemindersCount = remindersQuery.data?.items?.length ?? 0;
  const selectedThreadHasPendingReminder = selectedThreadRemindersCount > 0;

  const sendMessageMutation = useMutation({
    mutationFn: async ({ threadId, text }: { threadId: string; text: string }) => {
      await threads.sendMessage(threadId, text);
      return { threadId };
    },
    onSuccess: () => {
      setInputValue('');
    },
    onError: (error: unknown) => {
      notifyError(resolveSendMessageError(error));
    },
  });
  const { mutate: sendThreadMessage, isPending: isSendMessagePending } = sendMessageMutation;

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

  const conversationRuns = useMemo<ConversationRun[]>(() => {
    if (isDraftSelected) return [];
    return runList.map((run) => {
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
  }, [isDraftSelected, runList, runMessages, selectedThreadId, handleViewRun]);

  const selectedThreadNode = useMemo(() => {
    if (!selectedThreadId || isDraftThreadId(selectedThreadId)) return undefined;
    return findThreadNode(rootNodes, childrenState, selectedThreadId) ?? threadDetailQuery.data;
  }, [selectedThreadId, rootNodes, childrenState, threadDetailQuery.data]);

  useEffect(() => {
    if (!selectedThreadId || isDraftThreadId(selectedThreadId)) return;
    const entry = childrenState[selectedThreadId];
    if (entry?.status === 'loading' || entry?.status === 'success' || entry?.status === 'error') return;
    loadThreadChildren(selectedThreadId).catch(() => {});
  }, [selectedThreadId, childrenState, loadThreadChildren]);

  useEffect(() => {
    const parentId = threadDetailQuery.data?.parentId;
    if (!parentId) return;
    const entry = childrenState[parentId];
    if (entry && entry.status !== 'idle') return;
    loadThreadChildren(parentId).catch(() => {});
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
  const detailIsLoading = runsQuery.isLoading || threadDetailQuery.isLoading;

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
      if (entry?.status === 'success' && entry.nodes.length > 0) return;
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
    [selectedThreadId],
  );

  const handleDraftRecipientChange = useCallback(
    (agentId: string | null, agentTitle: string | null) => {
      if (!selectedThreadId || !isDraftThreadId(selectedThreadId)) return;
      setDrafts((prev) => {
        let mutated = false;
        const next = prev.map((draft) => {
          if (draft.id !== selectedThreadId) return draft;
          if (!agentId) {
            if (!draft.agentNodeId && !draft.agentTitle) return draft;
            mutated = true;
            return { ...draft, agentNodeId: undefined, agentTitle: undefined };
          }
          const nextTitle = agentTitle ?? agentOptions.find((item) => item.id === agentId)?.title ?? agentId;
          if (draft.agentNodeId === agentId && draft.agentTitle === nextTitle) return draft;
          mutated = true;
          return { ...draft, agentNodeId: agentId, agentTitle: nextTitle };
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
      if (!context.threadId) return;
      if (isDraftThreadId(context.threadId)) return;
      if (isSendMessagePending) return;
      const trimmed = value.trim();
      if (trimmed.length === 0) {
        notifyError('Enter a message before sending.');
        return;
      }
      if (trimmed.length > THREAD_MESSAGE_MAX_LENGTH) {
        notifyError('Messages are limited to 8000 characters.');
        return;
      }
      sendThreadMessage({ threadId: context.threadId, text: trimmed });
    },
    [isSendMessagePending, sendThreadMessage],
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
          filterMode={filterMode}
          selectedThreadId={selectedThreadId ?? null}
          inputValue={inputValue}
          isRunsInfoCollapsed={isRunsInfoCollapsed}
          threadsHasMore={threadsHasMore}
          threadsIsLoading={threadsIsLoading}
          isLoading={detailIsLoading}
          isEmpty={isThreadsEmpty}
          listError={listErrorNode}
          detailError={detailErrorNode}
          onFilterModeChange={handleFilterChange}
          onSelectThread={handleSelectThread}
          onToggleRunsInfoCollapsed={handleToggleRunsInfoCollapsed}
          onInputValueChange={handleInputValueChange}
          onSendMessage={handleSendMessage}
          isSendMessagePending={isSendMessagePending}
          onThreadsLoadMore={threadsHasMore ? handleThreadsLoadMore : undefined}
          onThreadExpand={handleThreadExpand}
          onToggleThreadStatus={handleToggleThreadStatus}
          isToggleThreadStatusPending={isToggleThreadStatusPending}
          selectedThread={selectedThreadForScreen}
          onCreateDraft={handleCreateDraft}
          onOpenContainerTerminal={handleOpenContainerTerminal}
          draftMode={isDraftSelected}
          draftRecipientId={activeDraft?.agentNodeId ?? null}
          draftRecipientLabel={activeDraft?.agentTitle ?? null}
          draftFetchOptions={draftFetchOptions}
          onDraftRecipientChange={handleDraftRecipientChange}
          onDraftCancel={handleDraftCancel}
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
