'use client';

import Link from 'next/link';
import { motion } from 'motion/react';

export default function HeroAceternity() {
  return (
    <section className="relative overflow-hidden">
      <div className="mx-auto max-w-7xl py-12 px-4 sm:py-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <motion.h1
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="section-title font-display text-4xl sm:text-5xl md:text-6xl font-semibold leading-tight"
          >
            Meetings that feel simple,
            <span className="gradient-text block">secure, and delightful to use.</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.15, duration: 0.5 }}
            className="mt-6 text-lg text-zinc-400"
          >
            All the features you need — private rooms, persistent chat, activity history, and optional AI captions — in a single polished workspace.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="mt-8 flex justify-center gap-3"
          >
            <Link href="/sign-in" className="button-primary inline-flex items-center">
              Get started free
            </Link>
            <Link href="/meetings" className="button-secondary inline-flex items-center">
              View demo
            </Link>
          </motion.div>
        </div>

        {/* subtle feature strip */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="mt-12 flex justify-center"
        >
          <div className="rounded-3xl bg-zinc-900/40 px-6 py-3 shadow-md backdrop-blur-md flex gap-6">
            <div className="text-sm text-zinc-100 font-semibold">Private rooms</div>
            <div className="text-sm text-zinc-100 font-semibold">Saved chat</div>
            <div className="text-sm text-zinc-100 font-semibold">Live captions</div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
