import * as React from 'react';
import { cn } from '../utils/cn';

export interface CardProps extends React.ComponentPropsWithoutRef<'div'> {
  variant?: 'standard' | 'elevated' | 'subtle' | 'highlighted';
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant = 'standard', ...props }, ref) => {
    const base = 'rounded-lg border bg-card text-card-foreground';
    const variants: Record<NonNullable<CardProps['variant']>, string> = {
      standard: 'border-border shadow-xs',
      elevated: 'border-border shadow-md',
      subtle: 'border-border bg-muted',
      highlighted: 'border-2 border-primary',
    };
    return <div ref={ref} className={cn(base, variants[variant], className)} {...props} />;
  }
);
Card.displayName = 'Card';

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col space-y-1.5 p-6', className)} {...props} />;
}
export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn('text-lg font-semibold leading-none tracking-tight', className)} {...props} />;
}
export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-sm text-muted-foreground', className)} {...props} />;
}
export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-6 pt-0', className)} {...props} />;
}
export function CardFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex items-center p-6 pt-0', className)} {...props} />;
}
