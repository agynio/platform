import type { Meta, StoryObj } from '@storybook/react';
import { ScrollArea } from './scroll-area';

const meta = { title: 'Components/ScrollArea', component: ScrollArea } satisfies Meta<typeof ScrollArea>;
export default meta;
export type Story = StoryObj<typeof meta>;

export const Basic: Story = {
  render: () => (
    <div className="h-40 w-64 border">
      <ScrollArea className="h-full p-2">
        <div className="space-y-2">
          {Array.from({ length: 30 }).map((_, i) => (
            <div key={i} className="h-6 rounded bg-muted" />
          ))}
        </div>
      </ScrollArea>
    </div>
  )
};
