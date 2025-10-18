import type { Meta, StoryObj } from '@storybook/react';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from './resizable';

const meta = { title: 'Components/Resizable', component: ResizablePanelGroup } satisfies Meta<typeof ResizablePanelGroup>;
export default meta;
export type Story = StoryObj<typeof meta>;

export const TwoPanels: Story = {
  render: () => (
    <div className="h-[240px] border">
      <ResizablePanelGroup direction="horizontal">
        <ResizablePanel defaultSize={50} className="p-2">Left</ResizablePanel>
        <ResizableHandle />
        <ResizablePanel defaultSize={50} className="p-2">Right</ResizablePanel>
      </ResizablePanelGroup>
    </div>
  )
};

