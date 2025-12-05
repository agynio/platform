import type { Meta, StoryObj } from '@storybook/react';
import { ThreadsList } from '../src/components/ThreadsList';
import type { Thread } from '../src/components/ThreadItem';

const sampleThreads: Thread[] = [
  {
    id: 'thread-1',
    summary: 'Build authentication API',
    agentName: 'AuthBot',
    createdAt: '2024-06-01T10:00:00Z',
    status: 'running',
    isOpen: true,
    subthreads: [
      {
        id: 'thread-1-1',
        summary: 'Add tests',
        agentName: 'TestBot',
        createdAt: '2024-06-01T10:10:00Z',
        status: 'pending',
        isOpen: false,
      },
    ],
  },
  {
    id: 'thread-2',
    summary: 'Design notification system',
    agentName: 'NotifyBot',
    createdAt: '2024-06-02T09:00:00Z',
    status: 'finished',
    isOpen: false,
  },
];

const meta: Meta<typeof ThreadsList> = {
  title: 'Screens/Threads/ThreadsList',
  component: ThreadsList,
  parameters: {
    layout: 'centered',
    tags: ['autodocs'],
  },
};

export default meta;

type Story = StoryObj<typeof ThreadsList>;

export const Basic: Story = {
  args: {
    threads: sampleThreads,
    hasMore: false,
    isLoading: false,
    className: 'w-[480px] max-h-[480px]',
  },
};

export const Loading: Story = {
  args: {
    threads: sampleThreads,
    hasMore: true,
    isLoading: true,
    className: 'w-[480px] max-h-[480px]',
  },
};

export const Empty: Story = {
  args: {
    threads: [],
    hasMore: false,
    isLoading: false,
    className: 'w-[480px] max-h-[480px]',
  },
};
