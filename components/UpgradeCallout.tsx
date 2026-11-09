'use client';

import Link from 'next/link';

export function isPlanUpgradeError(message: string) {
  return /\b(plan|membership|upgrade|quota|storage|credits|allowance)\b/i.test(message);
}

export default function UpgradeCallout({ reason }: { reason: string }) {
  return <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sky-400/30 bg-sky-400/10 px-3 py-3 text-sm text-zinc-100">
    <span className="min-w-0 flex-1">{reason}</span>
    <Link href="/pricing" className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-lg bg-sky-300 px-3 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-sky-200">View higher plans</Link>
  </div>;
}
