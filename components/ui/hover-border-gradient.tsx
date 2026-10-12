'use client';

import React from 'react';

type HoverBorderGradientProps<T extends React.ElementType> = {
  as?: T;
  containerClassName?: string;
  className?: string;
  children: React.ReactNode;
  duration?: number;
  clockwise?: boolean;
} & Omit<React.ComponentPropsWithoutRef<T>, 'as' | 'className' | 'children'>;

/** A continuously rotating border; hover adds glow without stopping rotation. */
export function HoverBorderGradient<T extends React.ElementType = 'button'>({
  as, containerClassName = '', className = '', children, duration = 1, clockwise = true,
  style, ...props
}: HoverBorderGradientProps<T>) {
  const Component = as || 'button';
  const seconds = Number.isFinite(duration) && duration > 0 ? duration : 1;
  return <Component {...props}
    style={{ ...style, '--border-duration': `${seconds * 4}s`, '--border-direction': clockwise ? 'normal' : 'reverse' } as React.CSSProperties}
    className={`button-primary hover-border-gradient ${containerClassName} ${className}`}>
    <span aria-hidden="true" className="hover-border-gradient__light" />
    <span aria-hidden="true" className="hover-border-gradient__glow" />
    <span aria-hidden="true" className="hover-border-gradient__surface" />
    {children}
  </Component>;
}
