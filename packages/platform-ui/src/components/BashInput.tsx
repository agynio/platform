import { useState, TextareaHTMLAttributes } from 'react';
import { Maximize2 } from 'lucide-react';
import { FullscreenBashEditor } from './FullscreenBashEditor';

interface BashInputProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'size'> {
  label?: string;
  error?: string;
  helperText?: string;
  size?: 'sm' | 'default';
}

export function BashInput({
  label,
  error,
  helperText,
  size = 'default',
  className = '',
  value,
  onChange,
  disabled,
  ...props
}: BashInputProps) {
  const [showFullscreenEditor, setShowFullscreenEditor] = useState(false);

  const handleFullscreenSave = (newValue: string) => {
    // Create a synthetic event to match the onChange signature
    const syntheticEvent = {
      target: { value: newValue },
      currentTarget: { value: newValue },
    } as React.ChangeEvent<HTMLTextAreaElement>;
    onChange?.(syntheticEvent);
  };

  const paddingClasses = size === 'sm' ? 'px-3 py-2' : 'px-4 py-3';
  const iconPadding = size === 'sm' ? 'pr-10' : 'pr-12';
  const iconPosition = size === 'sm' ? 'right-2 top-2' : 'right-3 top-3';

  return (
    <div className="w-full">
      {label && (
        <label className="block mb-2 text-[var(--agyn-dark)]">
          {label}
        </label>
      )}

      <div className="relative">
        <textarea
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
            font-mono
            ${error ? 'border-red-500 focus:ring-red-500' : ''}
            ${!disabled ? iconPadding : ''}
            ${className}
          `}
          value={value}
          onChange={onChange}
          disabled={disabled}
          {...props}
        />

        {!disabled && (
          <button
            type="button"
            onClick={() => setShowFullscreenEditor(true)}
            className={`absolute ${iconPosition} p-1.5 text-[var(--agyn-gray)] hover:text-[var(--agyn-blue)] hover:bg-[var(--agyn-bg-light)] rounded-[6px] transition-colors z-10`}
            title="Open fullscreen bash editor"
            tabIndex={-1}
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        )}
      </div>

      {error && (
        <p className="mt-2 text-sm text-red-500">{error}</p>
      )}

      {helperText && !error && (
        <p className="mt-2 text-sm text-[var(--agyn-gray)]">{helperText}</p>
      )}

      {showFullscreenEditor && (
        <FullscreenBashEditor
          value={String(value || '')}
          onChange={handleFullscreenSave}
          onClose={() => setShowFullscreenEditor(false)}
          label={label || 'Bash Editor'}
        />
      )}
    </div>
  );
}
