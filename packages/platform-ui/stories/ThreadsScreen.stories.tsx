import type { Meta, StoryObj } from '@storybook/react';
import ThreadsScreen from '@/components/screens/ThreadsScreen';
import type { Thread } from '@/components/ThreadItem';
import type { Run, ReminderData as ConversationReminderData, QueuedMessageData } from '@/components/Conversation';
import { withMainLayout } from './decorators/withMainLayout';

const FIXED_TEST_DATE = '2024-11-06T12:00:00Z';

const sampleThreads: Thread[] = [
  {
    id: 'thread-alpha',
    summary: 'Investigate slow billing queries',
    agentName: 'Atlas',
    agentRole: 'Navigator',
    createdAt: '2024-11-05T09:12:00Z',
    status: 'running',
    isOpen: true,
    hasChildren: true,
    childrenError: null,
    subthreads: [
      {
        id: 'thread-alpha-child',
        summary: 'Validate new index rollout',
        agentName: 'Helix',
        agentRole: 'Analyst',
        createdAt: '2024-11-05T10:45:00Z',
        status: 'finished',
        isOpen: true,
        hasChildren: false,
        childrenError: null,
      },
    ],
  },
  {
    id: 'thread-bravo',
    summary: 'Resolve degraded ingestion pipeline',
    agentName: 'Delta',
    agentRole: 'Responder',
    createdAt: '2024-11-04T18:00:00Z',
    status: 'finished',
    isOpen: false,
    hasChildren: false,
    childrenError: null,
  },
];

const onViewRun = () => undefined;

const sampleRuns: Run[] = [
  {
    id: 'run-alpha-1',
    status: 'finished',
    duration: '3m 10s',
    tokens: 2360,
    messages: [
      {
        id: 'msg-1',
        role: 'user',
        content: 'Please audit slow queries on billing tables.',
        timestamp: '09:12',
      },
      {
        id: 'msg-2',
        role: 'assistant',
        content: 'Identified missing composite index on invoices_total.',
        timestamp: '09:14',
      },
    ],
    onViewRun,
  },
  {
    id: 'run-alpha-2',
    status: 'running',
    duration: '1m',
    tokens: 900,
    messages: [
      {
        id: 'msg-3',
        role: 'user',
        content: 'Validate index impact in staging.',
        timestamp: '10:05',
      },
    ],
    onViewRun,
  },
];

const sampleReminders: { id: string; title: string; time: string }[] = [
  { id: 'rem-alpha', title: 'Check staging metrics', time: '11:30' },
  { id: 'rem-bravo', title: 'Post status update', time: '14:00' },
];

const sampleConversationReminders: ConversationReminderData[] = [
  { id: 'conv-rem-1', content: 'Grafana follow-up', scheduledTime: '11:45' },
];

const sampleQueuedMessages: QueuedMessageData[] = [
  { id: 'queued-1', content: 'Preparing new context window…' },
];

const baseArgs = {
  threads: sampleThreads,
  runs: sampleRuns,
  containers: [
    { id: 'container-1', name: 'atlas-runner', status: 'running' },
    { id: 'container-2', name: 'delta-runner', status: 'finished' },
  ],
  reminders: sampleReminders,
  conversationReminders: sampleConversationReminders,
  conversationQueuedMessages: sampleQueuedMessages,
  filterMode: 'all' as const,
  selectedThreadId: null,
  selectedThread: undefined,
  inputValue: '',
  isRunsInfoCollapsed: false,
  threadsHasMore: false,
  threadsIsLoading: false,
  isLoading: false,
  isEmpty: false,
  onFilterModeChange: () => undefined,
  onSelectThread: () => undefined,
  onToggleRunsInfoCollapsed: () => undefined,
  onInputValueChange: () => undefined,
  onSendMessage: () => undefined,
  onThreadsLoadMore: () => undefined,
  onThreadExpand: () => undefined,
  onCreateDraft: () => undefined,
  onToggleThreadStatus: () => undefined,
  onOpenContainerTerminal: () => undefined,
  draftMode: false,
  isToggleThreadStatusPending: false,
  isSendMessagePending: false,
  disableDraftAutofocus: true,
};

const meta: Meta<typeof ThreadsScreen> = {
  title: 'Screens/Threads',
  component: ThreadsScreen,
  decorators: [withMainLayout],
  parameters: {
    layout: 'fullscreen',
    screen: {
      routePath: '/agents/threads',
      initialEntry: '/agents/threads',
    },
    selectedMenuItem: 'threads',
    test: {
      fixedDate: FIXED_TEST_DATE,
      readySelector: '[data-testid="threads-list"]',
    },
  },
  args: baseArgs,
  tags: ['!autodocs', 'smoke'],
};

export default meta;

type Story = StoryObj<typeof ThreadsScreen>;

export const ListView: Story = {};

export const ThreadSelected: Story = {
  args: {
    selectedThreadId: sampleThreads[0].id,
    selectedThread: sampleThreads[0],
  },
};
