'use client';

import Link, { LinkProps } from 'next/link';
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

type Variant = 'dark' | 'light' | 'create' | 'join';
const variantClass = (variant: Variant) => variant === 'create' || variant === 'light' ? 'button-primary shimmer-btn' : 'button-secondary';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> { variant?: Variant; }
export const GradientBorderButton = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = '', variant = 'dark', children, ...props }, ref) => <button ref={ref} className={`${variantClass(variant)} ${className}`} {...props}>{children}</button>
);
GradientBorderButton.displayName = 'GradientBorderButton';

interface StyledLinkProps extends LinkProps { className?: string; variant?: Variant; children: ReactNode; }
export function GradientBorderLink({ className = '', variant = 'dark', children, ...props }: StyledLinkProps) {
  return <Link className={`${variantClass(variant)} ${className}`} {...props}>{children}</Link>;
}
