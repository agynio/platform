import type { Meta, StoryObj } from '@storybook/react';
import { Button } from './button';

const meta = {
  title: 'Components/Button',
  component: Button,
  args: { children: 'Click me', variant: 'default', size: 'default', disabled: false },
  argTypes: {
    variant: { control: 'select', options: ['default', 'secondary', 'destructive', 'outline', 'ghost', 'link'] },
    size: { control: 'select', options: ['sm', 'default', 'lg', 'icon'] }
  }
} satisfies Meta<typeof Button>;

export default meta;
export type Story = StoryObj<typeof meta>;

export const Primary: Story = {};
export const Disabled: Story = { args: { disabled: true } };

