import type { Meta, StoryObj } from '@storybook/react';
import { Plus, Check, X, Trash2 } from 'lucide-react';
import { IconButton } from '../src/components/IconButton';

const meta: Meta<typeof IconButton> = {
  title: 'Components/IconButton',
  component: IconButton,
  parameters: {
    layout: 'centered',
    tags: ['autodocs'],
  },
  argTypes: {
    onClick: { action: 'clicked' },
    variant: {
      control: 'select',
      options: ['primary', 'secondary', 'accent', 'outline', 'ghost', 'danger'],
    },
    size: {
      control: 'inline-radio',
      options: ['sm', 'md', 'lg'],
    },
    rounded: {
      control: 'boolean',
    },
  },
};

export default meta;

type Story = StoryObj<typeof IconButton>;

export const Playground: Story = {
  args: {
    variant: 'primary',
    size: 'md',
    rounded: false,
    icon: <Plus />,
  },
};

export const Variants: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-4">
      <IconButton variant="primary" icon={<Plus />} />
      <IconButton variant="secondary" icon={<Check />} />
      <IconButton variant="outline" icon={<X />} />
      <IconButton variant="ghost" icon={<Trash2 />} />
    </div>
  ),
};
