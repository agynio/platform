import type { Meta, StoryObj } from '@storybook/react';
import Badge from '../src/components/Badge';

const meta: Meta<typeof Badge> = {
  title: 'Components/Badge',
  component: Badge,
  parameters: {
    layout: 'centered',
    tags: ['autodocs'],
  },
  argTypes: {
    variant: {
      control: 'select',
      options: ['default', 'neutral', 'primary', 'secondary', 'purple', 'accent', 'success', 'warning', 'error', 'info'],
    },
  },
};

export default meta;

type Story = StoryObj<typeof Badge>;

export const Playground: Story = {
  args: {
    variant: 'default',
    children: 'Badge',
  },
};

export const Variants: Story = {
  render: () => (
    <div className="flex flex-wrap gap-4">
      <Badge variant="default">Default</Badge>
      <Badge variant="success">Success</Badge>
      <Badge variant="warning">Warning</Badge>
      <Badge variant="error">Error</Badge>
    </div>
  ),
};
