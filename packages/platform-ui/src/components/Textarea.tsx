import { TextareaHTMLAttributes } from 'react';

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  helperText?: string;
  size?: 'sm' | 'default';
}

export function Textarea({ 
  label, 
  error, 
  helperText, 
  size = 'default',
  className = '',
  ...props 
}: TextareaProps) {
  const paddingClasses = size === 'sm' ? 'px-3 py-2' : 'px-4 py-3';

  return (
    <div className="w-full">
      {label && (
        <label className="block mb-2 text-[var(--agyn-dark)]">
          {label}
        </label>
      )}
      
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
          ${error ? 'border-red-500 focus:ring-red-500' : ''}
          ${className}
        `}
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
