import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react';
import { Check, ChevronDown, ChevronUp, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface MultiSelectDropdownOption {
  value: string;
  label: string;
}

export interface MultiSelectDropdownProps {
  id?: string;
  className?: string;
  value: string[];
  options: MultiSelectDropdownOption[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  helperText?: ReactNode;
  'aria-label'?: string;
  'aria-labelledby'?: string;
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => typeof value === 'string' && value.length > 0)));
}

export function MultiSelectDropdown({
  id,
  className,
  value,
  options,
  onChange,
  placeholder = 'Select options',
  disabled = false,
  helperText,
  ...ariaProps
}: MultiSelectDropdownProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLDivElement | null>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [open, setOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);

  optionRefs.current = optionRefs.current.slice(0, options.length);

  const normalizedValues = useMemo(() => unique(value), [value]);
  const selectedSet = useMemo(() => new Set(normalizedValues), [normalizedValues]);
  const chips = useMemo(() => {
    return normalizedValues
      .map((current) => {
        const option = options.find((candidate) => candidate.value === current);
        return { value: current, label: option?.label ?? current };
      })
      .filter((chip) => chip.value.length > 0);
  }, [normalizedValues, options]);

  const listboxId = id ? `${id}-listbox` : undefined;

  const closeDropdown = () => {
    setOpen(false);
    setFocusedIndex(-1);
  };

  const openDropdown = () => {
    if (disabled || options.length === 0) return;
    setOpen(true);
    setFocusedIndex((current) => (current >= 0 ? current : 0));
  };

  const toggleOption = (optionValue: string) => {
    if (disabled) return;
    const nextValues = selectedSet.has(optionValue)
      ? normalizedValues.filter((current) => current !== optionValue)
      : [...normalizedValues, optionValue];
    onChange(nextValues);
  };

  const handleChipRemove = (optionValue: string, event?: ReactMouseEvent<HTMLButtonElement>) => {
    event?.stopPropagation();
    if (disabled) return;
    onChange(normalizedValues.filter((current) => current !== optionValue));
  };

  const focusOption = (nextIndex: number) => {
    if (options.length === 0) return;
    const boundedIndex = (nextIndex + options.length) % options.length;
    setFocusedIndex(boundedIndex);
  };

  const handleTriggerKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;

    if (event.key === 'Backspace' && !open && normalizedValues.length > 0) {
      event.preventDefault();
      const lastValue = normalizedValues[normalizedValues.length - 1];
      onChange(normalizedValues.filter((current) => current !== lastValue));
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!open) {
        openDropdown();
      } else {
        focusOption((focusedIndex >= 0 ? focusedIndex : -1) + 1);
      }
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) {
        openDropdown();
      } else {
        focusOption((focusedIndex >= 0 ? focusedIndex : 0) - 1);
      }
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (!open) {
        openDropdown();
      } else if (focusedIndex >= 0) {
        toggleOption(options[focusedIndex].value);
      }
      return;
    }

    if (event.key === 'Escape') {
      if (open) {
        event.preventDefault();
        closeDropdown();
        triggerRef.current?.focus();
      }
    }
  };

  useEffect(() => {
    if (!open) return;

    const handleClick = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        closeDropdown();
      }
    };

    const handleFocus = (event: FocusEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        closeDropdown();
      }
    };

    document.addEventListener('mousedown', handleClick);
    document.addEventListener('focusin', handleFocus);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('focusin', handleFocus);
    };
  }, [open]);

  useEffect(() => {
    if (!open || focusedIndex < 0) return;
    const target = optionRefs.current[focusedIndex];
    if (target && typeof target.scrollIntoView === 'function') {
      target.scrollIntoView({ block: 'nearest' });
    }
  }, [focusedIndex, open]);

  useEffect(() => {
    if (disabled) {
      closeDropdown();
    }
  }, [disabled]);

  const triggerClasses = cn(
    'min-h-[48px] w-full rounded-[10px] border border-[var(--agyn-border-subtle)] bg-white px-4 py-3 text-left text-sm text-[var(--agyn-dark)] focus:outline-none focus:ring-2 focus:ring-[var(--agyn-blue)]',
    disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
    open ? 'ring-2 ring-[var(--agyn-blue)] border-transparent' : '',
  );

  return (
    <div className={cn('space-y-2', className)} ref={containerRef}>
      <div
        id={id}
        ref={triggerRef}
        role="combobox"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled || undefined}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        className={triggerClasses}
        onClick={() => {
          if (disabled) return;
          setOpen((prev) => {
            const next = !prev;
            if (next && options.length > 0) {
              setFocusedIndex((current) => (current >= 0 ? current : 0));
            }
            if (!next) {
              setFocusedIndex(-1);
            }
            return next;
          });
        }}
        onKeyDown={handleTriggerKeyDown}
        {...ariaProps}
      >
        <div className="flex items-center gap-3">
          <div className="flex flex-1 flex-wrap items-center gap-2">
            {chips.length === 0 ? (
              <span className="text-sm text-[var(--agyn-gray)]">{placeholder}</span>
            ) : (
              chips.map((chip) => (
                <span
                  key={chip.value}
                  className="inline-flex items-center gap-1 rounded-full bg-[var(--agyn-bg-light)] px-3 py-1 text-xs text-[var(--agyn-dark)]"
                >
                  {chip.label}
                  <button
                    type="button"
                    aria-label={`Remove ${chip.label}`}
                    className="text-[var(--agyn-gray)] hover:text-[var(--agyn-dark)]"
                    onClick={(event) => handleChipRemove(chip.value, event)}
                    disabled={disabled}
                  >
                    <X className="h-3 w-3" aria-hidden />
                  </button>
                </span>
              ))
            )}
          </div>
          <span className="text-[var(--agyn-gray)]" aria-hidden>
            {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </span>
        </div>
      </div>

      {helperText ? <p className="text-xs text-[var(--agyn-text-subtle)]">{helperText}</p> : null}

      {open ? (
        <div className="relative">
          <div className="absolute left-0 right-0 z-50 mt-2 rounded-2xl border border-[var(--agyn-border-subtle)] bg-white shadow-lg">
            <ul
              id={listboxId}
              role="listbox"
              aria-multiselectable
              className="max-h-64 overflow-y-auto py-2"
            >
              {options.length === 0 ? (
                <li className="px-4 py-2 text-sm text-[var(--agyn-text-subtle)]">No options available.</li>
              ) : (
                options.map((option, index) => {
                  const selected = selectedSet.has(option.value);
                  const active = index === focusedIndex;
                  return (
                    <li key={option.value}>
                      <button
                        type="button"
                        ref={(element) => {
                          optionRefs.current[index] = element;
                        }}
                        className={cn(
                          'flex w-full items-center justify-between px-4 py-2 text-sm transition-colors',
                          active ? 'bg-[var(--agyn-bg-light)]' : 'bg-transparent',
                          selected ? 'text-[var(--agyn-blue)] font-medium' : 'text-[var(--agyn-dark)]',
                        )}
                        onMouseEnter={() => setFocusedIndex(index)}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={(event) => {
                          event.preventDefault();
                          toggleOption(option.value);
                        }}
                      >
                        <span>{option.label}</span>
                        {selected ? <Check className="h-4 w-4" aria-hidden /> : <span className="h-4 w-4" />}
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          </div>
        </div>
      ) : null}
    </div>
  );
}
