import { TextareaHTMLAttributes, useEffect, useRef } from 'react';

interface AutosizeTextareaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'rows'> {
  label?: string;
  error?: string;
  helperText?: string;
  size?: 'sm' | 'default';
  minLines?: number;
  maxLines?: number;
}

export function AutosizeTextarea({ 
  label, 
  error, 
  helperText, 
  size = 'default',
  minLines = 1,
  maxLines,
  className = '',
  value,
  onChange,
  ...props 
}: AutosizeTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const paddingClasses = size === 'sm' ? 'px-3 py-2' : 'px-4 py-3';

  const adjustHeight = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    // Reset height to auto to get the correct scrollHeight
    textarea.style.height = 'auto';

    // Calculate line height and padding
    const computedStyle = window.getComputedStyle(textarea);
    const lineHeight = parseFloat(computedStyle.lineHeight);
    const paddingTop = parseFloat(computedStyle.paddingTop);
    const paddingBottom = parseFloat(computedStyle.paddingBottom);
    const borderTop = parseFloat(computedStyle.borderTopWidth);
    const borderBottom = parseFloat(computedStyle.borderBottomWidth);
    
    // Calculate min and max heights based on line content only
    // scrollHeight already includes padding, so we compare against line heights without padding
    const minContentHeight = lineHeight * minLines;
    const maxContentHeight = maxLines ? lineHeight * maxLines : Infinity;

    // Get the actual content height (scrollHeight already includes padding)
    const contentHeight = textarea.scrollHeight;
    
    // Calculate the minimum total height needed
    const minTotalHeight = minContentHeight + paddingTop + paddingBottom + borderTop + borderBottom;
    const maxTotalHeight = maxContentHeight + paddingTop + paddingBottom + borderTop + borderBottom;

    // Set new height based on content, but respect min/max
    const newHeight = Math.min(Math.max(contentHeight, minTotalHeight), maxTotalHeight);
    textarea.style.height = `${newHeight}px`;

    // Enable scrolling if max height is reached
    if (maxLines && contentHeight > maxTotalHeight) {
      textarea.style.overflowY = 'auto';
    } else {
      textarea.style.overflowY = 'hidden';
    }
  };

  useEffect(() => {
    adjustHeight();
  }, [value, minLines, maxLines]);

  // Call adjustHeight on mount
  useEffect(() => {
    adjustHeight();
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    adjustHeight();
    if (onChange) {
      onChange(e);
    }
  };

  return (
    <div className="w-full">
      {label && (
        <label className="block mb-2 text-[var(--agyn-dark)]">
          {label}
        </label>
      )}
      
      <textarea
        ref={textareaRef}
        rows={1}
        className={`
          w-full ${paddingClasses}
          bg-white 
          border border-[var(--agyn-border-subtle)] 
          rounded-[10px] 
          text-[var(--agyn-dark)]
          placeholder:text-[var(--agyn-gray)]
          focus:outline-none focus:ring-2 focus:ring-[var(--agyn-blue)] focus:border-transparent
          disabled:bg-[var(--agyn-bg-light)] disabled:cursor-not-allowed
          resize-none
          ${error ? 'border-red-500 focus:ring-red-500' : ''}
          ${className}
        `}
        value={value}
        onChange={handleChange}
        {...props}
      />
      
      {error && (
        <p className="mt-2 text-sm text-red-500">{error}</p>
      )}
      
      {helperText && !error && (
        <p className="mt-2 text-sm text-[var(--agyn-gray)]">{helperText}</p>
      )}
    </div>
  );
}