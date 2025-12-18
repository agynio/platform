import { forwardRef, type ReactNode, type SelectHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

type SelectOption = {
  value: string;
  label: ReactNode;
};

interface SelectInputProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  label?: ReactNode;
  helperText?: ReactNode;
  error?: ReactNode;
  placeholder?: string;
  options: SelectOption[];
  size?: 'sm' | 'default';
  allowEmptyOption?: boolean;
}

export const SelectInput = forwardRef<HTMLSelectElement, SelectInputProps>(function SelectInput(
  {
    label,
    helperText,
    error,
    placeholder,
    options,
    size = 'default',
    className = '',
    allowEmptyOption = false,
    value,
    ...props
  },
  ref,
) {
  const sizeClasses = size === 'sm' ? 'h-10 px-3 text-sm' : 'px-4 py-3';

  return (
    <div className="w-full">
      {label ? <label className="mb-2 block text-[var(--agyn-dark)]">{label}</label> : null}
      <select
        ref={ref}
        className={cn(
          'w-full rounded-[10px] border border-[var(--agyn-border-subtle)] bg-white text-[var(--agyn-dark)]',
          'focus:outline-none focus:ring-2 focus:ring-[var(--agyn-blue)] focus:border-transparent',
          'disabled:bg-[var(--agyn-bg-light)] disabled:cursor-not-allowed',
          error ? 'border-red-500 focus:ring-red-500' : '',
          sizeClasses,
          className,
        )}
        value={value ?? ''}
        {...props}
      >
        {placeholder ? (
          <option value="" disabled={!allowEmptyOption} hidden={!allowEmptyOption}>
            {placeholder}
          </option>
        ) : null}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error ? <p className="mt-2 text-sm text-red-500">{error}</p> : null}
      {!error && helperText ? (
        <p className="mt-2 text-sm text-[var(--agyn-gray)]">{helperText}</p>
      ) : null}
    </div>
  );
});
