import { useEffect, useRef, useState } from 'react';
import { action } from 'storybook/actions';
import type { Meta, StoryObj } from '@storybook/react';
import { useArgs } from 'storybook/preview-api';
import ThreadsScreen from '../src/components/screens/ThreadsScreen';
import type { Thread } from '../src/components/ThreadItem';
import type { Run } from '../src/components/Conversation';
import type { AutocompleteOption } from '../src/components/AutocompleteInput';
import { withMainLayout } from './decorators/withMainLayout';

type ThreadsScreenProps = React.ComponentProps<typeof ThreadsScreen>;

const meta: Meta<typeof ThreadsScreen> = {
  title: 'Screens/Threads',
  component: ThreadsScreen,
  decorators: [withMainLayout],
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['!autodocs'],
};

export default meta;

type Story = StoryObj<typeof ThreadsScreen>;

const storyNow = new Date('2024-06-01T12:00:00Z');
const isoHoursAgo = (hours: number) => new Date(storyNow.getTime() - hours * 60 * 60 * 1000).toISOString();
const isoDaysAgo = (days: number) => new Date(storyNow.getTime() - days * 24 * 60 * 60 * 1000).toISOString();

const threads: Thread[] = [
  {
    id: '1',
    summary: 'Implement user authentication flow with OAuth 2.0',
    agentName: 'Auth Agent',
    createdAt: isoHoursAgo(2),
    status: 'running',
    isOpen: true,
  },
  {
    id: '2',
    summary: 'Refactor database queries for better performance',
    agentName: 'DB Agent',
    createdAt: isoHoursAgo(5),
    status: 'finished',
    isOpen: true,
    subthreads: [
      {
        id: '2-1',
        summary: 'Optimize index usage in user queries',
        agentName: 'Optimizer',
        createdAt: isoHoursAgo(4),
        status: 'finished',
        isOpen: true,
      },
    ],
  },
  {
    id: '3',
    summary: 'Design new landing page components',
    agentName: 'Design Agent',
    createdAt: isoDaysAgo(1),
    status: 'pending',
    isOpen: false,
  },
];

const MANY_THREADS_PAGE_SIZE = 8;

const manyThreads: Thread[] = Array.from({ length: 24 }, (_, index) => {
  const idx = index + 1;
  const hoursAgo = idx * 3;
  const statusCycle = idx % 4;
  const status: Thread['status'] = statusCycle === 0 ? 'running' : statusCycle === 1 ? 'pending' : statusCycle === 2 ? 'finished' : 'failed';
  return {
    id: `thread-${idx}`,
    summary: `Deep dive analysis task ${idx}`,
    agentName: `Agent ${String.fromCharCode(65 + (idx % 26))}`,
    createdAt: isoHoursAgo(hoursAgo),
    status,
    isOpen: status !== 'finished' && status !== 'failed',
  };
});

const updateThreadOpenState = (nodes: Thread[], targetId: string, isOpen: boolean): Thread[] => {
  let mutated = false;
  const next = nodes.map((thread) => {
    let updated = thread;
    if (thread.id === targetId && thread.isOpen !== isOpen) {
      updated = { ...thread, isOpen };
      mutated = true;
    }
    if (thread.subthreads) {
      const updatedChildren = updateThreadOpenState(thread.subthreads, targetId, isOpen);
      if (updatedChildren !== thread.subthreads) {
        updated = updated === thread ? { ...thread } : updated;
        updated.subthreads = updatedChildren;
        mutated = true;
      }
    }
    return updated;
  });
  return mutated ? next : nodes;
};

const runs: Run[] = [
  {
    id: 'run-1',
    status: 'finished',
    duration: '2m 34s',
    tokens: 1234,
    cost: '$0.05',
    messages: [
      {
        id: 'msg-1',
        role: 'user',
        content: 'Can you help me implement OAuth 2.0 authentication?',
        timestamp: '10:30 AM',
      },
      {
        id: 'msg-2',
        role: 'assistant',
        content:
          "I'll help you implement OAuth 2.0 authentication. Let me start by setting up the necessary dependencies and configuration.\n\n## Implementation Plan\n\n1. Install required packages\n2. Set up OAuth provider configuration\n3. Create authentication endpoints\n4. Implement token management\n\nLet's begin!",
        timestamp: '10:31 AM',
      },
      {
        id: 'msg-3',
        role: 'tool',
        content:
          'Installing OAuth 2.0 libraries...\n\n```bash\nnpm install passport passport-oauth2 jsonwebtoken bcrypt\n```',
        timestamp: '10:31 AM',
      },
    ],
  },
  {
    id: 'run-2',
    status: 'finished',
    duration: '3m 12s',
    tokens: 2156,
    cost: '$0.08',
    messages: [
      {
        id: 'msg-4',
        role: 'system',
        content: 'Packages installed successfully. Ready to configure OAuth provider.',
        timestamp: '10:34 AM',
      },
      {
        id: 'msg-5',
        role: 'assistant',
        content:
          "Great! Now let's set up the OAuth configuration. Here's the basic setup:\n\n```typescript\nimport passport from 'passport';\nimport { Strategy as OAuth2Strategy } from 'passport-oauth2';\n\n// Configure OAuth2 strategy\npassport.use(new OAuth2Strategy({\n  authorizationURL: 'https://provider.com/oauth/authorize',\n  tokenURL: 'https://provider.com/oauth/token',\n  clientID: process.env.CLIENT_ID,\n  clientSecret: process.env.CLIENT_SECRET,\n  callbackURL: 'http://localhost:3000/auth/callback'\n}, (accessToken, refreshToken, profile, done) => {\n  // Handle user profile\n  return done(null, profile);\n}));\n```\n\n### Environment Variables\n\nMake sure to add these to your `.env` file:\n- `CLIENT_ID`\n- `CLIENT_SECRET`\n- `SESSION_SECRET`",
        timestamp: '10:35 AM',
      },
    ],
  },
];

const runsThread2: Run[] = [
  {
    id: 'run-3',
    status: 'finished',
    duration: '1m 48s',
    tokens: 864,
    cost: '$0.03',
    messages: [
      {
        id: 'msg-7',
        role: 'user',
        content: 'Please audit slow queries on the billing tables.',
        timestamp: '09:12 AM',
      },
      {
        id: 'msg-8',
        role: 'assistant',
        content: 'Running EXPLAIN ANALYZE to identify bottlenecks in the billing queries.',
        timestamp: '09:13 AM',
      },
    ],
  },
  {
    id: 'run-4',
    status: 'running',
    duration: '—',
    tokens: 412,
    cost: '$0.01',
    messages: [
      {
        id: 'msg-9',
        role: 'assistant',
        content: 'Applying composite indexes to the invoices table.',
        timestamp: '09:15 AM',
      },
    ],
  },
];

const runsThread3: Run[] = [
  {
    id: 'run-5',
    status: 'finished',
    duration: '3m 02s',
    tokens: 1098,
    cost: '$0.04',
    messages: [
      {
        id: 'msg-10',
        role: 'assistant',
        content: 'Drafted new hero section copy and updated component props.',
        timestamp: '11:05 AM',
      },
      {
        id: 'msg-11',
        role: 'user',
        content: 'Can you apply the gradient background from the design system?',
        timestamp: '11:06 AM',
      },
    ],
  },
];

const cachedRunsByThread: Record<string, Run[]> = {
  [threads[0].id]: runs,
  [threads[1].id]: runsThread2,
  [threads[2].id]: runsThread3,
};

const containers = [
  { id: 'c-1', name: 'auth-service', status: 'running' as const },
  { id: 'c-2', name: 'api-gateway', status: 'running' as const },
  { id: 'c-3', name: 'database', status: 'finished' as const },
];

const reminders = [
  { id: 'r-1', title: 'Review PR #123', time: 'Tomorrow at 10:00 AM' },
  { id: 'r-2', title: 'Update documentation', time: 'Friday at 2:00 PM' },
];

const baseArgs: ThreadsScreenProps = {
  threads,
  runs,
  containers,
  reminders,
  filterMode: 'all',
  selectedThreadId: threads[0]?.id ?? null,
  inputValue: '',
  isRunsInfoCollapsed: false,
  threadsHasMore: true,
  threadsIsLoading: false,
  isLoading: false,
  isEmpty: false,
};

const defaultDraftThread: Thread = {
  id: 'draft-demo',
  summary: 'Plan onboarding follow-up with the product team',
  agentName: 'Draft conversation',
  createdAt: 'Just now',
  status: 'pending',
  isOpen: true,
};

const defaultDraftRecipients = [
  { id: 'agent-1', title: 'Agent Nimbus' },
  { id: 'agent-2', title: 'Agent Cirrus' },
  { id: 'agent-3', title: 'Agent Stratus' },
];

const fetchDraftRecipients = async (query: string): Promise<AutocompleteOption[]> => {
  const normalized = query.trim().toLowerCase();
  return defaultDraftRecipients
    .filter((recipient) => recipient.title.toLowerCase().includes(normalized))
    .map((recipient) => ({ value: recipient.id, label: recipient.title }));
};

const ControlledRender: Story['render'] = () => {
  const [currentArgs, updateArgs] = useArgs<ThreadsScreenProps>();
  const logFilterModeChange = action('onFilterModeChange');
  const logSelectThread = action('onSelectThread');
  const logToggleRunsInfoCollapsed = action('onToggleRunsInfoCollapsed');
  const logInputValueChange = action('onInputValueChange');
  const logSendMessage = action('onSendMessage');
  const logThreadsLoadMore = action('onThreadsLoadMore');
  const logToggleThreadStatus = action('onToggleThreadStatus');
  const logCreateDraft = action('onCreateDraft');
  const paginationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (paginationTimeoutRef.current) {
        clearTimeout(paginationTimeoutRef.current);
      }
    };
  }, []);

  return (
    <div className="absolute inset-0 flex min-h-0 min-w-0">
      <ThreadsScreen
        {...currentArgs}
        draftFetchOptions={currentArgs.draftFetchOptions ?? fetchDraftRecipients}
        onCreateDraft={() => {
          logCreateDraft();
          currentArgs.onCreateDraft?.();
          const draftThread = { ...defaultDraftThread };
          const existingThreads = currentArgs.threads ?? [];
          const nextThreads = [
            draftThread,
            ...existingThreads.filter((thread) => thread.id !== draftThread.id),
          ];

          updateArgs({
            threads: nextThreads,
            selectedThreadId: draftThread.id,
            selectedThread: draftThread,
            draftMode: true,
            draftRecipientId: null,
            draftRecipientLabel: null,
            runs: [],
            inputValue: currentArgs.draftMode ? currentArgs.inputValue : '',
          });
        }}
        onFilterModeChange={(mode) => {
          logFilterModeChange(mode);
          updateArgs({ filterMode: mode });
        }}
        onSelectThread={(threadId) => {
          logSelectThread(threadId);
          updateArgs({ selectedThreadId: threadId });
        }}
        onToggleRunsInfoCollapsed={(collapsed) => {
          logToggleRunsInfoCollapsed(collapsed);
          updateArgs({ isRunsInfoCollapsed: collapsed });
        }}
        onInputValueChange={(value) => {
          logInputValueChange(value);
          updateArgs({ inputValue: value });
        }}
        onSendMessage={(value, context) => {
          logSendMessage(value, context);
          updateArgs({ inputValue: '' });
        }}
        onThreadsLoadMore={() => {
          logThreadsLoadMore();
          if (currentArgs.threadsIsLoading) {
            return;
          }

          const currentThreads = currentArgs.threads ?? [];
          const canPaginate = currentThreads.length > 0 && currentThreads.every((thread) => thread.id.startsWith('thread-'));
          if (!canPaginate) {
            return;
          }

          const nextCount = Math.min(currentThreads.length + MANY_THREADS_PAGE_SIZE, manyThreads.length);
          const nextThreads = manyThreads.slice(0, nextCount);

          if (nextThreads.length === currentThreads.length) {
            updateArgs({ threadsHasMore: false });
            return;
          }

          updateArgs({ threadsIsLoading: true });

          if (paginationTimeoutRef.current) {
            clearTimeout(paginationTimeoutRef.current);
          }

          paginationTimeoutRef.current = setTimeout(() => {
            updateArgs({
              threads: nextThreads,
              threadsIsLoading: false,
              threadsHasMore: nextThreads.length < manyThreads.length,
            });
          }, 400);
        }}
        onToggleThreadStatus={(threadId, next) => {
          logToggleThreadStatus(threadId, next);
          const existingThreads = currentArgs.threads ?? [];
          const isOpen = next === 'open';
          const updatedThreads = updateThreadOpenState(existingThreads, threadId, isOpen);
          const nextSelectedThread = currentArgs.selectedThread && currentArgs.selectedThread.id === threadId
            ? { ...currentArgs.selectedThread, isOpen }
            : currentArgs.selectedThread;
          updateArgs({
            threads: updatedThreads,
            selectedThread: nextSelectedThread,
          });
        }}
      />
    </div>
  );
};

export const Populated: Story = {
  args: {
    threads: manyThreads.slice(0, MANY_THREADS_PAGE_SIZE),
    runs,
    containers,
    reminders,
    filterMode: 'all',
    selectedThreadId: manyThreads[0].id,
    inputValue: '',
    isRunsInfoCollapsed: false,
    threadsHasMore: manyThreads.length > MANY_THREADS_PAGE_SIZE,
    threadsIsLoading: false,
    isLoading: false,
    isEmpty: false,
  },
  render: ControlledRender,
  parameters: {
    selectedMenuItem: 'threads',
  },
};

export const DraftModePreview: Story = {
  args: {
    ...baseArgs,
    threads: [defaultDraftThread, ...threads],
    runs: [],
    selectedThreadId: defaultDraftThread.id,
    selectedThread: defaultDraftThread,
    draftMode: true,
    draftRecipientId: defaultDraftRecipients[0].id,
    draftRecipientLabel: defaultDraftRecipients[0].title,
    inputValue: 'Draft message preview',
  },
  render: ControlledRender,
  parameters: {
    selectedMenuItem: 'threads',
  },
};

export const ManyThreads: Story = {
  args: {
    threads: manyThreads,
    runs,
    containers,
    reminders,
    filterMode: 'all',
    selectedThreadId: manyThreads[0].id,
    inputValue: '',
    isRunsInfoCollapsed: false,
    threadsHasMore: false,
    threadsIsLoading: false,
    isLoading: false,
    isEmpty: false,
  },
  render: ControlledRender,
  parameters: {
    selectedMenuItem: 'threads',
  },
};

export const Empty: Story = {
  args: {
    threads: [],
    runs: [],
    containers: [],
    reminders: [],
    filterMode: 'all',
    selectedThreadId: null,
    inputValue: '',
    isRunsInfoCollapsed: false,
    threadsHasMore: false,
    threadsIsLoading: false,
    isLoading: false,
    isEmpty: true,
  },
  render: ControlledRender,
  parameters: {
    selectedMenuItem: 'threads',
  },
};

export const ListLoadingOnly: Story = {
  args: {
    threads,
    runs,
    containers,
    reminders,
    filterMode: 'all',
    selectedThreadId: threads[0].id,
    inputValue: '',
    isRunsInfoCollapsed: false,
    threadsHasMore: true,
    threadsIsLoading: true,
    isLoading: false,
    isEmpty: false,
  },
  render: ControlledRender,
  parameters: {
    selectedMenuItem: 'threads',
  },
};

export const ConversationLoadingOnly: Story = {
  args: {
    threads,
    runs,
    containers,
    reminders,
    filterMode: 'all',
    selectedThreadId: threads[0].id,
    inputValue: '',
    isRunsInfoCollapsed: false,
    threadsHasMore: false,
    threadsIsLoading: false,
    isLoading: true,
    isEmpty: false,
  },
  render: ControlledRender,
  parameters: {
    selectedMenuItem: 'threads',
  },
};

export const ListAndDetailLoading: Story = {
  args: {
    threads,
    runs,
    containers,
    reminders,
    filterMode: 'all',
    selectedThreadId: threads[0].id,
    inputValue: '',
    isRunsInfoCollapsed: false,
    threadsHasMore: true,
    threadsIsLoading: true,
    isLoading: true,
    isEmpty: false,
  },
  render: ControlledRender,
  parameters: {
    selectedMenuItem: 'threads',
  },
};

export const Error: Story = {
  args: {
    threads: [],
    runs: [],
    containers: [],
    reminders: [],
    filterMode: 'all',
    selectedThreadId: null,
    inputValue: '',
    isRunsInfoCollapsed: false,
    threadsHasMore: false,
    threadsIsLoading: false,
    isLoading: false,
    isEmpty: false,
    listError: <span>Failed to load threads. Please try again.</span>,
    detailError: <span>Unable to load the selected conversation.</span>,
  },
  render: ControlledRender,
  parameters: {
    selectedMenuItem: 'threads',
  },
};

export const SwitchWithCache: Story = {
  render: () => {
    const [selectedThreadId, setSelectedThreadId] = useState<string>(threads[0].id);
    const [activeRuns, setActiveRuns] = useState<Run[]>(cachedRunsByThread[threads[0].id]);

    const handleSelectThread = (threadId: string) => {
      setSelectedThreadId(threadId);
      setActiveRuns(cachedRunsByThread[threadId] ?? []);
    };

    const resolvedThread = threads.find((thread) => thread.id === selectedThreadId);

    return (
      <div className="absolute inset-0 flex min-h-0 min-w-0">
        <ThreadsScreen
          threads={threads}
          runs={activeRuns}
          containers={containers}
          reminders={reminders}
          filterMode="all"
          selectedThreadId={selectedThreadId}
          selectedThread={resolvedThread}
          inputValue=""
          isRunsInfoCollapsed={false}
          threadsHasMore={false}
          threadsIsLoading={false}
          isLoading={false}
          isEmpty={false}
          onSelectThread={handleSelectThread}
        />
      </div>
    );
  },
  parameters: {
    selectedMenuItem: 'threads',
  },
};
