'use client';

import React, { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';

const movingMap = [
  'radial-gradient(20.7% 50% at 50% 0%, #ffffff 0%, rgba(255,255,255,0) 100%)',
  'radial-gradient(16.2% 41.2% at 100% 50%, #ffffff 0%, rgba(255,255,255,0) 100%)',
  'radial-gradient(20.7% 50% at 50% 100%, #ffffff 0%, rgba(255,255,255,0) 100%)',
  'radial-gradient(16.6% 43.1% at 0% 50%, #ffffff 0%, rgba(255,255,255,0) 100%)',
];
const highlight = 'radial-gradient(75% 181.16% at 50% 50%, #3275F8 0%, rgba(255,255,255,0) 100%)';

type HoverBorderGradientProps<T extends React.ElementType> = {
  as?: T;
  containerClassName?: string;
  className?: string;
  children: React.ReactNode;
  duration?: number;
  clockwise?: boolean;
} & Omit<React.ComponentPropsWithoutRef<T>, 'as' | 'className' | 'children'>;

/** Keep the interactive element itself as the border container (no nested buttons). */
export function HoverBorderGradient<T extends React.ElementType = 'button'>({
  as, containerClassName = '', className = '', children, duration = 1, clockwise = true,
  onMouseEnter, onMouseLeave, onFocus, onBlur, ...props
}: HoverBorderGradientProps<T>) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [direction, setDirection] = useState(0);
  const reducedMotion = useReducedMotion();
  const active = hovered || focused;
  const seconds = Number.isFinite(duration) && duration > 0 ? duration : 1;
  useEffect(() => {
    if (active || reducedMotion || props.disabled) return;
    const timer = setInterval(() => setDirection(previous => (previous + (clockwise ? 1 : 3)) % 4), seconds * 1000);
    return () => clearInterval(timer);
  }, [active, reducedMotion, props.disabled, clockwise, seconds]);

  const Component = as || 'button';
  return <Component {...props}
    onMouseEnter={(event: React.MouseEvent<HTMLElement>) => { setHovered(true); onMouseEnter?.(event); }}
    onMouseLeave={(event: React.MouseEvent<HTMLElement>) => { setHovered(false); onMouseLeave?.(event); }}
    onFocus={(event: React.FocusEvent<HTMLElement>) => { setFocused(true); onFocus?.(event); }}
    onBlur={(event: React.FocusEvent<HTMLElement>) => { setFocused(false); onBlur?.(event); }}
    className={`button-primary hover-border-gradient ${containerClassName} ${className}`}>
    <motion.span aria-hidden="true" className="hover-border-gradient__light"
      initial={{ background: movingMap[0] }}
      animate={{ background: active && !props.disabled ? highlight : movingMap[direction] }}
      transition={{ ease: 'linear', duration: reducedMotion ? 0 : seconds }} />
    <span aria-hidden="true" className="hover-border-gradient__surface" />
    {children}
  </Component>;
}
