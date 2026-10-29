'use client';

import Link from 'next/link';
import { getProviders, signIn } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { CheckCircle2, Mail, TriangleAlert } from 'lucide-react';

type Notice = { type: 'success' | 'error'; text: string } | null;

export default function Page() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState(searchParams.get('email') || '');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleAvailable, setGoogleAvailable] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const requestedCallback = searchParams.get('callbackUrl') || '';
  const callbackUrl = requestedCallback.startsWith('/') && !requestedCallback.startsWith('//') && !requestedCallback.includes('\\') ? requestedCallback : '/meetings';
  const displayNotice = notice || (searchParams.get('error')
    ? { type: 'error' as const, text: 'Sign-in did not complete. Please try again.' }
    : null);

  useEffect(() => {
    void getProviders().then(providers => setGoogleAvailable(Boolean(providers?.google))).catch(() => {});
  }, []);

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    setNotice(null);
    try {
      await signIn('google', { callbackUrl });
    } catch {
      setNotice({ type: 'error', text: 'Google sign-in could not start. Please try again.' });
    } finally {
      setGoogleLoading(false);
    }
  };

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
    <div className="mx-auto flex min-h-[calc(100dvh-96px)] w-full max-w-[26rem] flex-col justify-center px-4 py-8">
      <section aria-labelledby="sign-in-title" className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 shadow-xl sm:p-7">
        <h1 id="sign-in-title" className="text-2xl font-semibold tracking-tight text-white" style={{ textTransform: 'none' }}>Welcome to Melanam</h1>
        <p className="mb-6 mt-1 text-sm text-zinc-400">Sign in or create your account.</p>

        <div>
          {googleAvailable && (
            <>
              <button type="button" onClick={handleGoogleSignIn} disabled={googleLoading || loading} className="flex min-h-11 w-full items-center justify-center gap-3 rounded-lg border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-zinc-100 disabled:opacity-60">
                <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 shrink-0">
                  <path fill="#4285F4" d="M21.35 12.24c0-.71-.06-1.39-.18-2.05H12v3.88h5.24a4.48 4.48 0 0 1-1.94 2.94v2.45h3.14c1.84-1.7 2.91-4.2 2.91-7.22Z" />
                  <path fill="#34A853" d="M12 21.75c2.62 0 4.82-.87 6.43-2.35l-3.14-2.45c-.87.59-1.98.94-3.29.94-2.53 0-4.68-1.71-5.45-4.01H3.31v2.52A9.72 9.72 0 0 0 12 21.75Z" />
                  <path fill="#FBBC05" d="M6.55 13.88a5.86 5.86 0 0 1 0-3.76V7.6H3.31a9.75 9.75 0 0 0 0 8.8l3.24-2.52Z" />
                  <path fill="#EA4335" d="M12 6.11c1.43 0 2.7.49 3.71 1.45l2.78-2.79A9.42 9.42 0 0 0 12 2.25 9.72 9.72 0 0 0 3.31 7.6l3.24 2.52c.77-2.3 2.92-4.01 5.45-4.01Z" />
                </svg>
                {googleLoading ? 'Connecting to Google…' : 'Continue with Google'}
              </button>
              <div className="my-5 flex items-center gap-3 text-xs text-zinc-500" aria-hidden="true">
                <span className="h-px flex-1 bg-zinc-700" />or<span className="h-px flex-1 bg-zinc-700" />
              </div>
            </>
          )}

          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-zinc-200">Email address</label>
              <div className="relative">
                <Mail aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                <input id="email" type="email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)} placeholder="you@example.com" className="input-modern !min-h-11 !pl-11" />
              </div>
            </div>
            <button type="submit" disabled={loading || googleLoading} className="flex min-h-11 w-full items-center justify-center rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-700 disabled:opacity-60">{loading ? 'Sending secure link…' : 'Continue with email'}</button>
          </form>

          {displayNotice && <div role="alert" aria-live="polite" className={'mt-5 flex gap-3 rounded-xl border p-4 text-sm leading-6 ' + (displayNotice.type === 'success' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-red-500/30 bg-red-500/10 text-red-300')}>{displayNotice.type === 'success' ? <CheckCircle2 className="mt-1 h-4 w-4 shrink-0" /> : <TriangleAlert className="mt-1 h-4 w-4 shrink-0" />}<p>{displayNotice.text}</p></div>}
          <p className="mt-5 text-center text-xs text-zinc-500">No password needed.</p>
        </div>
      </section>
      <Link href="/admin/login" className="mt-4 text-center text-xs text-zinc-500 transition hover:text-white">Admin sign in</Link>
    </div>
  );
}
