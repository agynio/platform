import { ButtonHTMLAttributes, ReactNode } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'accent' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  children: ReactNode;
}

export function Button({ 
  variant = 'primary', 
  size = 'md', 
  children, 
  className = '',
  ...props 
}: ButtonProps) {
  const baseStyles = 'inline-flex items-center justify-center rounded-[10px] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed';
  
  const variants = {
    primary: 'bg-[var(--agyn-blue)] text-white hover:bg-[var(--agyn-blue-dark)] active:bg-[var(--agyn-blue-dark)]',
    secondary: 'bg-[var(--agyn-purple)] text-white hover:opacity-90 active:opacity-80',
    accent: 'bg-[var(--agyn-cyan)] text-white hover:opacity-90 active:opacity-80',
    outline: 'bg-transparent border-2 border-[var(--agyn-blue)] text-[var(--agyn-blue)] hover:bg-[var(--agyn-blue)] hover:text-white',
    ghost: 'bg-transparent text-[var(--agyn-blue)] hover:bg-[var(--agyn-blue)] hover:text-white',
    danger: 'bg-transparent border-2 border-[var(--agyn-status-failed)] text-[var(--agyn-status-failed)] hover:bg-[var(--agyn-status-failed)] hover:text-white',
  };
  
  const sizes = {
    sm: 'px-4 py-2 text-sm',
    md: 'px-6 py-3',
    lg: 'px-8 py-4',
  };
  
  return (
    <button 
      className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}