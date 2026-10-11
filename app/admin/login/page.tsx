'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { GradientBorderButton } from '../../../components/ui/gradient-border-button';

export default function AdminLoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void (async () => {
      const response = await fetch('/api/admin/auth/session', { credentials: 'include' });
      const data = await response.json();
      if (data?.authenticated) {
        router.replace('/admin');
      }
    })();
  }, [router]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/admin/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to log in');
      }

      router.replace('/admin');
      router.refresh();
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-shell-wide flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900 p-8 shadow-xl backdrop-blur">
        <p className="text-xs font-semibold uppercase tracking-[0.4em] text-zinc-400">Melanam administration</p>
        <h1 className="mt-3 font-display text-3xl font-semibold text-zinc-100">Login</h1>
        <p className="mt-2 text-sm text-zinc-400">Sign in with your administrator credentials to manage Melanam.</p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400">Username</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="input-modern mt-1.5 w-full"
              placeholder="admin"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input-modern mt-1.5 w-full"
              placeholder="••••••••"
            />
          </div>
          {error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
          <GradientBorderButton type="submit" variant="create" disabled={loading} className="w-full">
            {loading ? 'Signing in...' : 'Sign in'}
          </GradientBorderButton>
        </form>
      </div>
    </div>
  );
}
