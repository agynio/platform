"use client";

import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';

import { cn } from '@/lib/utils';

function ScreenDialog({ ...props }: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="screen-dialog" {...props} />;
}

function ScreenDialogTrigger({ ...props }: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="screen-dialog-trigger" {...props} />;
}

function ScreenDialogPortal({ ...props }: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="screen-dialog-portal" {...props} />;
}

function ScreenDialogOverlay({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="screen-dialog-overlay"
      className={cn(
        'fixed inset-0 z-50 bg-[rgba(15,23,42,0.55)] backdrop-blur-[2px] transition-opacity duration-200 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0',
        className,
      )}
      {...props}
    />
  );
}

type ScreenDialogContentProps = React.ComponentProps<typeof DialogPrimitive.Content> & {
  hideCloseButton?: boolean;
};

function ScreenDialogContent({ className, children, hideCloseButton = false, ...props }: ScreenDialogContentProps) {
  return (
    <ScreenDialogPortal>
      <ScreenDialogOverlay />
      <DialogPrimitive.Content
        data-slot="screen-dialog-content"
        className={cn(
          'fixed left-1/2 top-1/2 z-50 w-full max-w-[480px] -translate-x-1/2 -translate-y-1/2 rounded-[18px] border border-[var(--agyn-border-subtle)] bg-white p-6 shadow-[0px_32px_72px_-24px_rgba(15,23,42,0.55)] focus:outline-hidden data-[state=open]:animate-in data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:zoom-out-95',
          className,
        )}
        {...props}
      >
        {children}
        {!hideCloseButton ? (
          <DialogPrimitive.Close className="absolute right-6 top-6 inline-flex size-8 items-center justify-center rounded-full text-[var(--agyn-gray)] transition-colors hover:bg-[var(--agyn-bg-light)] hover:text-[var(--agyn-dark)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[var(--agyn-blue)] focus-visible:ring-offset-2">
            <X className="size-4" />
            <span className="sr-only">Close dialog</span>
          </DialogPrimitive.Close>
        ) : null}
      </DialogPrimitive.Content>
    </ScreenDialogPortal>
  );
}

function ScreenDialogHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div className={cn('flex flex-col gap-2', className)} data-slot="screen-dialog-header" {...props} />
  );
}

function ScreenDialogFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3', className)}
      data-slot="screen-dialog-footer"
      {...props}
    />
  );
}

function ScreenDialogTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="screen-dialog-title"
      className={cn('text-lg font-semibold text-[var(--agyn-dark)]', className)}
      {...props}
    />
  );
}

function ScreenDialogDescription({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="screen-dialog-description"
      className={cn('text-sm text-[var(--agyn-text-subtle)]', className)}
      {...props}
    />
  );
}

export {
  ScreenDialog,
  ScreenDialogContent,
  ScreenDialogDescription,
  ScreenDialogFooter,
  ScreenDialogHeader,
  ScreenDialogOverlay,
  ScreenDialogPortal,
  ScreenDialogTitle,
  ScreenDialogTrigger,
};
