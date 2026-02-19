import { forwardRef, type ChangeEvent, type ReactNode, type SelectHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export type SelectOption = {
  value: string;
  label: ReactNode;
  disabled?: boolean;
};

export interface SelectGroup {
  label?: string;
  options: SelectOption[];
}

export interface SelectInputProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  label?: ReactNode;
  helperText?: ReactNode;
  error?: ReactNode;
  placeholder?: string;
  options?: SelectOption[];
  groups?: SelectGroup[];
  size?: 'sm' | 'default';
  htmlSize?: number;
  allowEmptyOption?: boolean;
  variant?: 'default' | 'flat';
  containerClassName?: string;
}

export const SelectInput = forwardRef<HTMLSelectElement, SelectInputProps>(function SelectInput(
  {
    label,
    helperText,
    error,
    placeholder,
    options = [],
    groups = [],
    size = 'default',
    className = '',
    containerClassName = '',
    allowEmptyOption = false,
    variant = 'default',
    value,
    disabled,
    onChange,
    defaultValue,
    htmlSize,
    ...props
  },
  ref,
) {
  const variantClasses =
    variant === 'flat'
      ? 'border-transparent bg-transparent px-0 py-0 h-auto shadow-none focus:ring-0 focus:border-transparent rounded-none'
      : 'rounded-[10px] border border-[var(--agyn-border-subtle)] bg-white';

  const sizeClasses =
    variant === 'flat'
      ? size === 'sm'
        ? 'text-sm'
        : 'text-base'
      : size === 'sm'
        ? 'h-10 px-3 text-sm'
        : 'px-4 py-3';

  const handleChange = (event: ChangeEvent<HTMLSelectElement>) => {
    onChange?.(event);
  };

  const selectProps =
    value !== undefined
      ? { value: value ?? '' }
      : defaultValue !== undefined
        ? { defaultValue }
        : placeholder
          ? { defaultValue: '' }
          : {};

  const hasGroups = groups.length > 0;

  return (
    <div className={cn('w-full', containerClassName)}>
      {label ? <label className="mb-2 block text-[var(--agyn-dark)]">{label}</label> : null}
      <select
        ref={ref}
        className={cn(
          'w-full text-[var(--agyn-dark)] focus:outline-none focus:ring-2 focus:ring-[var(--agyn-blue)] focus:border-transparent',
          'disabled:bg-[var(--agyn-bg-light)] disabled:cursor-not-allowed',
          error ? 'border-red-500 focus:ring-red-500' : '',
          variantClasses,
          sizeClasses,
          className,
        )}
        disabled={disabled}
        onChange={handleChange}
        size={htmlSize}
        {...selectProps}
        {...props}
      >
        {placeholder ? (
          <option value="" disabled={!allowEmptyOption} hidden={!allowEmptyOption}>
            {placeholder}
          </option>
        ) : null}
        {hasGroups
          ? groups.map((group, groupIndex) => (
              <optgroup key={group.label ?? groupIndex} label={group.label ?? ''}>
                {group.options.map((option) => (
                  <option key={option.value} value={option.value} disabled={option.disabled}>
                    {option.label}
                  </option>
                ))}
              </optgroup>
            ))
          : options.map((option) => (
              <option key={option.value} value={option.value} disabled={option.disabled}>
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
