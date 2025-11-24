import { type ReactNode } from 'react';

interface PanelProps {
  variant?: 'standard' | 'elevated' | 'subtle' | 'highlighted';
  children: ReactNode;
  className?: string;
}

export function Panel({ variant = 'standard', children, className = '' }: PanelProps) {
  const variants = {
    standard: 'bg-white border border-[var(--agyn-border-subtle)]',
    elevated: 'bg-white shadow-md',
    subtle: 'bg-[var(--agyn-bg-light)] border border-[var(--agyn-border-subtle)]',
    highlighted: 'bg-[var(--agyn-bg-accent)] border-2 border-[var(--agyn-blue)]',
  };
  
  return (
    <div className={`rounded-[10px] ${variants[variant]} ${className}`}>
      {children}
    </div>
  );
}

interface PanelHeaderProps {
  children: ReactNode;
  className?: string;
}

export function PanelHeader({ children, className = '' }: PanelHeaderProps) {
  return (
    <div className={`p-6 border-b border-[var(--agyn-border-subtle)] ${className}`}>
      {children}
    </div>
  );
}

interface PanelBodyProps {
  children: ReactNode;
  className?: string;
}

export function PanelBody({ children, className = '' }: PanelBodyProps) {
  return (
    <div className={`p-6 ${className}`}>
      {children}
    </div>
  );
}

interface PanelFooterProps {
  children: ReactNode;
  className?: string;
}

export function PanelFooter({ children, className = '' }: PanelFooterProps) {
  return (
    <div className={`p-6 border-t border-[var(--agyn-border-subtle)] ${className}`}>
      {children}
    </div>
  );
}
