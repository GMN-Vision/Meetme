'use client';

import Link from 'next/link';
import { Check } from 'lucide-react';
import { BILLING_PLANS, formatInr, getAnnualSavings, getPlanPrice, type BillingCycle, type PlanKey } from '@/lib/billing-plans';

export function BillingToggle({ cycle, onChange }: { cycle: BillingCycle; onChange: (cycle: BillingCycle) => void }) {
  return <div className="inline-flex rounded-full border border-zinc-800 bg-zinc-900 p-1" aria-label="Billing cycle">
    {(['monthly', 'annual'] as const).map(value => <button key={value} onClick={() => onChange(value)} aria-pressed={cycle === value}
      className={`rounded-full px-5 py-2 text-sm font-medium transition ${cycle === value ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white'}`}>{value === 'monthly' ? 'Monthly' : 'Yearly'}</button>)}
  </div>;
}

export function PlanCards({ cycle, action }: { cycle: BillingCycle; action?: (key: PlanKey) => React.ReactNode }) {
  return <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
    {BILLING_PLANS.map(plan => <article key={plan.key} className={`relative flex min-w-0 flex-col rounded-2xl border p-6 transition hover:border-zinc-600 ${plan.recommended ? 'border-zinc-600 bg-zinc-900' : 'border-zinc-800 bg-zinc-900/50'}`}>
      {plan.recommended && <>
        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl" aria-hidden="true"><div className="border-beam absolute h-24 w-24 bg-white/10 blur-xl" style={{ offsetPath: 'rect(0 100% 100% 0 round 16px)' }} /></div>
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-white px-3 py-1 text-xs font-semibold text-zinc-950">Most popular</span>
      </>}
      <h3 className="text-xl font-semibold text-white">{plan.title}</h3>
      <p className="mt-2 min-h-12 text-sm leading-6 text-zinc-400">{plan.audience}</p>
      <div className="my-6">
        <div className="flex flex-wrap items-baseline gap-1"><strong className="text-3xl font-bold tracking-tight text-white">{formatInr(getPlanPrice(plan.key, cycle))}</strong>{plan.key !== 'enterprise' && <span className="text-sm text-zinc-400">/{cycle === 'annual' ? 'year' : 'month'}</span>}</div>
        <p className="mt-2 min-h-5 text-xs text-zinc-400">{plan.key === 'enterprise' ? 'Tailored to your organization' : cycle === 'annual' && getAnnualSavings(plan.key) > 0 ? `Save ${formatInr(getAnnualSavings(plan.key))} per year` : plan.key === 'free' ? 'No credit card required' : 'Billed monthly in INR'}</p>
      </div>
      <ul className="mb-8 flex-1 space-y-3">
        {[plan.limits.participants, plan.limits.meetingMinutes, ...plan.highlights.slice(1)].map((feature, index) => <li key={index} className="flex gap-2.5 text-sm leading-6 text-zinc-300"><Check className="mt-1 h-4 w-4 shrink-0 text-emerald-500" strokeWidth={1.5} /><span>{feature}</span></li>)}
      </ul>
      <div className="relative">{action ? action(plan.key) : <Link href={plan.key === 'free' ? '/sign-in' : '/pricing'} className={`${plan.recommended ? 'button-primary shimmer-btn' : 'button-secondary'} w-full`}>{plan.key === 'free' ? 'Get started free' : plan.key === 'enterprise' ? 'Contact sales' : `Explore ${plan.title}`}</Link>}</div>
    </article>)}
  </div>;
}
