import type { ChangeEvent, SelectHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';
import { SelectInput, type SelectGroup, type SelectOption } from './SelectInput';

type NativeSelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size' | 'value' | 'defaultValue' | 'onChange'>;

interface DropdownOption extends SelectOption {
  label: string;
}

interface DropdownGroup extends Omit<SelectGroup, 'label'> {
  label?: string;
  options: DropdownOption[];
}

interface DropdownProps extends NativeSelectProps {
  label?: string;
  placeholder?: string;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  options?: DropdownOption[];
  groups?: DropdownGroup[];
  error?: string;
  helperText?: string;
  size?: 'sm' | 'default';
  variant?: 'default' | 'flat';
  disabled?: boolean;
  className?: string;
  triggerClassName?: string;
  allowEmptyOption?: boolean;
  onChange?: (event: ChangeEvent<HTMLSelectElement>) => void;
}

export function Dropdown({
  label,
  placeholder = 'Select an option...',
  value,
  defaultValue,
  onValueChange,
  options = [],
  groups = [],
  error,
  helperText,
  size = 'default',
  variant = 'default',
  disabled = false,
  className = '',
  triggerClassName = '',
  allowEmptyOption = false,
  onBlur,
  onFocus,
  onChange,
  ...selectProps
}: DropdownProps) {
  const handleChange = (event: ChangeEvent<HTMLSelectElement>) => {
    onChange?.(event);
    onValueChange?.(event.target.value);
  };

  return (
    <SelectInput
      label={label}
      placeholder={placeholder}
      value={value}
      defaultValue={defaultValue}
      onChange={handleChange}
      options={groups.length > 0 ? [] : options}
      groups={groups}
      error={error}
      helperText={helperText}
      size={size}
      variant={variant}
      disabled={disabled}
      allowEmptyOption={allowEmptyOption}
      className={cn(
        triggerClassName,
        variant === 'flat'
          ? 'text-[var(--agyn-dark)] hover:text-[var(--agyn-blue)] focus-visible:ring-0 focus:ring-0 focus:border-transparent'
          : undefined,
      )}
      containerClassName={cn('w-full', className)}
      onBlur={onBlur}
      onFocus={onFocus}
      {...selectProps}
    />
  );
}
