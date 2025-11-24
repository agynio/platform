import type { Meta, StoryObj } from '@storybook/react';
import ContainersScreen, { type Container } from '../src/components/screens/ContainersScreen';
import { MainLayout } from '../src/components/layouts/MainLayout';

const meta: Meta<typeof ContainersScreen> = {
  title: 'Screens/Containers',
  component: ContainersScreen,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['!autodocs'],
};

export default meta;

type Story = StoryObj<typeof ContainersScreen>;

const sampleContainers: Container[] = [
  {
    id: 'c-1',
    name: 'workspace-auth-api',
    containerId: 'abc123',
    image: 'node:20',
    role: 'workspace',
    status: 'running',
    startedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    lastUsedAt: new Date().toISOString(),
    ttl: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    volumes: ['/workspace'],
  },
  {
    id: 'c-2',
    name: 'dind-auth-api',
    containerId: 'def456',
    image: 'docker:dind',
    role: 'dind',
    status: 'running',
    startedAt: new Date(Date.now() - 50 * 60 * 1000).toISOString(),
    lastUsedAt: new Date().toISOString(),
    volumes: ['/var/lib/docker'],
    parentId: 'c-1',
  },
];

const manyContainers: Container[] = Array.from({ length: 65 }).flatMap((_, index) => {
  const id = index + 1;
  const workspaceId = `cw-${id}`;
  const baseTime = Date.now() - id * 15 * 60 * 1000;
  const workspace: Container = {
    id: workspaceId,
    name: `workspace-project-${id.toString().padStart(2, '0')}`,
    containerId: `ws-${id.toString().padStart(6, '0')}`,
    image: 'node:20',
    role: 'workspace',
    status: id % 5 === 0 ? 'stopped' : 'running',
    startedAt: new Date(baseTime).toISOString(),
    lastUsedAt: new Date(baseTime + 5 * 60 * 1000).toISOString(),
    ttl: new Date(baseTime + 2 * 60 * 60 * 1000).toISOString(),
    volumes: ['/workspace'],
  };

  // Attach a dind sidecar to every third workspace
  if (id % 3 === 0) {
    const dind: Container = {
      id: `cd-${id}`,
      name: `dind-project-${id.toString().padStart(2, '0')}`,
      containerId: `dind-${id.toString().padStart(6, '0')}`,
      image: 'docker:dind',
      role: 'dind',
      status: id % 7 === 0 ? 'starting' : 'running',
      startedAt: new Date(baseTime).toISOString(),
      lastUsedAt: new Date(baseTime + 10 * 60 * 1000).toISOString(),
      volumes: ['/var/lib/docker'],
      parentId: workspaceId,
    };
    return [workspace, dind];
  }

  return [workspace];
});

export const Default: Story = {
  render: (args) => (
    <MainLayout selectedMenuItem="containers">
      <ContainersScreen {...args} />
    </MainLayout>
  ),
  args: {
    containers: sampleContainers,
  },
};

export const ManyContainersPagination: Story = {
  render: (args) => (
    <MainLayout selectedMenuItem="containers">
      <ContainersScreen {...args} />
    </MainLayout>
  ),
  args: {
    containers: manyContainers,
  },
};
