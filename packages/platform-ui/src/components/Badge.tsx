import type { ReactNode } from 'react';

type BadgeVariant =
  | 'default'
  | 'neutral'
  | 'primary'
  | 'secondary'
  | 'purple'
  | 'accent'
  | 'success'
  | 'warning'
  | 'error'
  | 'info'
  | 'destructive'
  | 'outline';

interface BadgeProps {
  children: ReactNode;
  variant?: BadgeVariant;
  size?: 'sm' | 'default';
  color?: string;
  bgColor?: string;
  className?: string;
}

const variantStyles: Record<BadgeVariant, { color: string; bgColor: string; borderColor?: string }> = {
  default: { color: 'var(--agyn-gray)', bgColor: 'var(--agyn-bg-light)', borderColor: 'transparent' },
  neutral: { color: 'var(--agyn-gray)', bgColor: 'var(--agyn-bg-light)', borderColor: 'transparent' },
  primary: { color: 'var(--agyn-blue)', bgColor: 'var(--agyn-bg-blue)', borderColor: 'transparent' },
  secondary: { color: 'var(--agyn-purple)', bgColor: 'var(--agyn-bg-purple)', borderColor: 'transparent' },
  purple: { color: 'var(--agyn-purple)', bgColor: 'var(--agyn-bg-purple)', borderColor: 'transparent' },
  accent: { color: 'var(--agyn-cyan)', bgColor: 'var(--agyn-bg-cyan)', borderColor: 'transparent' },
  success: {
    color: 'var(--agyn-status-finished)',
    bgColor: 'var(--agyn-status-finished-bg)',
    borderColor: 'transparent',
  },
  warning: {
    color: 'var(--agyn-status-pending)',
    bgColor: 'var(--agyn-status-pending-bg)',
    borderColor: 'transparent',
  },
  error: {
    color: 'var(--agyn-status-failed)',
    bgColor: 'var(--agyn-status-failed-bg)',
    borderColor: 'transparent',
  },
  info: {
    color: 'var(--agyn-status-running)',
    bgColor: 'var(--agyn-status-running-bg)',
    borderColor: 'transparent',
  },
  destructive: {
    color: 'var(--agyn-status-failed)',
    bgColor: 'var(--agyn-status-failed-bg)',
    borderColor: 'transparent',
  },
  outline: {
    color: 'var(--agyn-gray)',
    bgColor: 'transparent',
    borderColor: 'var(--agyn-border-subtle)',
  },
};

export function Badge({
  children,
  variant = 'default',
  size = 'default',
  color,
  bgColor,
  className = '',
}: BadgeProps) {
  const styles = variantStyles[variant];
  const sizeClasses = size === 'sm' ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-sm';
  const borderClasses = styles.borderColor ? '' : 'border-transparent';

  return (
    <span
      className={`inline-flex items-center ${sizeClasses} rounded-[6px] border ${borderClasses} ${className}`.trim()}
      style={{
        color: color ?? styles.color,
        backgroundColor: bgColor ?? styles.bgColor,
        borderColor: styles.borderColor,
      }}
    >
      {children}
    </span>
  );
}

export default Badge;
