import type { Meta, StoryObj } from '@storybook/react';
import { AspectRatio } from './aspect-ratio';

const meta = { title: 'Components/Aspect Ratio', component: AspectRatio } satisfies Meta<typeof AspectRatio>;
export default meta;
export type Story = StoryObj<typeof meta>;

export const SixteenNine: Story = {
  render: () => (
    <AspectRatio ratio={16 / 9}>
      <div className="w-full h-full bg-muted flex items-center justify-center">16:9</div>
    </AspectRatio>
  )
};

