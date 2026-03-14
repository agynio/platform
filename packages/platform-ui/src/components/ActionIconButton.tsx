import { type ButtonHTMLAttributes, type ReactNode } from 'react';
import * as Tooltip from '@radix-ui/react-tooltip';

import { cn } from '@/lib/utils';

type ActionIconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: ReactNode;
  label: string;
  tooltip?: string;
  variant?: 'default' | 'danger';
  delayDuration?: number;
};

const baseClasses =
  'w-8 h-8 flex items-center justify-center rounded-md text-[var(--agyn-text-subtle)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed';

const variantClasses: Record<NonNullable<ActionIconButtonProps['variant']>, string> = {
  default: 'hover:bg-[var(--agyn-bg-light)] hover:text-[var(--agyn-blue)]',
  danger: 'hover:bg-[var(--agyn-status-failed)]/10 hover:text-[var(--agyn-status-failed)]',
};

export function ActionIconButton({
  icon,
  label,
  tooltip,
  variant = 'default',
  delayDuration = 300,
  className = '',
  type,
  ...props
}: ActionIconButtonProps) {
  const tooltipLabel = tooltip ?? label;

  return (
    <Tooltip.Provider delayDuration={delayDuration}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <button
            type={type ?? 'button'}
            aria-label={label}
            className={cn(baseClasses, variantClasses[variant], className)}
            {...props}
          >
            {icon}
          </button>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            className="bg-[var(--agyn-dark)] text-white text-xs px-2 py-1 rounded-md z-50"
            sideOffset={5}
          >
            {tooltipLabel}
            <Tooltip.Arrow className="fill-[var(--agyn-dark)]" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}
