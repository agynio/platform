import {
  type ChangeEvent,
  type FocusEvent,
  type InputHTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Type, Lock, Variable } from 'lucide-react';
import { SegmentedControl } from './SegmentedControl';

type SourceType = 'text' | 'secret' | 'variable';

interface ReferenceInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string;
  error?: string;
  helperText?: string;
  rightIcon?: ReactNode;
  size?: 'sm' | 'default';
  sourceType?: SourceType;
  onSourceTypeChange?: (type: SourceType) => void;
  secretKeys?: string[];
  variableKeys?: string[];
}

export function ReferenceInput({
  label,
  error,
  helperText,
  rightIcon,
  size = 'default',
  sourceType: controlledSourceType,
  onSourceTypeChange,
  className = '',
  secretKeys = [],
  variableKeys = [],
  onFocus,
  onChange,
  onKeyDown,
  ...inputProps
}: ReferenceInputProps) {
  const [internalSourceType, setInternalSourceType] = useState<SourceType>('text');
  const sourceType = controlledSourceType ?? internalSourceType;
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [filterValue, setFilterValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { disabled, id, ...restInputProps } = inputProps;

  const handleSourceTypeChange = (value: string) => {
    const newType = value as SourceType;
    if (onSourceTypeChange) {
      onSourceTypeChange(newType);
    } else {
      setInternalSourceType(newType);
    }
    if (!disabled) {
      inputRef.current?.focus();
      if (newType === 'secret' && secretKeys.length > 0) {
        setShowAutocomplete(true);
        setSelectedIndex(-1);
      } else if (newType === 'variable' && variableKeys.length > 0) {
        setShowAutocomplete(true);
        setSelectedIndex(-1);
      } else {
        setShowAutocomplete(false);
      }
    }
  };

  // Filter keys based on input value
  const normalizedFilter = filterValue.trim().toLowerCase();
  const baseKeys = sourceType === 'secret' ? secretKeys : sourceType === 'variable' ? variableKeys : [];
  const filteredKeys = normalizedFilter.length === 0
    ? baseKeys
    : baseKeys.filter((key) => key.toLowerCase().includes(normalizedFilter));

  // Handle click outside to close autocomplete
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setShowAutocomplete(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const inputElement = inputRef.current;
    if (!inputElement) return;
    if (document.activeElement !== inputElement) return;
    if (sourceType === 'secret' && secretKeys.length > 0) {
      setShowAutocomplete(true);
      setSelectedIndex(-1);
    } else if (sourceType === 'variable' && variableKeys.length > 0) {
      setShowAutocomplete(true);
      setSelectedIndex(-1);
    }
  }, [secretKeys, variableKeys, sourceType]);

  const handleInputFocus = (event: FocusEvent<HTMLInputElement>) => {
    onFocus?.(event);
    setFilterValue('');
    if (sourceType === 'secret' && secretKeys.length > 0) {
      setShowAutocomplete(true);
      setSelectedIndex(-1);
    } else if (sourceType === 'variable' && variableKeys.length > 0) {
      setShowAutocomplete(true);
      setSelectedIndex(-1);
    }
  };

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (sourceType === 'secret' && secretKeys.length > 0) {
      setShowAutocomplete(true);
      setSelectedIndex(-1);
    } else if (sourceType === 'variable' && variableKeys.length > 0) {
      setShowAutocomplete(true);
      setSelectedIndex(-1);
    }
    setFilterValue(e.target.value);
    if (onChange) {
      onChange(e);
    }
  };

  const handleKeySelect = (key: string) => {
    if (inputRef.current && onChange) {
      const syntheticEvent = {
        target: { value: key },
        currentTarget: inputRef.current,
      } as ChangeEvent<HTMLInputElement>;
      onChange(syntheticEvent);
    }
    setFilterValue(key);
    setShowAutocomplete(false);
    setSelectedIndex(-1);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (sourceType === 'secret' && showAutocomplete && filteredKeys.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => (prev < filteredKeys.length - 1 ? prev + 1 : prev));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => (prev > 0 ? prev - 1 : -1));
      } else if (e.key === 'Enter' && selectedIndex >= 0) {
        e.preventDefault();
        handleKeySelect(filteredKeys[selectedIndex]);
      } else if (e.key === 'Escape') {
        setShowAutocomplete(false);
        setSelectedIndex(-1);
      }
    } else if (sourceType === 'variable' && showAutocomplete && filteredKeys.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => (prev < filteredKeys.length - 1 ? prev + 1 : prev));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => (prev > 0 ? prev - 1 : -1));
      } else if (e.key === 'Enter' && selectedIndex >= 0) {
        e.preventDefault();
        handleKeySelect(filteredKeys[selectedIndex]);
      } else if (e.key === 'Escape') {
        setShowAutocomplete(false);
        setSelectedIndex(-1);
      }
    }
    if (onKeyDown) {
      onKeyDown(e);
    }
  };

  useEffect(() => {
    setFilterValue('');
    if (
      sourceType === 'text' ||
      (sourceType === 'secret' && secretKeys.length === 0) ||
      (sourceType === 'variable' && variableKeys.length === 0)
    ) {
      setShowAutocomplete(false);
    }
  }, [sourceType, secretKeys.length, variableKeys.length]);

  const paddingClasses = size === 'sm' ? 'px-3 py-2' : 'px-4 py-3';
  const iconRightPadding = size === 'sm' ? 'pr-9' : 'pr-12';
  const iconRightPosition = size === 'sm' ? 'right-3' : 'right-4';
  const inputHeight = size === 'sm' ? 'h-10' : 'h-[52px]';

  const segmentedItems = [
    {
      value: 'text',
      label: 'Text',
      icon: <Type className="w-4 h-4" />,
      disabled,
      title: 'Plain text',
    },
    {
      value: 'secret',
      label: 'Secret',
      icon: <Lock className="w-4 h-4" />,
      disabled,
      title: 'Secret reference',
    },
    {
      value: 'variable',
      label: 'Variable',
      icon: <Variable className="w-4 h-4" />,
      disabled,
      title: 'Variable reference',
    },
  ];

  return (
    <div className="w-full">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        {label ? (
          <label htmlFor={id} className="text-[var(--agyn-dark)]">
            {label}
          </label>
        ) : null}
        <SegmentedControl
          items={segmentedItems}
          value={sourceType}
          onChange={handleSourceTypeChange}
          size={size === 'sm' ? 'sm' : 'md'}
          className="ml-auto"
        />
      </div>
      
      <div className="relative">
        {/* Input Field */}
        <input
          className={`
            w-full ${paddingClasses} ${inputHeight}
            bg-white 
            border border-[var(--agyn-border-subtle)] 
            rounded-[10px]
            text-[var(--agyn-dark)]
            placeholder:text-[var(--agyn-gray)]
            focus:outline-none focus:ring-2 focus:ring-[var(--agyn-blue)] focus:border-transparent
            disabled:bg-[var(--agyn-bg-light)] disabled:cursor-not-allowed
            ${error ? 'border-red-500 focus:ring-red-500' : ''}
            ${rightIcon ? iconRightPadding : ''}
            ${className}
          `}
          ref={inputRef}
          onFocus={handleInputFocus}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          id={id}
          {...restInputProps}
        />
        
        {rightIcon && (
          <div className={`absolute ${iconRightPosition} top-1/2 -translate-y-1/2 text-[var(--agyn-gray)]`}>
            {rightIcon}
          </div>
        )}
        
        {/* Autocomplete Dropdown */}
        {showAutocomplete && filteredKeys.length > 0 && (
          <div
            className="
              absolute left-0 top-full mt-1
              w-full
              bg-white
              border border-[var(--agyn-border-default)]
              rounded-[10px]
              shadow-lg
              z-20
              animate-in fade-in-0 zoom-in-95
              data-[state=open]:animate-in
              data-[state=closed]:animate-out
              data-[state=closed]:fade-out-0
              data-[state=closed]:zoom-out-95
            "
            ref={dropdownRef}
          >
            <div className="p-1 max-h-60 overflow-y-auto">
              {filteredKeys.map((key, index) => (
                <div
                  key={key}
                  className={`
                    px-3 py-2
                    !text-[var(--agyn-dark)]
                    cursor-pointer
                    rounded-[6px]
                    transition-colors
                    ${selectedIndex === index 
                      ? 'bg-[var(--agyn-bg-light)] !text-[var(--agyn-dark)]' 
                      : 'hover:bg-[var(--agyn-bg-light)] hover:!text-[var(--agyn-dark)]'
                    }
                  `}
                  onClick={() => handleKeySelect(key)}
                  onMouseEnter={() => setSelectedIndex(index)}
                >
                  {key}
                </div>
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
