import type { Meta, StoryObj } from '@storybook/react';
import { Button } from './button';
import { toast } from './toaster';

const meta = { title: 'Components/Toaster' } satisfies Meta;
export default meta;
export type Story = StoryObj;

export const TriggerToast: Story = {
  render: () => <Button onClick={() => toast('Hello from toast!')}>Show toast</Button>
};

