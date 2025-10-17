"use client";

import * as React from 'react';
import { Drawer } from './drawer';
import { cn } from '../utils/cn';

// Minimal, composed Sidebar with optional mobile drawer behavior provided by consumer using Drawer.

function Sidebar({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex h-full w-64 flex-col border-r bg-sidebar text-sidebar-foreground', className)} {...props} />;
}

function SidebarHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex items-center gap-2 border-b px-4 py-3', className)} {...props} />;
}
function SidebarFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('mt-auto border-t px-4 py-3', className)} {...props} />;
}
function SidebarContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex-1 overflow-auto px-2 py-2', className)} {...props} />;
}
function SidebarGroup({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-2 py-2', className)} {...props} />;
}
function SidebarGroupLabel({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-2 py-1 text-xs font-medium text-muted-foreground', className)} {...props} />;
}
function SidebarGroupContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('mt-1 space-y-1', className)} {...props} />;
}
function SidebarMenu({ className, ...props }: React.HTMLAttributes<HTMLUListElement>) {
  return <ul className={cn('flex flex-col gap-1', className)} {...props} />;
}
function SidebarMenuItem({ className, ...props }: React.LiHTMLAttributes<HTMLLIElement>) {
  return <li className={cn('', className)} {...props} />;
}
function SidebarMenuButton({ className, isActive, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { isActive?: boolean }) {
  return (
    <button
      className={cn('inline-flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring/50', isActive && 'bg-sidebar-accent text-sidebar-accent-foreground', className)}
      {...props}
    />
  );
}

export {
  Sidebar,
  SidebarHeader,
  SidebarFooter,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton
};

