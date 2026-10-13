'use client';

import Link from 'next/link';
import { Check } from 'lucide-react';
import { BILLING_PLANS, getDisplayAnnualSavings, getDisplayPlanPrice, type DisplayCurrency, getAnnualSavings, type BillingCycle, type PlanKey } from '@/lib/billing-plans';

export function BillingToggle({ cycle, onChange }: { cycle: BillingCycle; onChange: (cycle: BillingCycle) => void }) {
  return <div className="billing-toggle inline-flex rounded-full border border-zinc-800 bg-zinc-900 p-1" aria-label="Billing cycle">
    {(['monthly', 'annual'] as const).map(value => <button key={value} onClick={() => onChange(value)} aria-pressed={cycle === value}
      className={`rounded-full px-5 py-2 text-sm font-medium transition ${cycle === value ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white'}`}>{value === 'monthly' ? 'Monthly' : 'Yearly'}</button>)}
  </div>;
}

export function PlanCards({ cycle, currency = 'GBP', action }: { cycle: BillingCycle; currency?: DisplayCurrency; action?: (key: PlanKey) => React.ReactNode }) {
  return <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
    {BILLING_PLANS.map(plan => <article key={plan.key} className={`plan-card ${plan.recommended ? 'plan-card--recommended' : ''} relative flex min-w-0 flex-col rounded-2xl border p-6 transition hover:border-zinc-600 ${plan.recommended ? 'border-zinc-600 bg-zinc-900' : 'border-zinc-800 bg-zinc-900/50'}`}>
      {plan.recommended && <>
        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl" aria-hidden="true"><div className="border-beam absolute h-24 w-24 bg-white/10 blur-xl" style={{ offsetPath: 'rect(0 100% 100% 0 round 16px)' }} /></div>
        <span className="plan-popular absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-white px-3 py-1 text-xs font-semibold text-zinc-950">Most popular</span>
      </>}
      <h3 className="text-xl font-semibold text-white">{plan.title}</h3>
      <p className="mt-2 min-h-12 text-sm leading-6 text-zinc-400">{plan.audience}</p>
      <div className="my-6">
        <div className="flex flex-wrap items-baseline gap-1"><strong className="text-3xl font-bold tracking-tight text-white">{getDisplayPlanPrice(plan.key, cycle, currency)}</strong>{plan.key !== 'enterprise' && <span className="text-sm text-zinc-400">/{cycle === 'annual' ? 'year' : 'month'}</span>}</div>
        <p className="mt-2 min-h-5 text-xs text-zinc-400">{plan.key === 'enterprise' ? 'Tailored to your organization' : cycle === 'annual' && getAnnualSavings(plan.key) > 0 ? `Save ${getDisplayAnnualSavings(plan.key, currency)} per year` : plan.key === 'free' ? 'No credit card required' : currency === 'GBP' ? 'Estimated monthly price in GBP' : 'Billed monthly in INR'}</p>
      </div>
      <ul className="mb-8 flex-1 space-y-3">
        {[plan.limits.participants, plan.limits.meetingMinutes, ...plan.highlights.slice(1)].map((feature, index) => <li key={index} className="flex gap-2.5 text-sm leading-6 text-zinc-300"><Check className="mt-1 h-4 w-4 shrink-0 text-emerald-500" strokeWidth={1.5} /><span>{feature}</span></li>)}
      </ul>
      <div className="relative">{action ? action(plan.key) : <Link href={plan.key === 'free' ? '/sign-in' : '/pricing'} className={`${plan.recommended ? 'button-primary shimmer-btn' : 'button-secondary'} w-full`}>{plan.key === 'free' ? 'Get started free' : plan.key === 'enterprise' ? 'Contact sales' : `Explore ${plan.title}`}</Link>}</div>
    </article>)}
  </div>;
}

export function CurrencySelector({ currency, onChange }: { currency: DisplayCurrency; onChange: (currency: DisplayCurrency) => void }) {
  return <div className="mt-4">
    <label className="inline-flex items-center gap-3 text-sm text-zinc-400">Currency
      <select value={currency} onChange={event => onChange(event.target.value as DisplayCurrency)} className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-white">
        <option value="GBP">{'\u00a3'} GBP</option><option value="INR">Rs. INR</option>
      </select>
    </label>
    {currency === 'GBP' && <p className="mt-2 text-xs text-zinc-400">GBP prices are estimates; yearly plans use {'\u00a3'}1 = Rs. 126.67 (12 Oct 2026). Checkout is charged in INR.</p>}
  </div>;
}
