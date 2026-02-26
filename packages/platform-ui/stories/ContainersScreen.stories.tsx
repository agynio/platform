import type { Meta, StoryObj } from '@storybook/react';
import ContainersScreen from '@/components/screens/ContainersScreen';
import { withMainLayout } from './decorators/withMainLayout';

const containers = [
  {
    id: 'workspace-1',
    name: 'atlas-workspace',
    containerId: 'sha256:abc',
    image: 'ghcr.io/agyn/workspace:latest',
    role: 'workspace' as const,
    status: 'running' as const,
    startedAt: '2024-11-05T08:00:00Z',
    lastUsedAt: '2024-11-05T10:00:00Z',
    ttl: '2024-11-05T18:00:00Z',
    volumes: ['/workspace'],
    ports: [443],
    threadId: 'thread-alpha',
    runId: 'run-alpha-1',
  },
  {
    id: 'dind-1',
    name: 'atlas-dind',
    containerId: 'sha256:def',
    image: 'docker:dind',
    role: 'sidecar' as const,
    status: 'running' as const,
    startedAt: '2024-11-05T08:05:00Z',
    lastUsedAt: '2024-11-05T10:05:00Z',
    ttl: '2024-11-05T18:05:00Z',
    volumes: ['/var/lib/docker'],
    ports: [],
    parentId: 'workspace-1',
  },
  {
    id: 'workspace-2',
    name: 'delta-workspace',
    containerId: 'sha256:ghi',
    image: 'ghcr.io/agyn/workspace:latest',
    role: 'workspace' as const,
    status: 'stopped' as const,
    startedAt: '2024-11-04T07:00:00Z',
    lastUsedAt: '2024-11-04T12:30:00Z',
    ttl: '2024-11-04T18:00:00Z',
    volumes: ['/workspace'],
    ports: [443],
  },
];

const meta: Meta<typeof ContainersScreen> = {
  title: 'Screens/Containers',
  component: ContainersScreen,
  decorators: [withMainLayout],
  parameters: {
    layout: 'fullscreen',
    screen: {
      routePath: '/monitoring/containers',
      initialEntry: '/monitoring/containers',
    },
    selectedMenuItem: 'containers',
  },
  args: {
    containers,
    onOpenTerminal: () => undefined,
    onDeleteContainer: () => undefined,
    onViewThread: () => undefined,
    onBack: () => undefined,
  },
  tags: ['!autodocs'],
};

export default meta;

type Story = StoryObj<typeof ContainersScreen>;

export const Default: Story = {};
