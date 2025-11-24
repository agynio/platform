import { ReactNode } from 'react';

interface SegmentedControlItem {
  value: string;
  label: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
  title?: string;
}

interface SegmentedControlProps {
  items: SegmentedControlItem[];
  value: string;
  onChange: (value: string) => void;
  size?: 'sm' | 'md';
  className?: string;
}

export function SegmentedControl({
  items,
  value,
  onChange,
  size = 'md',
  className = '',
}: SegmentedControlProps) {
  const sizeClasses = {
    sm: 'px-2 py-1 text-xs',
    md: 'px-3 py-1.5 text-sm',
  };

  return (
    <div className={`flex items-center gap-1 bg-[var(--agyn-bg-light)] rounded-[6px] p-1 ${className}`}>
      {items.map((item) => {
        const isActive = value === item.value;
        
        return (
          <button
            key={item.value}
            onClick={() => !item.disabled && onChange(item.value)}
            disabled={item.disabled}
            className={`
              ${sizeClasses[size]}
              rounded-[4px] 
              transition-colors 
              flex items-center gap-2
              disabled:opacity-50 disabled:cursor-not-allowed
              ${
                isActive
                  ? 'bg-white text-[var(--agyn-dark)] shadow-sm'
                  : 'text-[var(--agyn-gray)] hover:text-[var(--agyn-dark)]'
              }
            `}
            title={item.title}
          >
            {item.icon}
            <span>{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}
