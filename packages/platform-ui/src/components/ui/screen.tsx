"use client";

import * as React from "react";

import { cn } from "./utils";
import { Tabs } from "./tabs";

type DivProps = React.HTMLAttributes<HTMLDivElement>;

type HeadingProps = React.HTMLAttributes<HTMLHeadingElement>;

type ParagraphProps = React.HTMLAttributes<HTMLParagraphElement>;

const Screen = React.forwardRef<HTMLDivElement, DivProps>(function Screen(
  { className, ...props },
  ref,
) {
  return (
    <section
      ref={ref}
      data-slot="screen"
      className={cn(
        "bg-background text-foreground flex h-full min-h-0 flex-1 flex-col overflow-hidden",
        className,
      )}
      {...props}
    />
  );
});

const ScreenHeader = React.forwardRef<HTMLDivElement, DivProps>(function ScreenHeader(
  { className, ...props },
  ref,
) {
  return (
    <header
      ref={ref}
      data-slot="screen-header"
      className={cn(
        "border-border/60 bg-background px-8 py-6 shadow-sm shadow-black/0 border-b",
        className,
      )}
      {...props}
    />
  );
});

const ScreenHeaderContent = React.forwardRef<HTMLDivElement, DivProps>(
  function ScreenHeaderContent({ className, ...props }, ref) {
    return (
      <div
        ref={ref}
        data-slot="screen-header-content"
        className={cn("flex flex-col gap-1.5", className)}
        {...props}
      />
    );
  },
);

const ScreenTitle = React.forwardRef<HTMLHeadingElement, HeadingProps>(
  function ScreenTitle({ className, ...props }, ref) {
    return (
      <h1
        ref={ref}
        data-slot="screen-title"
        className={cn(
          "text-foreground text-2xl font-semibold leading-tight tracking-tight",
          className,
        )}
        {...props}
      />
    );
  },
);

const ScreenDescription = React.forwardRef<HTMLParagraphElement, ParagraphProps>(
  function ScreenDescription({ className, ...props }, ref) {
    return (
      <p
        ref={ref}
        data-slot="screen-description"
        className={cn("text-muted-foreground text-sm", className)}
        {...props}
      />
    );
  },
);

const ScreenActions = React.forwardRef<HTMLDivElement, DivProps>(function ScreenActions(
  { className, ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      data-slot="screen-actions"
      className={cn("flex flex-wrap items-center gap-2", className)}
      {...props}
    />
  );
});

const ScreenBody = React.forwardRef<HTMLDivElement, DivProps>(function ScreenBody(
  { className, ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      data-slot="screen-body"
      className={cn(
        "flex flex-1 min-h-0 flex-col gap-6 overflow-hidden px-8 pb-10 pt-6",
        className,
      )}
      {...props}
    />
  );
});

const ScreenTabs = ({ className, ...props }: React.ComponentProps<typeof Tabs>) => (
  <Tabs className={cn("flex flex-1 flex-col gap-6", className)} {...props} />
);

const ScreenContent = React.forwardRef<HTMLDivElement, DivProps>(function ScreenContent(
  { className, ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      data-slot="screen-content"
      className={cn("flex flex-1 flex-col gap-6", className)}
      {...props}
    />
  );
});

export {
  Screen,
  ScreenActions,
  ScreenBody,
  ScreenContent,
  ScreenDescription,
  ScreenHeader,
  ScreenHeaderContent,
  ScreenTabs,
  ScreenTitle,
};
