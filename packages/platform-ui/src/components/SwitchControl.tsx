import * as SwitchPrimitive from '@radix-ui/react-switch';
import { forwardRef, type ElementRef } from 'react';
import { cn } from '@/lib/utils';

export type SwitchControlProps = React.ComponentProps<typeof SwitchPrimitive.Root>;

type SwitchElement = ElementRef<typeof SwitchPrimitive.Root>;

export const SwitchControl = forwardRef<SwitchElement, SwitchControlProps>(function SwitchControl(
  { className, ...props },
  ref,
) {
  return (
    <SwitchPrimitive.Root
      ref={ref}
      className={cn(
        'inline-flex h-5 w-10 shrink-0 items-center rounded-full border border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--agyn-blue)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-[var(--agyn-blue)] data-[state=unchecked]:bg-[var(--agyn-border-default)]',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          'pointer-events-none block size-4 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-1',
        )}
      />
    </SwitchPrimitive.Root>
  );
});
