'use client';

import Link from 'next/link';
import { signIn } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { CheckCircle2, Mail, TriangleAlert } from 'lucide-react';
import { AuthHelpButton } from '../../auth-help-button';

type Notice = { type: 'success' | 'error'; text: string } | null;

export default function Page() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState(searchParams.get('email') || '');
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const requestedCallback = searchParams.get('callbackUrl') || '';
  const callbackUrl = requestedCallback.startsWith('/') && !requestedCallback.startsWith('//') && !requestedCallback.includes('\\') ? requestedCallback : '/meetings';

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail) {
      setNotice({ type: 'error', text: 'Enter your email address to continue.' });
      return;
    }

    setLoading(true);
    setNotice(null);

    try {
      // This is intentionally idempotent: new people get a basic account and
      // existing people continue directly to the magic-link step.
      const registration = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: normalizedEmail }),
      });
      const registrationBody = await registration.json().catch(() => ({}));

      if (!registration.ok && registration.status !== 409) {
        throw new Error(registrationBody.error || 'We could not prepare your account. Please try again.');
      }

      const result = await signIn('email', {
        email: normalizedEmail,
        callbackUrl,
        redirect: false,
      });

      if (result?.error) {
        throw new Error('We could not send the magic link. Please try again in a moment.');
      }

      setNotice({
        type: 'success',
        text: `Magic link sent to ${normalizedEmail}. Open the email on this device and select “Sign in securely”.`,
      });
    } catch (error) {
      setNotice({
        type: 'error',
        text: error instanceof Error ? error.message : 'Something went wrong. Please try again.',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-96px)] max-w-lg flex-col justify-center px-4 py-10">
      <header className="mb-8 text-center"><p className="section-kicker mb-4">Welcome to Melanam</p><h1 className="text-4xl font-bold tracking-tight text-white">Good Conversations{' '}<br /><span className="text-zinc-500">Start{' '}Here.</span></h1><p className="mt-5 text-sm leading-6 text-zinc-400">One email. One secure link. Sign in or create your account to start meeting.</p></header>
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 sm:p-8">
        <div className="mb-6 flex items-center justify-between"><h2 className="text-lg font-semibold text-white">Continue with email</h2><AuthHelpButton mode="sign-in" /></div>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div><label htmlFor="email" className="mb-2 block text-sm font-medium text-zinc-300">Email address</label><div className="relative"><Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" /><input id="email" type="email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)} placeholder="you@example.com" className="input-modern !pl-11" /></div></div>
          <button type="submit" disabled={loading} className="button-primary shimmer-btn w-full">{loading ? 'Sending secure link…' : 'Send sign-in link'}</button>
        </form>
        {notice && <div role="alert" aria-live="polite" className={'mt-5 flex gap-3 rounded-xl border p-4 text-sm leading-6 ' + (notice.type === 'success' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-red-500/30 bg-red-500/10 text-red-300')}>{notice.type === 'success' ? <CheckCircle2 className="mt-1 h-4 w-4 shrink-0" /> : <TriangleAlert className="mt-1 h-4 w-4 shrink-0" />}<p>{notice.text}</p></div>}
        <p className="mt-5 text-center text-xs leading-6 text-zinc-500">No password needed. Your link is single-use.<br />Check your spam folder if it hasn’t arrived.</p>
      </div>
      <Link href="/admin/login" className="mt-4 text-center text-xs text-zinc-400 hover:text-white">Admin sign in</Link>
    </div>
  );
}
