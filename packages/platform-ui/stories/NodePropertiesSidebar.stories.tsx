import type { Meta, StoryObj } from '@storybook/react';
import NodePropertiesSidebar from '../src/components/NodePropertiesSidebar';

const meta: Meta<typeof NodePropertiesSidebar> = {
  title: 'Screens/Graph/NodePropertiesSidebar',
  component: NodePropertiesSidebar,
  parameters: {
    layout: 'fullscreen',
    tags: ['autodocs'],
  },
};

export default meta;

type Story = StoryObj<typeof NodePropertiesSidebar>;

export const AgentReady: Story = {
  args: {
    config: {
      kind: 'Agent',
      title: 'Customer Support Agent',
    },
    state: {
      status: 'ready',
    },
  },
};
