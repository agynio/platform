"use client";

import * as React from 'react';
import { Slash } from 'lucide-react';
import { cn } from '../utils/cn';

function Breadcrumb({ className, ...props }: React.HTMLAttributes<HTMLElement>) {
  return <nav aria-label="breadcrumb" className={cn('w-full', className)} {...props} />;
}

function BreadcrumbList({ className, ...props }: React.HTMLAttributes<HTMLOListElement>) {
  return <ol className={cn('flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground', className)} {...props} />;
}

function BreadcrumbItem({ className, ...props }: React.LiHTMLAttributes<HTMLLIElement>) {
  return <li className={cn('inline-flex items-center gap-1', className)} {...props} />;
}

function BreadcrumbLink({ className, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  return <a className={cn('transition-colors hover:text-foreground', className)} {...props} />;
}

function BreadcrumbPage({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return <span aria-current="page" className={cn('font-medium text-foreground', className)} {...props} />;
}

function BreadcrumbSeparator({ className, children, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span role="presentation" aria-hidden className={cn('text-muted-foreground/60', className)} {...props}>
      {children ?? <Slash className="size-3.5" />}
    </span>
  );
}

export { Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbLink, BreadcrumbPage, BreadcrumbSeparator };

