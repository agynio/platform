import type { Meta, StoryObj } from '@storybook/react';
import { Plus, Download, Send } from 'lucide-react';
import { Button } from '../src/components/Button';

const meta: Meta<typeof Button> = {
  title: 'Components/Button',
  component: Button,
  parameters: {
    layout: 'centered',
    tags: ['autodocs'],
    docs: {
      description: {
        component:
          'Agyn primary button component supporting variants (primary, secondary, accent, outline, ghost, danger) and sizes (sm, md, lg).',
      },
    },
  },
  argTypes: {
    onClick: { action: 'clicked' },
  },
};

export default meta;

type Story = StoryObj<typeof Button>;

export const Primary: Story = {
  args: {
    variant: 'primary',
    children: 'Primary Button',
  },
};

export const Secondary: Story = {
  args: {
    variant: 'secondary',
    children: 'Secondary Button',
  },
};

export const Accent: Story = {
  args: {
    variant: 'accent',
    children: 'Accent Button',
  },
};

export const Outline: Story = {
  args: {
    variant: 'outline',
    children: 'Outline Button',
  },
};

export const Ghost: Story = {
  args: {
    variant: 'ghost',
    children: 'Ghost Button',
  },
};

export const Sizes: Story = {
  args: {
    children: 'Button',
  },
  render: (args) => (
    <div className="flex flex-wrap items-center gap-4">
      <Button {...args} size="sm">
        Small Button
      </Button>
      <Button {...args} size="md">
        Medium Button
      </Button>
      <Button {...args} size="lg">
        Large Button
      </Button>
    </div>
  ),
};

export const WithIcons: Story = {
  render: () => (
    <div className="flex flex-wrap gap-4">
      <Button variant="primary">
        <Plus className="w-4 h-4 mr-2" />
        New Project
      </Button>
      <Button variant="secondary">
        <Download className="w-4 h-4 mr-2" />
        Download
      </Button>
      <Button variant="accent">
        <Send className="w-4 h-4 mr-2" />
        Send
      </Button>
    </div>
  ),
};

export const States: Story = {
  render: () => (
    <div className="space-y-4">
      <div>
        <p className="text-[var(--agyn-gray)] mb-3">Normal</p>
        <div className="flex flex-wrap gap-4">
          <Button variant="primary">Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
        </div>
      </div>
      <div>
        <p className="text-[var(--agyn-gray)] mb-3">Disabled</p>
        <div className="flex flex-wrap gap-4">
          <Button variant="primary" disabled>
            Primary
          </Button>
          <Button variant="secondary" disabled>
            Secondary
          </Button>
          <Button variant="outline" disabled>
            Outline
          </Button>
        </div>
      </div>
    </div>
  ),
};
