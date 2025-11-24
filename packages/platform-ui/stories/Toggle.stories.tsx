import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { Toggle } from '../src/components/Toggle';

const meta: Meta<typeof Toggle> = {
  title: 'Components/Toggle',
  component: Toggle,
  parameters: {
    layout: 'centered',
    tags: ['autodocs'],
  },
  argTypes: {
    label: { control: 'text' },
  },
};

export default meta;

type Story = StoryObj<typeof Toggle>;

export const Playground: Story = {
  args: {
    label: 'Enable feature',
    checked: true,
  },
};

export const Controlled: Story = {
  render: () => {
    const [value, setValue] = useState(false);
    return <Toggle checked={value} onCheckedChange={setValue} label="Enable feature" />;
  },
};
