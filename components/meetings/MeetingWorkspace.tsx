'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { FileVideo, Sparkles, Video } from 'lucide-react';

const navigation = [
  { href: '/meetings', label: 'Meetings', icon: Video },
  { href: '/meetings/recordings', label: 'Recordings', icon: FileVideo },
  { href: '/meetings/notes', label: 'Meeting notes', icon: Sparkles },
];

export function MeetingWorkspace({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setError('');
    void (async () => {
      try {
        const response = await fetch('/api/billing/subscription', { cache: 'no-store' });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || 'Unable to load your account.');
        // Only provision a missing plan. Paid and inactive plans keep their state.
        if (!body.subscription) {
          const activation = await fetch('/api/billing/subscription', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ plan: 'free', notes: 'Free plan activated on first meeting visit' }),
          });
          if (!activation.ok) {
            const result = await activation.json();
            throw new Error(result.error || 'Unable to prepare your account.');
          }
        }
        if (active) setReady(true);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'Unable to load your account.');
      }
    })();
    return () => { active = false; };
  }, [attempt]);

  return (
    <div className="meeting-workspace mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
      <header className="mb-7 flex items-start justify-between gap-3">
        <div>
          <p className="section-kicker mb-2 !text-[10px] sm:!text-xs">Your workspace</p>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-white sm:text-4xl">{pathname.endsWith('/recordings') ? 'Your moments, saved.' : pathname.endsWith('/notes') ? 'The conversation continues.' : 'Let’s meet.'}</h1>
          <p className="mt-2 text-sm text-zinc-400">{pathname.endsWith('/recordings') ? 'Revisit your recordings and the moments that matter.' : pathname.endsWith('/notes') ? 'Pick up the ideas, decisions, and next steps.' : 'Good conversations start here.'}</p>
        </div>
        <Link href="/pricing" className="mt-1 shrink-0 rounded-full border border-zinc-800 px-3 py-2 text-xs text-zinc-400 transition hover:bg-zinc-800 hover:text-white sm:px-4 sm:text-sm">Manage plan</Link>
      </header>
      <nav aria-label="Meeting navigation" className="mb-7 grid grid-cols-3 gap-1 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-1.5 sm:mb-8 sm:flex sm:w-fit">
        {navigation.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} aria-current={pathname === href ? 'page' : undefined}
            className={`inline-flex min-w-0 flex-col items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-2 py-3 text-xs font-medium transition sm:flex-row sm:gap-2 sm:px-5 sm:text-sm ${pathname === href ? 'bg-white text-zinc-950' : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'}`}>
            <Icon className="h-4 w-4 shrink-0" />{label}
          </Link>
        ))}
      </nav>
      {error ? <div role="alert" className="rounded-xl border border-red-400/30 p-5 text-red-200">
        <p>{error}</p><button onClick={() => setAttempt(value => value + 1)} className="mt-3 underline">Try again</button>
      </div> : ready ? <main>{children}</main> : <p role="status" className="py-12 text-zinc-400">Preparing your meetings…</p>}
    </div>
  );
}
