'use client'
import { useCallback, useEffect, useState } from 'react';
import { formatFileBytes } from '@/lib/file-upload-client';
import Link from 'next/link';
import { isPlanUpgradeError } from '@/components/UpgradeCallout';

export function useFileAllowance() {
  const [limits, setLimits] = useState<{ plan: string; maxFileBytes: number; storageBytes: number; remainingBytes: number | null; availableFileBytes: number } | null>(null);
  const [error, setError] = useState('');
  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/files/limits', { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setLimits(data); setError('');
    } catch (error: any) { setLimits(null); setError(error.message || 'Unable to load upload allowance'); }
  }, []);
  useEffect(() => {
    refresh();
    const interval = window.setInterval(refresh, 30000);
    window.addEventListener('focus', refresh);
    return () => { window.clearInterval(interval); window.removeEventListener('focus', refresh); };
  }, [refresh]);
  return { limits, error, refresh };
}

export default function FileAllowance({ allowance }: { allowance: ReturnType<typeof useFileAllowance> }) {
  const { limits, error } = allowance;
  return <div className="mb-3 rounded-lg border border-zinc-700 bg-zinc-800/60 px-3 py-2 text-xs text-zinc-300" aria-live="polite">
    {limits ? <>
      <div>{limits.plan} plan · Up to {formatFileBytes(limits.maxFileBytes)} per file</div>
      <div className="mt-1 text-zinc-400">{formatFileBytes(limits.storageBytes)} used · {limits.remainingBytes == null ? 'No workspace storage cap' : `${formatFileBytes(limits.remainingBytes)} storage remaining`}</div>
      {limits.availableFileBytes < limits.maxFileBytes && <div className="mt-1">You can send up to {formatFileBytes(limits.availableFileBytes)} now. Delete files or upgrade for more space.</div>}
      {limits.availableFileBytes === 0 && <Link href="/pricing" className="mt-2 inline-flex min-h-9 items-center rounded-lg border border-sky-400/40 px-2.5 py-1 font-semibold text-sky-200 hover:bg-sky-400/10">View higher plans</Link>}
    </> : error || 'Loading your upload allowance…'}
    {!limits && error && isPlanUpgradeError(error) && <Link href="/pricing" className="mt-2 inline-flex min-h-9 items-center rounded-lg border border-sky-400/40 px-2.5 py-1 font-semibold text-sky-200 hover:bg-sky-400/10">View higher plans</Link>}
  </div>;
}
