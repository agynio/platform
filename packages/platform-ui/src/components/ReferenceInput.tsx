import { InputHTMLAttributes, ReactNode, useState, useRef, useEffect } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { Type, Lock, Variable } from 'lucide-react';

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
  ...props 
}: ReferenceInputProps) {
  const [internalSourceType, setInternalSourceType] = useState<SourceType>('text');
  const sourceType = controlledSourceType ?? internalSourceType;
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const handleSourceTypeChange = (value: string) => {
    const newType = value as SourceType;
    if (onSourceTypeChange) {
      onSourceTypeChange(newType);
    } else {
      setInternalSourceType(newType);
    }
  };

  // Filter keys based on input value
  const inputValue = (props.value as string) || '';
  const filteredKeys = sourceType === 'secret' && inputValue
    ? secretKeys.filter(key => key.toLowerCase().includes(inputValue.toLowerCase()))
    : sourceType === 'variable' && inputValue
    ? variableKeys.filter(key => key.toLowerCase().includes(inputValue.toLowerCase()))
    : [];

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

  const handleInputFocus = () => {
    if (sourceType === 'secret' && secretKeys.length > 0) {
      setShowAutocomplete(true);
      setSelectedIndex(-1);
    } else if (sourceType === 'variable' && variableKeys.length > 0) {
      setShowAutocomplete(true);
      setSelectedIndex(-1);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (sourceType === 'secret' && secretKeys.length > 0) {
      setShowAutocomplete(true);
      setSelectedIndex(-1);
    } else if (sourceType === 'variable' && variableKeys.length > 0) {
      setShowAutocomplete(true);
      setSelectedIndex(-1);
    }
    if (props.onChange) {
      props.onChange(e);
    }
  };

  const handleKeySelect = (key: string) => {
    if (inputRef.current && props.onChange) {
      const syntheticEvent = {
        target: { value: key },
        currentTarget: inputRef.current,
      } as React.ChangeEvent<HTMLInputElement>;
      props.onChange(syntheticEvent);
    }
    setShowAutocomplete(false);
    setSelectedIndex(-1);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
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
    if (props.onKeyDown) {
      props.onKeyDown(e);
    }
  };

  const paddingClasses = size === 'sm' ? 'px-3 py-2' : 'px-4 py-3';
  const inputLeftPadding = size === 'sm' ? 'pl-[52px]' : 'pl-[64px]';
  const iconRightPadding = size === 'sm' ? 'pr-9' : 'pr-12';
  const iconRightPosition = size === 'sm' ? 'right-3' : 'right-4';
  const selectorSize = size === 'sm' ? 'w-[38px] h-[38px]' : 'w-[50px] h-[50px]';
  const inputHeight = size === 'sm' ? 'h-10' : 'h-[52px]';

  const getSourceIcon = () => {
    switch (sourceType) {
      case 'text':
        return <Type className="w-4 h-4" />;
      case 'secret':
        return <Lock className="w-4 h-4" />;
      case 'variable':
        return <Variable className="w-4 h-4" />;
    }
  };

  return (
    <div className="w-full">
      {label && (
        <label className="block mb-2 text-[var(--agyn-dark)]">
          {label}
        </label>
      )}
      
      <div className="relative">
        {/* Input Field */}
        <input
          className={`
            w-full ${paddingClasses} ${inputLeftPadding} ${inputHeight}
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
          {...props}
          ref={inputRef}
          onFocus={handleInputFocus}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
        />
        
        {/* Source Selector - Square with right border, positioned inside input */}
        <div className={`absolute left-[1px] top-[1px] z-10 ${selectorSize}`}>
          <Select value={sourceType} onValueChange={handleSourceTypeChange} disabled={props.disabled}>
            <SelectTrigger
              size={undefined}
              className="
                !h-full
                w-full
                border-0
                border-r border-r-[var(--agyn-border-subtle)]
                bg-white
                hover:bg-[var(--agyn-bg-light)]
                rounded-l-[10px]
                rounded-r-none
                focus:ring-0
                focus:ring-offset-0
                [&>svg]:hidden
                flex items-center justify-center
                disabled:bg-[var(--agyn-bg-light)] disabled:cursor-not-allowed
              "
            >
              <div className="text-[var(--agyn-gray)]">
                {getSourceIcon()}
              </div>
            </SelectTrigger>
            
            <SelectContent
              className="
                bg-white 
                border border-[var(--agyn-border-default)] 
                rounded-[10px]
                shadow-lg
              "
            >
              <SelectItem
                value="text"
                className="
                  px-3 py-2
                  pr-10
                  !text-[var(--agyn-dark)]
                  data-[highlighted]:bg-[var(--agyn-bg-light)]
                  data-[highlighted]:!text-[var(--agyn-dark)]
                  focus:bg-[var(--agyn-bg-light)]
                  focus:!text-[var(--agyn-dark)]
                  cursor-pointer
                  rounded-[6px]
                "
              >
                <div className="flex items-center gap-2">
                  <Type className="w-4 h-4" />
                  <span>Plain Text</span>
                </div>
              </SelectItem>
              <SelectItem
                value="secret"
                className="
                  px-3 py-2
                  pr-10
                  !text-[var(--agyn-dark)]
                  data-[highlighted]:bg-[var(--agyn-bg-light)]
                  data-[highlighted]:!text-[var(--agyn-dark)]
                  focus:bg-[var(--agyn-bg-light)]
                  focus:!text-[var(--agyn-dark)]
                  cursor-pointer
                  rounded-[6px]
                "
              >
                <div className="flex items-center gap-2">
                  <Lock className="w-4 h-4" />
                  <span>Secret</span>
                </div>
              </SelectItem>
              <SelectItem
                value="variable"
                className="
                  px-3 py-2
                  pr-10
                  !text-[var(--agyn-dark)]
                  data-[highlighted]:bg-[var(--agyn-bg-light)]
                  data-[highlighted]:!text-[var(--agyn-dark)]
                  focus:bg-[var(--agyn-bg-light)]
                  focus:!text-[var(--agyn-dark)]
                  cursor-pointer
                  rounded-[6px]
                "
              >
                <div className="flex items-center gap-2">
                  <Variable className="w-4 h-4" />
                  <span>Variable</span>
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        
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