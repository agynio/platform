import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { Dropdown } from '../src/components/Dropdown';

const meta: Meta<typeof Dropdown> = {
  title: 'Components/Dropdown',
  component: Dropdown,
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

type Story = StoryObj<typeof Dropdown>;

export const Playground: Story = {
  args: {
    label: 'Environment',
    placeholder: 'Select environment',
    options: [
      { value: 'dev', label: 'Development' },
      { value: 'staging', label: 'Staging' },
      { value: 'prod', label: 'Production' },
    ],
  },
  render: (args) => {
    const [value, setValue] = useState<string | undefined>(undefined);

    return <Dropdown {...args} value={value} onValueChange={setValue} />;
  },
};

export const Basic: Story = {
  render: () => {
    const [value, setValue] = useState<string | undefined>(undefined);

    return (
      <Dropdown
        label="Environment"
        placeholder="Select environment"
        value={value}
        onValueChange={setValue}
        options={[
          { value: 'dev', label: 'Development' },
          { value: 'staging', label: 'Staging' },
          { value: 'prod', label: 'Production' },
        ]}
      />
    );
  },
};
