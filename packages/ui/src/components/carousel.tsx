"use client";

import * as React from 'react';
import useEmblaCarousel from 'embla-carousel-react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './button';

export function Carousel({ children, options }: { children: React.ReactNode; options?: Parameters<typeof useEmblaCarousel>[0] }) {
  const [emblaRef, emblaApi] = useEmblaCarousel(options);
  const [canScrollPrev, setCanScrollPrev] = React.useState(false);
  const [canScrollNext, setCanScrollNext] = React.useState(false);

  React.useEffect(() => {
    if (!emblaApi) return;
    const onSelect = () => {
      setCanScrollPrev(emblaApi.canScrollPrev());
      setCanScrollNext(emblaApi.canScrollNext());
    };
    emblaApi.on('select', onSelect);
    onSelect();
    return () => {
      emblaApi.off('select', onSelect);
    };
  }, [emblaApi]);

  return (
    <div className="relative">
      <div className="overflow-hidden" ref={emblaRef}>
        <div className="flex">{children}</div>
      </div>
      <div className="absolute inset-y-0 left-0 flex items-center">
        <Button variant="outline" size="icon" onClick={() => emblaApi?.scrollPrev()} disabled={!canScrollPrev}>
          <ChevronLeft className="size-4" />
        </Button>
      </div>
      <div className="absolute inset-y-0 right-0 flex items-center">
        <Button variant="outline" size="icon" onClick={() => emblaApi?.scrollNext()} disabled={!canScrollNext}>
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}

export function CarouselItem({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={"min-w-0 shrink-0 grow-0 basis-full"} {...props} />;
}
