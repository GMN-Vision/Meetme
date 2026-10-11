'use client';

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
    <div className="page-shell flex min-h-[calc(100vh-4rem)] items-center justify-center py-8">
      <div className="grid w-full max-w-5xl gap-7 lg:grid-cols-[1fr_0.9fr] lg:items-center">
        <div className="space-y-4 sm:space-y-5">
          <p className="section-kicker">Welcome to Melanam</p>
          <h1 className="section-title font-display text-3xl font-semibold text-slate-950 sm:text-5xl">
            Continue with your email.
          </h1>
          <p className="max-w-xl text-base leading-7 text-slate-600 sm:text-lg sm:leading-8">
            No passwords and no separate sign-up form. New accounts are created automatically when you request your first secure link.
          </p>
          <p className="max-w-xl text-sm leading-6 text-slate-500">
            After you sign in, this device stays signed in for 7 days.
          </p>
        </div>

        <div className="surface-strong rounded-[2rem] p-3 sm:p-6">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-slate-900">Continue with email</h2>
                <p className="mt-1 text-xs leading-5 text-slate-500">We will send a one-time, secure sign-in link.</p>
              </div>
              <AuthHelpButton mode="sign-in" />
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <label htmlFor="email" className="block text-sm font-medium text-slate-700">Email address</label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  className="input-modern w-full pl-10"
                />
              </div>
              <button type="submit" disabled={loading} className="button-primary w-full justify-center py-3 text-sm sm:text-base">
                {loading ? 'Sending secure link…' : 'Send secure sign-in link'}
              </button>
            </form>

            {notice && (
              <div
                className={`mt-4 flex gap-3 rounded-xl border p-3.5 text-sm leading-6 ${
                  notice.type === 'success'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                    : 'border-red-200 bg-red-50 text-red-800'
                }`}
                role="alert"
                aria-live="polite"
              >
                {notice.type === 'success' ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" /> : <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />}
                <p>{notice.text}</p>
              </div>
            )}

            <p className="mt-4 text-xs leading-5 text-slate-500">
              The link is single-use. If it is not in your inbox, check spam or request a fresh link.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
