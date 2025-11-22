import { ReactNode } from 'react';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from './ui/select';

interface DropdownOption {
  value: string;
  label: string;
}

interface DropdownGroup {
  label?: string;
  options: DropdownOption[];
}

interface DropdownProps {
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
}: DropdownProps) {
  return (
    <div className={`w-full ${className}`}>
      {label && (
        <label className="block mb-2 text-[var(--agyn-dark)]">
          {label}
        </label>
      )}

      <Select
        value={value}
        defaultValue={defaultValue}
        onValueChange={onValueChange}
        disabled={disabled}
      >
        <SelectTrigger
          size={size}
          className={`
            w-full
            ${variant === 'flat' 
              ? 'bg-transparent border-none shadow-none px-0 gap-1 h-auto text-[var(--agyn-dark)] hover:text-[var(--agyn-blue)]' 
              : `
                bg-white 
                border border-[var(--agyn-border-subtle)] 
                rounded-[10px]
                text-[var(--agyn-dark)]
                focus:outline-none focus:ring-2 focus:ring-[var(--agyn-blue)] focus:border-transparent
                disabled:bg-[var(--agyn-bg-light)] disabled:cursor-not-allowed
                ${error ? 'border-red-500 focus:ring-red-500' : ''}
                ${size === 'sm' ? 'px-3 !h-10' : 'px-4 py-3'}
              `
            }
          `}
        >
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        
        <SelectContent
          className="
            bg-white 
            border border-[var(--agyn-border-default)] 
            rounded-[10px]
            shadow-lg
          "
        >
          {/* Render groups if provided */}
          {groups.length > 0 ? (
            groups.map((group, groupIndex) => (
              <SelectGroup key={groupIndex}>
                {group.label && (
                  <SelectLabel className="text-[var(--agyn-gray)] px-3 py-2">
                    {group.label}
                  </SelectLabel>
                )}
                {group.options.map((option) => (
                  <SelectItem
                    key={option.value}
                    value={option.value}
                    className="
                      px-3 py-2
                      !text-[var(--agyn-dark)]
                      data-[highlighted]:bg-[var(--agyn-bg-light)]
                      data-[highlighted]:!text-[var(--agyn-dark)]
                      focus:bg-[var(--agyn-bg-light)]
                      focus:!text-[var(--agyn-dark)]
                      cursor-pointer
                      rounded-[6px]
                    "
                  >
                    {option.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            ))
          ) : (
            /* Render flat options */
            options.map((option) => (
              <SelectItem
                key={option.value}
                value={option.value}
                className="
                  px-3 py-2
                  !text-[var(--agyn-dark)]
                  data-[highlighted]:bg-[var(--agyn-bg-light)]
                  data-[highlighted]:!text-[var(--agyn-dark)]
                  focus:bg-[var(--agyn-bg-light)]
                  focus:!text-[var(--agyn-dark)]
                  cursor-pointer
                  rounded-[6px]
                "
              >
                {option.label}
              </SelectItem>
            ))
          )}
        </SelectContent>
      </Select>

      {error && (
        <p className="mt-2 text-sm text-red-500">{error}</p>
      )}

      {helperText && !error && (
        <p className="mt-2 text-sm text-[var(--agyn-gray)]">{helperText}</p>
      )}
    </div>
  );
}