import type { Meta, StoryObj } from '@storybook/react';
import { Input } from '../src/components/Input';
import { Textarea } from '../src/components/Textarea';

const meta: Meta<typeof Input> = {
  title: 'Components/Input',
  component: Input,
  parameters: {
    layout: 'centered',
    tags: ['autodocs'],
  },
  argTypes: {
    onChange: { action: 'changed' },
  },
};

export default meta;

type Story = StoryObj<typeof Input>;

export const Basic: Story = {
  args: {
    placeholder: 'Enter text...',
  },
};

export const WithLabel: Story = {
  args: {
    label: 'Email Address',
    placeholder: 'you@example.com',
  },
};

export const Password: Story = {
  args: {
    label: 'Password',
    type: 'password',
    placeholder: 'Enter password',
  },
};

export const TextareaExample: Story = {
  render: () => (
    <div className="max-w-md space-y-4">
      <Textarea placeholder="Enter long form text..." />
      <Textarea label="Description" placeholder="Describe your changes" />
    </div>
  ),
};
