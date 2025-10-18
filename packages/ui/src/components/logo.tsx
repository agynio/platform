import * as React from 'react';
import { cn } from '../utils/cn';

export type LogoVariant = 'light' | 'dark' | 'gradient';

export interface LogoProps extends React.SVGAttributes<SVGSVGElement> {
  // Display size in pixels (width/height)
  size?: number;
  // Color treatment for the logo
  variant?: LogoVariant;
}

/**
 * Brand Logo (SVG)
 * - size: px, defaults to 128
 * - variant: light | dark | gradient
 * - Gradient uses unique id to avoid DOM collisions
 */
export function Logo({ size = 128, variant = 'light', className, ...props }: LogoProps) {
  const reactId = React.useId();
  const gradientId = React.useMemo(() => `ui-logo-grad-${reactId.replace(/[:]/g, '')}`, [reactId]);

  const isGradient = variant === 'gradient';
  const stroke = isGradient ? `url(#${gradientId})` : 'currentColor';
  const variantClass = isGradient ? undefined : variant === 'dark' ? 'text-white' : 'text-foreground';

  return (
    <svg
      role="img"
      aria-label="Logo"
      width={size}
      height={size}
      viewBox="0 0 128 128"
      xmlns="http://www.w3.org/2000/svg"
      className={cn(className, variantClass)}
      {...props}
    >
      {isGradient ? (
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#3B82F6" />
            <stop offset="100%" stopColor="#8B5CF6" />
          </linearGradient>
        </defs>
      ) : null}

      {/* Stylized A-shaped mark */}
      <path
        d="M24 112 L64 16 L104 112"
        stroke={stroke}
        strokeWidth={16}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <line x1="40" y1="80" x2="88" y2="80" stroke={stroke} strokeWidth={16} strokeLinecap="round" />
    </svg>
  );
}

