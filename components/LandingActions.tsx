'use client';

import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { ArrowRight } from 'lucide-react';

export function LandingActions({ compact = false }: { compact?: boolean }) {
  const { status } = useSession();
  const isSignedIn = status === 'authenticated';

  if (isSignedIn) {
    return (
      <div className={compact ? 'noir-hero__actions noir-hero__actions--compact' : 'noir-hero__actions'}>
        <Link href="/meetings" className="noir-primary-action noir-shimmer-button"><span>Continue</span> <ArrowRight /></Link>
        <Link href="/pricing" className="noir-secondary-action">Pricing</Link>
      </div>
    );
  }

  return (
    <div className={compact ? 'noir-hero__actions noir-hero__actions--compact' : 'noir-hero__actions'}>
      <Link href="/sign-in" className="noir-primary-action noir-shimmer-button"><span>Enter Melanam</span> <ArrowRight /></Link>
      <Link href="/pricing" className="noir-secondary-action">Pricing</Link>
    </div>
  );
}
