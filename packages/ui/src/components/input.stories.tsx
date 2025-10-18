import type { Meta, StoryObj } from '@storybook/react';
import { Input } from './input';

const meta = {
  title: 'Components/Input',
  component: Input,
  args: { placeholder: 'Type here', disabled: false },
  argTypes: {
    type: { control: 'text' }
  }
} satisfies Meta<typeof Input>;

export default meta;
export type Story = StoryObj<typeof meta>;
export const Basic: Story = {};
export const Disabled: Story = { args: { disabled: true } };

