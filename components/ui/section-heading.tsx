'use client';

import { motion } from 'motion/react';

interface SectionHeadingProps {
  kicker?: string;
  title: string;
  description?: string;
  align?: 'left' | 'center';
}

export function SectionHeading({
  kicker,
  title,
  description,
  align = 'left',
}: SectionHeadingProps) {
  const alignment = align === 'center' ? 'items-center text-center' : 'items-start text-left';

  return (
    <div className={`flex flex-col gap-3 ${alignment}`}>
      {kicker ? (
        <motion.p
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="text-xs font-semibold uppercase tracking-[0.3em] text-zinc-400"
        >
          {kicker}
        </motion.p>
      ) : null}
      <motion.h2
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="font-display text-2xl font-semibold text-zinc-100 sm:text-3xl md:text-4xl"
      >
        {title}
      </motion.h2>
      {description ? (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1, duration: 0.4 }}
          className="max-w-2xl text-sm text-zinc-400 sm:text-base"
        >
          {description}
        </motion.p>
      ) : null}
    </div>
  );
}
