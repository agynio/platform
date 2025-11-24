import { useState, useRef, useEffect, InputHTMLAttributes, ReactNode } from 'react';
import { Loader2, X } from 'lucide-react';

export interface AutocompleteOption {
  value: string;
  label: string;
}

interface AutocompleteInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size' | 'onChange'> {
  label?: string;
  error?: string;
  helperText?: string;
  size?: 'sm' | 'default';
  value: string;
  onChange: (value: string) => void;
  onSelect?: (option: AutocompleteOption) => void;
  fetchOptions: (query: string) => Promise<AutocompleteOption[]>;
  debounceMs?: number;
  minChars?: number;
  clearable?: boolean;
  leftIcon?: ReactNode;
}

export function AutocompleteInput({
  label,
  error,
  helperText,
  size = 'default',
  className = '',
  value,
  onChange,
  onSelect,
  fetchOptions,
  debounceMs = 300,
  minChars = 0,
  clearable = false,
  disabled,
  placeholder,
  leftIcon,
  ...props
}: AutocompleteInputProps) {
  const [options, setOptions] = useState<AutocompleteOption[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [hasInteracted, setHasInteracted] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout>();

  const paddingClasses = size === 'sm' ? 'px-3 py-2' : 'px-4 py-3';
  const heightClasses = size === 'sm' ? 'h-10' : 'h-auto';
  const iconLeftPadding = size === 'sm' ? 'pl-9' : 'pl-12';
  const iconLeftPosition = size === 'sm' ? 'left-3' : 'left-4';

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        inputRef.current &&
        !inputRef.current.contains(event.target as Node) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  useEffect(() => {
    // Only fetch if user has interacted with the input
    if (!hasInteracted) return;

    if (value.length >= minChars) {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      debounceTimerRef.current = setTimeout(async () => {
        setIsLoading(true);
        try {
          const results = await fetchOptions(value);
          setOptions(results);
          setIsOpen(true);
          setHighlightedIndex(0);
        } catch (err) {
          console.error('Error fetching autocomplete options:', err);
          setOptions([]);
        } finally {
          setIsLoading(false);
        }
      }, debounceMs);
    } else {
      setOptions([]);
      setIsOpen(false);
    }

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [value, fetchOptions, debounceMs, minChars, hasInteracted]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value);
    setHasInteracted(true);
  };

  const handleSelectOption = (option: AutocompleteOption) => {
    onChange(option.value);
    onSelect?.(option);
    setIsOpen(false);
    setHasInteracted(false); // Reset to prevent triggering search on programmatic value change
    inputRef.current?.focus();
  };

  const handleClear = () => {
    onChange('');
    setIsOpen(false);
    setHasInteracted(false); // Reset to prevent triggering search when clearing
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen || options.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex((prev) => (prev < options.length - 1 ? prev + 1 : prev));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : prev));
        break;
      case 'Enter':
        e.preventDefault();
        if (options[highlightedIndex]) {
          handleSelectOption(options[highlightedIndex]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        break;
    }
  };

  useEffect(() => {
    if (isOpen && dropdownRef.current) {
      const highlighted = dropdownRef.current.querySelector('[data-highlighted="true"]');
      if (highlighted) {
        highlighted.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [highlightedIndex, isOpen]);

  return (
    <div className="w-full relative">
      {label && (
        <label className="block mb-2 text-[var(--agyn-dark)]">
          {label}
        </label>
      )}

      <div className="relative">
        {/* Left Icon */}
        {leftIcon && (
          <div className={`absolute ${iconLeftPosition} top-1/2 -translate-y-1/2 text-[var(--agyn-gray)]`}>
            {leftIcon}
          </div>
        )}

        <input
          ref={inputRef}
          type="text"
          className={`
            w-full ${paddingClasses} ${heightClasses}
            bg-white 
            border border-[var(--agyn-border-subtle)] 
            rounded-[10px] 
            text-[var(--agyn-dark)]
            placeholder:text-[var(--agyn-gray)]
            focus:outline-none focus:ring-2 focus:ring-[var(--agyn-blue)] focus:border-transparent
            disabled:bg-[var(--agyn-bg-light)] disabled:cursor-not-allowed
            ${error ? 'border-red-500 focus:ring-red-500' : ''}
            ${leftIcon ? iconLeftPadding : ''}
            ${isLoading || (clearable && value) ? 'pr-10' : ''}
            ${className}
          `}
          value={value}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={placeholder}
          autoComplete="off"
          {...props}
        />

        {/* Loading Spinner or Clear Button */}
        {!disabled && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
            {isLoading && (
              <Loader2 className="w-4 h-4 text-[var(--agyn-gray)] animate-spin" />
            )}
            {!isLoading && clearable && value && (
              <button
                type="button"
                onClick={handleClear}
                className="text-[var(--agyn-gray)] hover:text-[var(--agyn-dark)] transition-colors"
                tabIndex={-1}
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        )}

        {/* Dropdown */}
        {isOpen && options.length > 0 && !disabled && (
          <div
            ref={dropdownRef}
            className="absolute z-50 w-full mt-2 bg-white border border-[var(--agyn-border-default)] rounded-[10px] shadow-lg max-h-[300px] overflow-hidden"
          >
            <div className="p-1 max-h-[300px] overflow-auto">
              {options.map((option, index) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => handleSelectOption(option)}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  data-highlighted={index === highlightedIndex}
                  className={`
                    w-full text-left px-3 py-2 transition-colors cursor-pointer rounded-[6px]
                    ${index === highlightedIndex 
                      ? 'bg-[var(--agyn-bg-light)] text-[var(--agyn-dark)]' 
                      : 'text-[var(--agyn-dark)] hover:bg-[var(--agyn-bg-light)]'
                    }
                  `}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {error && (
        <p className="mt-2 text-sm text-red-500">{error}</p>
      )}

      {helperText && !error && (
        <p className="mt-2 text-sm text-[var(--agyn-gray)]">{helperText}</p>
      )}
    </div>
  );
}