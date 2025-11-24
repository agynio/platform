import type { Meta, StoryObj } from '@storybook/react';
import EmptySelectionSidebar from '../src/components/EmptySelectionSidebar';

const meta: Meta<typeof EmptySelectionSidebar> = {
  title: 'Screens/Graph/EmptySelectionSidebar',
  component: EmptySelectionSidebar,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['!autodocs'],
};

export default meta;

type Story = StoryObj<typeof EmptySelectionSidebar>;

export const Default: Story = {
  render: (args) => (
    <div className="h-screen flex">
      <div className="flex-1 bg-[var(--agyn-bg-light)]" />
      <EmptySelectionSidebar {...args} />
    </div>
  ),
  args: {},
};

export const CustomNodeItems: Story = {
  render: (args) => (
    <div className="h-screen flex">
      <div className="flex-1 bg-[var(--agyn-bg-light)]" />
      <EmptySelectionSidebar {...args} />
    </div>
  ),
  args: {
    nodeItems: [
      {
        id: 'agent-custom',
        kind: 'Agent',
        title: 'Custom GPT Agent',
        description: 'A customized GPT agent with specific instructions',
      },
      {
        id: 'tool-custom',
        kind: 'Tool',
        title: 'API Integration',
        description: 'Connect to external APIs and services',
      },
      {
        id: 'trigger-webhook',
        kind: 'Trigger',
        title: 'Webhook Trigger',
        description: 'Trigger workflow via webhook',
      },
    ],
  },
};
