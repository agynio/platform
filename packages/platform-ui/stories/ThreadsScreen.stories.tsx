import { action } from 'storybook/actions';
import type { Meta, StoryObj } from '@storybook/react';
import { useArgs } from '@storybook/preview-api';
import ThreadsScreen from '../src/components/screens/ThreadsScreen';
import type { Thread } from '../src/components/ThreadItem';
import type { Run } from '../src/components/Conversation';
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

const threads: Thread[] = [
  {
    id: '1',
    summary: 'Implement user authentication flow with OAuth 2.0',
    agentName: 'Auth Agent',
    createdAt: '2 hours ago',
    status: 'running',
    isOpen: true,
  },
  {
    id: '2',
    summary: 'Refactor database queries for better performance',
    agentName: 'DB Agent',
    createdAt: '5 hours ago',
    status: 'finished',
    isOpen: true,
    subthreads: [
      {
        id: '2-1',
        summary: 'Optimize index usage in user queries',
        agentName: 'Optimizer',
        createdAt: '4 hours ago',
        status: 'finished',
        isOpen: true,
      },
    ],
  },
  {
    id: '3',
    summary: 'Design new landing page components',
    agentName: 'Design Agent',
    createdAt: '1 day ago',
    status: 'pending',
    isOpen: false,
  },
];

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

const containers = [
  { id: 'c-1', name: 'auth-service', status: 'running' as const },
  { id: 'c-2', name: 'api-gateway', status: 'running' as const },
  { id: 'c-3', name: 'database', status: 'finished' as const },
];

const reminders = [
  { id: 'r-1', title: 'Review PR #123', time: 'Tomorrow at 10:00 AM' },
  { id: 'r-2', title: 'Update documentation', time: 'Friday at 2:00 PM' },
];

const ControlledRender: Story['render'] = () => {
  const [currentArgs, updateArgs] = useArgs<ThreadsScreenProps>();
  const logFilterModeChange = action('onFilterModeChange');
  const logSelectThread = action('onSelectThread');
  const logToggleRunsInfoCollapsed = action('onToggleRunsInfoCollapsed');
  const logInputValueChange = action('onInputValueChange');
  const logSendMessage = action('onSendMessage');
  const logThreadsLoadMore = action('onThreadsLoadMore');

  return (
    <ThreadsScreen
      {...currentArgs}
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
      }}
    />
  );
};

export const Populated: Story = {
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

export const Loading: Story = {
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
    error: 'Failed to load threads. Please try again.',
  },
  render: ControlledRender,
  parameters: {
    selectedMenuItem: 'threads',
  },
};
