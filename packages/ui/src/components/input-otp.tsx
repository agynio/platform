"use client";

import * as React from 'react';
import { OTPInput, OTPInputContext } from 'input-otp';
import { cn } from '../utils/cn';

function InputOTP({ className, containerClassName, ...props }: React.ComponentProps<typeof OTPInput> & { containerClassName?: string }) {
  return <OTPInput className={cn('flex items-center gap-2 has-[:disabled]:opacity-50', containerClassName)} {...props} />;
}

function InputOTPSlot({ className, index, ...props }: React.HTMLAttributes<HTMLDivElement> & { index: number }) {
  const inputOTP = React.useContext(OTPInputContext);
  const { char, hasFakeCaret, isActive } = inputOTP.slots[index];
  return (
    <div className={cn('relative flex size-10 items-center justify-center rounded-md border bg-background text-sm shadow-xs', isActive && 'ring-2 ring-ring/50', className)} {...props}>
      {char}
      {hasFakeCaret ? <div className="pointer-events-none absolute inset-0 flex items-center justify-center"><div className="h-4 w-px animate-caret-blink bg-foreground" /></div> : null}
    </div>
  );
}

function InputOTPSeparator({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div role="separator" aria-hidden className={cn('flex w-4 justify-center text-muted-foreground', className)} {...props}>
      •
    </div>
  );
}

export { InputOTP, InputOTPSlot, InputOTPSeparator };
