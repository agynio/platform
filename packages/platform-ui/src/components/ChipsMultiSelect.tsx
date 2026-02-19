import { useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ChipsMultiSelectOption {
  value: string;
  label: string;
  description?: ReactNode;
}

export interface ChipsMultiSelectProps {
  id?: string;
  label?: ReactNode;
  helperText?: ReactNode;
  placeholder?: string;
  value: string[];
  options: ChipsMultiSelectOption[];
  disabled?: boolean;
  onChange: (next: string[]) => void;
  className?: string;
  inputAriaLabel?: string;
  'aria-describedby'?: string;
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => typeof value === 'string' && value.length > 0)));
}

export function ChipsMultiSelect({
  id,
  label,
  helperText,
  placeholder = 'Search or select',
  value,
  options,
  disabled = false,
  onChange,
  className,
  inputAriaLabel = 'Filter options',
  ...rest
}: ChipsMultiSelectProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState('');

  const normalizedValues = useMemo(() => unique(value), [value]);
  const selectedSet = useMemo(() => new Set(normalizedValues), [normalizedValues]);

  const filteredOptions = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) {
      return options;
    }
    return options.filter((option) => option.label.toLowerCase().includes(trimmed));
  }, [options, query]);

  const chips = useMemo(() => {
    return normalizedValues
      .map((current) => {
        const option = options.find((candidate) => candidate.value === current);
        return { value: current, label: option?.label ?? current };
      })
      .filter((chip) => chip.value.length > 0);
  }, [normalizedValues, options]);

  const listboxId = id ? `${id}-options` : undefined;

  const handleToggle = (nextValue: string) => {
    if (disabled) return;
    onChange(
      selectedSet.has(nextValue)
        ? normalizedValues.filter((current) => current !== nextValue)
        : [...normalizedValues, nextValue],
    );
    setQuery('');
    inputRef.current?.focus();
  };

  const handleRemove = (nextValue: string) => {
    if (disabled) return;
    onChange(normalizedValues.filter((current) => current !== nextValue));
    inputRef.current?.focus();
  };

  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Backspace' && query.length === 0 && normalizedValues.length > 0) {
      event.preventDefault();
      const lastValue = normalizedValues[normalizedValues.length - 1];
      handleRemove(lastValue);
      return;
    }

    if ((event.key === 'Enter' || event.key === 'Tab') && filteredOptions.length > 0) {
      const nextOption = filteredOptions.find((option) => !selectedSet.has(option.value));
      if (nextOption) {
        event.preventDefault();
        handleToggle(nextOption.value);
      }
    }
  };

  return (
    <div className={cn('space-y-2', className)}>
      {label ? (
        <label htmlFor={id} className="text-sm font-medium text-[var(--agyn-dark)]">
          {label}
        </label>
      ) : null}
      <div
        className={cn(
          'rounded-[10px] border border-[var(--agyn-border-subtle)] bg-white p-2 shadow-none focus-within:ring-2 focus-within:ring-[var(--agyn-blue)]',
          disabled ? 'opacity-60' : 'opacity-100',
        )}
        onClick={() => inputRef.current?.focus()}
      >
        <div className="flex flex-wrap items-center gap-1">
          {chips.map((chip) => (
            <span
              key={chip.value}
              className="inline-flex items-center gap-1 rounded-full bg-[var(--agyn-bg-light)] px-3 py-1 text-xs text-[var(--agyn-dark)]"
            >
              {chip.label}
              <button
                type="button"
                className="text-[var(--agyn-gray)] hover:text-[var(--agyn-dark)]"
                aria-label={`Remove ${chip.label}`}
                onClick={(event) => {
                  event.stopPropagation();
                  handleRemove(chip.value);
                }}
                disabled={disabled}
              >
                <X className="h-3 w-3" aria-hidden />
              </button>
            </span>
          ))}
          <input
            id={id}
            ref={inputRef}
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder={chips.length === 0 ? placeholder : undefined}
            className="flex-1 min-w-[120px] border-0 bg-transparent p-1 text-sm text-[var(--agyn-dark)] outline-none"
            disabled={disabled}
            aria-label={inputAriaLabel}
            aria-controls={listboxId}
            {...rest}
          />
        </div>
      </div>
      {helperText ? <p className="text-xs text-[var(--agyn-text-subtle)]">{helperText}</p> : null}
      <ul
        id={listboxId}
        role="listbox"
        aria-multiselectable
        className="flex flex-wrap gap-2 rounded-lg border border-dashed border-[var(--agyn-border-subtle)] bg-[var(--agyn-bg-light)]/40 p-3"
      >
        {filteredOptions.length === 0 ? (
          <li className="text-sm text-[var(--agyn-text-subtle)]">No matches found.</li>
        ) : (
          filteredOptions.map((option) => {
            const selected = selectedSet.has(option.value);
            return (
              <li key={option.value}>
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => handleToggle(option.value)}
                  disabled={disabled}
                  className={cn(
                    'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                    selected
                      ? 'border-[var(--agyn-blue)] bg-[var(--agyn-blue)]/10 text-[var(--agyn-blue)]'
                      : 'border-[var(--agyn-border-subtle)] bg-white text-[var(--agyn-dark)] hover:border-[var(--agyn-blue)]',
                  )}
                >
                  {option.label}
                </button>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}
