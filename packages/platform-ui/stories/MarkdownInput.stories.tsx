import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { MarkdownInput } from '../src/components/MarkdownInput';

const meta: Meta<typeof MarkdownInput> = {
  title: 'Components/MarkdownInput',
  component: MarkdownInput,
  parameters: {
    layout: 'centered',
    tags: ['autodocs'],
  },
  argTypes: {
    label: { control: 'text' },
    placeholder: { control: 'text' },
  },
};

export default meta;

type Story = StoryObj<typeof MarkdownInput>;

export const Playground: Story = {
  args: {
    label: 'Message',
    placeholder: 'Write a message with Markdown...',
  },
  render: (args) => {
    const [value, setValue] = useState('');

    return (
      <div className="max-w-2xl w-full">
        <MarkdownInput
          {...args}
          value={value}
          onChange={setValue}
        />
      </div>
    );
  },
};
