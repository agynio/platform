import type { Meta, StoryObj } from '@storybook/react';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from './resizable';

const meta = { title: 'Components/Resizable', component: ResizablePanelGroup } satisfies Meta<typeof ResizablePanelGroup>;
export default meta;
export type Story = StoryObj<typeof meta>;

export const TwoPanels: Story = {
  args: {
    direction: 'horizontal' as const,
    children: [
      <ResizablePanel key="left" defaultSize={50} className="p-2">Left</ResizablePanel>,
      <ResizableHandle key="handle" />,
      <ResizablePanel key="right" defaultSize={50} className="p-2">Right</ResizablePanel>,
    ],
  },
  render: (args) => (
    <div className="h-[240px] border">
      <ResizablePanelGroup {...args} />
    </div>
  ),
};
