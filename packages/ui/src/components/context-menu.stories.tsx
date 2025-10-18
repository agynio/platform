import type { Meta, StoryObj } from '@storybook/react';
import { ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem } from './context-menu';

const meta = { title: 'Components/ContextMenu', component: ContextMenu } satisfies Meta<typeof ContextMenu>;
export default meta;
export type Story = StoryObj<typeof meta>;

export const Basic: Story = {
  render: () => (
    <ContextMenu>
      <ContextMenuTrigger>
        <div className="w-64 h-32 border rounded-md flex items-center justify-center">Right-click me</div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem>Refresh</ContextMenuItem>
        <ContextMenuItem>Rename</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
};
