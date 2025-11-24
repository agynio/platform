import type { Meta, StoryObj } from '@storybook/react';
import { StatusIndicator, type Status } from '../src/components/StatusIndicator';

const meta: Meta<typeof StatusIndicator> = {
  title: 'Components/StatusIndicator',
  component: StatusIndicator,
  parameters: {
    layout: 'centered',
    tags: ['autodocs'],
  },
  argTypes: {
    status: {
      control: 'select',
      options: ['pending', 'running', 'finished', 'failed', 'terminated'] satisfies Status[],
    },
  },
};

export default meta;

type Story = StoryObj<typeof StatusIndicator>;

export const Playground: Story = {
  args: {
    status: 'running',
    label: 'Job status',
  },
};

export const AllStatuses: Story = {
  render: () => {
    const statuses: Status[] = ['pending', 'running', 'finished', 'failed', 'terminated'];

    return (
      <div className="space-y-2">
        {statuses.map((status) => (
          <div key={status} className="flex items-center gap-2">
            <StatusIndicator status={status} />
            <span>{status}</span>
          </div>
        ))}
      </div>
    );
  },
};
