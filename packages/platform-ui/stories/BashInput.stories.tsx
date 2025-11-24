import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { BashInput } from '../src/components/BashInput';

const meta: Meta<typeof BashInput> = {
  title: 'Components/BashInput',
  component: BashInput,
  parameters: {
    layout: 'centered',
    tags: ['autodocs'],
  },
  argTypes: {
    placeholder: { control: 'text' },
  },
};

export default meta;

type Story = StoryObj<typeof BashInput>;

export const Playground: Story = {
  args: {
    placeholder: 'pnpm lint && pnpm test',
  },
  render: (args) => {
    const [value, setValue] = useState('echo "Hello from BashInput"');

    return (
      <div className="max-w-2xl w-full">
        <BashInput
          {...args}
          value={value}
          onChange={setValue}
        />
      </div>
    );
  },
};
