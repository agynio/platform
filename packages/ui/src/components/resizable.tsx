"use client";

import * as React from 'react';
import { PanelGroup, Panel, PanelResizeHandle, type PanelGroupProps, type PanelProps } from 'react-resizable-panels';
import { cn } from '../utils/cn';

function ResizablePanelGroup({ className, ...props }: PanelGroupProps) {
  return <PanelGroup className={cn('flex data-[panel-group-direction=vertical]:flex-col', className)} {...props} />;
}

function ResizablePanel({ className, ...props }: PanelProps) {
  return <Panel className={cn('min-w-0', className)} {...props} />;
}

function ResizableHandle(
  { className, withHandle = true, ...props }: React.ComponentProps<typeof PanelResizeHandle> & { withHandle?: boolean },
) {
  return (
    <PanelResizeHandle
      className={cn(
        'relative flex w-px items-center justify-center bg-border transition-colors data-[panel-group-direction=vertical]:h-px data-[panel-group-direction=vertical]:w-full data-[panel-group-direction=vertical]:py-1 data-[panel-group-direction=horizontal]:px-1',
        className
      )}
      {...props}
    >
      {withHandle ? <div className="z-10 size-4 rounded-full border border-border bg-background shadow-xs" /> : null}
    </PanelResizeHandle>
  );
}

export { ResizablePanelGroup, ResizablePanel, ResizableHandle };
