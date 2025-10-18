"use client";

import * as React from 'react';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { cn } from '../utils/cn';

const Popover = PopoverPrimitive.Root;
const PopoverTrigger = PopoverPrimitive.Trigger;
const PopoverAnchor = PopoverPrimitive.Anchor;

// Note: we keep a thin wrapper to apply common styles and allow presence-based animations.
// We intentionally support `forceMount` on the Portal to allow closed-state animations.
const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content> & {
    forceMount?: boolean;
  }
>(({ className, align = 'center', sideOffset = 4, forceMount, ...props }, ref) => (
  <PopoverPrimitive.Portal forceMount={forceMount}>
    {/* Radix sets data-state and data-side attributes. We rely on Tailwind data-[] variants for animations. */}
    <PopoverPrimitive.Content
      ref={ref}
      align={align}
      sideOffset={sideOffset}
      className={cn(
        // Surface + elevation + blur
        'z-50 w-72 rounded-xl border bg-popover/95 p-4 text-popover-foreground shadow-2xl backdrop-blur',
        // Open/close animations
        'data-[state=open]:animate-in data-[state=closed]:animate-out',
        'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
        'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
        'data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2',
        'outline-none',
        className,
      )}
      {...props}
    />
  </PopoverPrimitive.Portal>
));
PopoverContent.displayName = PopoverPrimitive.Content.displayName;

export { Popover, PopoverTrigger, PopoverContent, PopoverAnchor };
