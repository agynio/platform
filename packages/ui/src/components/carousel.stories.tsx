import type { Meta, StoryObj } from '@storybook/react';
import { Carousel, CarouselItem } from './carousel';

const meta = { title: 'Components/Carousel', component: Carousel } satisfies Meta<typeof Carousel>;
export default meta;
export type Story = StoryObj<typeof meta>;

export const Basic: Story = {
  render: () => (
    <div className="w-[360px]">
      <Carousel>
        {[1, 2, 3].map((n) => (
          <CarouselItem key={n}>
            <div className="h-40 flex items-center justify-center bg-muted border">Slide {n}</div>
          </CarouselItem>
        ))}
      </Carousel>
    </div>
  )
};

