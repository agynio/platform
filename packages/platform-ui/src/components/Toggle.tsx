import * as SwitchPrimitive from '@radix-ui/react-switch';
import { cn } from './ui/utils';

interface ToggleProps {
  label?: string;
  description?: string;
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
  size?: 'sm' | 'default';
  className?: string;
  id?: string;
}

export function Toggle({
  label,
  description,
  checked,
  defaultChecked,
  onCheckedChange,
  disabled = false,
  size = 'default',
  className = '',
  id,
}: ToggleProps) {
  const toggleId = id || `toggle-${Math.random().toString(36).substring(2, 9)}`;

  return (
    <div className={cn('flex items-start gap-3', className)}>
      <SwitchPrimitive.Root
        id={toggleId}
        checked={checked}
        defaultChecked={defaultChecked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        className={cn(
          'inline-flex shrink-0 items-center rounded-full border border-transparent transition-all outline-none',
          'focus-visible:ring-[3px] focus-visible:ring-[var(--agyn-blue)]/30',
          'disabled:cursor-not-allowed disabled:opacity-50',
          'data-[state=checked]:bg-[var(--agyn-blue)]',
          'data-[state=unchecked]:bg-[var(--agyn-border-default)]',
          'mt-0.5',
          size === 'sm' ? 'w-8 h-4' : 'w-10 h-5',
        )}
      >
        <SwitchPrimitive.Thumb
          className={cn(
            'pointer-events-none block rounded-full bg-white ring-0 transition-transform',
            'data-[state=unchecked]:translate-x-0.5',
            size === 'sm' 
              ? 'size-3 data-[state=checked]:translate-x-[18px]'
              : 'size-4 data-[state=checked]:translate-x-5',
          )}
        />
      </SwitchPrimitive.Root>
      
      {(label || description) && (
        <div className="flex-1">
          {label && (
            <label
              htmlFor={toggleId}
              className={cn(
                'block text-[var(--agyn-dark)] cursor-pointer',
                disabled && 'opacity-50 cursor-not-allowed',
              )}
            >
              {label}
            </label>
          )}
          {description && (
            <p
              className={cn(
                'text-sm text-[var(--agyn-gray)] mt-1',
                disabled && 'opacity-50',
              )}
            >
              {description}
            </p>
          )}
        </div>
      )}
    </div>
  );
}