import type { Meta, StoryObj } from '@storybook/react';
import { Popover, PopoverTrigger, PopoverContent } from './popover';
import { Button } from './button';

const meta = { title: 'Components/Popover', component: PopoverContent } satisfies Meta<typeof PopoverContent>;
export default meta;
export type Story = StoryObj<typeof meta>;

export const Basic: Story = {
  render: () => (
    <Popover>
      <PopoverTrigger asChild>
        <Button>Open popover</Button>
      </PopoverTrigger>
      <PopoverContent className="w-64">Some content inside popover</PopoverContent>
    </Popover>
  )
};

