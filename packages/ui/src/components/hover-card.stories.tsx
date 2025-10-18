import type { Meta, StoryObj } from '@storybook/react';
import { HoverCard, HoverCardTrigger, HoverCardContent } from './hover-card';
import { Button } from './button';

const meta = { title: 'Components/HoverCard', component: HoverCardContent } satisfies Meta<typeof HoverCardContent>;
export default meta;
export type Story = StoryObj<typeof meta>;

export const Basic: Story = {
  render: () => (
    <HoverCard>
      <HoverCardTrigger asChild>
        <Button variant="link">Hover me</Button>
      </HoverCardTrigger>
      <HoverCardContent>Information appears on hover.</HoverCardContent>
    </HoverCard>
  )
};

