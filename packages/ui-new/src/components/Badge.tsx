interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'neutral' | 'primary' | 'secondary' | 'purple' | 'accent' | 'success' | 'warning' | 'error' | 'info';
  size?: 'sm' | 'default';
  color?: string;
  bgColor?: string;
  className?: string;
}

const variantStyles: Record<string, { color: string; bgColor: string }> = {
  default: { color: 'var(--agyn-gray)', bgColor: 'var(--agyn-bg-light)' },
  neutral: { color: 'var(--agyn-gray)', bgColor: 'var(--agyn-bg-light)' },
  primary: { color: 'var(--agyn-blue)', bgColor: 'var(--agyn-bg-blue)' },
  secondary: { color: 'var(--agyn-purple)', bgColor: 'var(--agyn-bg-purple)' },
  purple: { color: 'var(--agyn-purple)', bgColor: 'var(--agyn-bg-purple)' },
  accent: { color: 'var(--agyn-cyan)', bgColor: 'var(--agyn-bg-cyan)' },
  success: { color: 'var(--agyn-status-finished)', bgColor: 'var(--agyn-status-finished-bg)' },
  warning: { color: 'var(--agyn-status-pending)', bgColor: 'var(--agyn-status-pending-bg)' },
  error: { color: 'var(--agyn-status-failed)', bgColor: 'var(--agyn-status-failed-bg)' },
  info: { color: 'var(--agyn-status-running)', bgColor: 'var(--agyn-status-running-bg)' },
};

export function Badge({ 
  children, 
  variant = 'default', 
  size = 'default',
  color, 
  bgColor,
  className = '' 
}: BadgeProps) {
  const styles = variantStyles[variant];
  const sizeClasses = size === 'sm' ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-sm';
  
  return (
    <span
      className={`inline-flex items-center ${sizeClasses} rounded-[6px] ${className}`}
      style={{
        color: color || styles.color,
        backgroundColor: bgColor || styles.bgColor,
      }}
    >
      {children}
    </span>
  );
}

export default Badge;