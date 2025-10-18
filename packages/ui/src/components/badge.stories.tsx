import type { Meta, StoryObj } from '@storybook/react';
import { Badge } from './badge';

const meta = {
  title: 'Components/Badge',
  component: Badge,
  args: { children: 'Badge', variant: 'default' },
  argTypes: {
    variant: { control: 'select', options: ['default', 'secondary', 'destructive', 'outline', 'accent', 'neutral'] }
  }
} satisfies Meta<typeof Badge>;

export default meta;
export type Story = StoryObj<typeof meta>;
export const Basic: Story = {};

