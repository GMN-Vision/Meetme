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
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold text-white">Let’s meet.</h1>
          <p className="mt-2 text-sm text-zinc-400">Start a call, invite anyone, and keep the conversation going.</p>
        </div>
        <Link href="/pricing" className="rounded-full border border-white/15 px-4 py-2 text-sm text-zinc-300 hover:bg-white/5">Manage plan</Link>
      </header>
      <nav aria-label="Meeting navigation" className="mb-6 flex gap-2 overflow-x-auto border-b border-white/10 pb-4">
        {navigation.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} aria-current={pathname === href ? 'page' : undefined}
            className={`inline-flex shrink-0 items-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold transition ${pathname === href ? 'bg-[#ef233c] text-white' : 'text-zinc-400 hover:bg-white/5 hover:text-white'}`}>
            <Icon className="h-4 w-4" />{label}
          </Link>
        ))}
      </nav>
      {error ? <div role="alert" className="rounded-xl border border-red-400/30 p-5 text-red-200">
        <p>{error}</p><button onClick={() => setAttempt(value => value + 1)} className="mt-3 underline">Try again</button>
      </div> : ready ? <main>{children}</main> : <p role="status" className="py-12 text-zinc-400">Preparing your meetings…</p>}
    </div>
  );
}
