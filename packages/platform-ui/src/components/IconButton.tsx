import { ButtonHTMLAttributes, ReactNode } from 'react';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'accent' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  icon: ReactNode;
  rounded?: boolean;
}

export function IconButton({ 
  variant = 'ghost', 
  size = 'md', 
  icon,
  rounded = false,
  className = '',
  ...props 
}: IconButtonProps) {
  const baseStyles = 'inline-flex items-center justify-center transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed';
  
  const variants = {
    primary: 'bg-[var(--agyn-blue)] text-white hover:bg-[var(--agyn-blue-dark)] active:bg-[var(--agyn-blue-dark)]',
    secondary: 'bg-[var(--agyn-purple)] text-white hover:opacity-90 active:opacity-80',
    accent: 'bg-[var(--agyn-cyan)] text-white hover:opacity-90 active:opacity-80',
    outline: 'bg-transparent border-2 border-[var(--agyn-blue)] text-[var(--agyn-blue)] hover:bg-[var(--agyn-blue)] hover:text-white',
    ghost: 'bg-transparent text-[var(--agyn-gray)] hover:bg-[var(--agyn-bg-light)] hover:text-[var(--agyn-blue)]',
    danger: 'bg-transparent text-[var(--agyn-status-failed)] hover:bg-[var(--agyn-status-failed-bg)] active:bg-[var(--agyn-status-failed-bg)]',
  };
  
  const sizes = {
    sm: 'w-8 h-8 [&_svg]:w-4 [&_svg]:h-4',
    md: 'w-10 h-10 [&_svg]:w-5 [&_svg]:h-5',
    lg: 'w-12 h-12 [&_svg]:w-6 [&_svg]:h-6',
  };
  
  const roundedStyle = rounded ? 'rounded-full' : 'rounded-[10px]';
  
  return (
    <button 
      className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${roundedStyle} ${className}`}
      {...props}
    >
      {icon}
    </button>
  );
}
