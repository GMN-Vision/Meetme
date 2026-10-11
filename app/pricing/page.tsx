"use client";

import Script from 'next/script';
import { BillingToggle, PlanCards } from '@/components/marketing/PlanCards';
import type { BillingPlan } from '@/lib/billing-plans';
import { useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  BarChart3,
  Check,
  CreditCard,
  Gauge,
  Infinity,
  Landmark,
  LockKeyhole,
  Sparkles,
  WalletCards,
  Zap,
} from 'lucide-react';
import {
  BILLING_PLANS,
  CREDIT_PACKS,
  formatInr,
  getAnnualSavings,
  getPlanPrice,
  getPlanRank,
  type BillingCycle,
  type CreditPackKey,
  type PlanKey,
} from '../../lib/billing-plans';
import { Footer } from '../../components/ui/footer';
import { GradientBorderButton, GradientBorderLink } from '../../components/ui/gradient-border-button';

type Membership = {
  plan: PlanKey;
  status: 'active' | 'trialing' | 'past_due' | 'canceled' | 'pending';
  billingCycle: BillingCycle;
  includedCredits: number;
  usedCredits: number;
  extraCredits: number;
  creditBalance: number | null;
  currentPeriodEnd: string | null;
  active: boolean;
  selected: boolean;
};

const planDetails: Array<[string, keyof BillingPlan['limits']]> = [
  ['Meeting length', 'meetingMinutes'], ['Participants', 'participants'], ['Meeting rooms', 'monthlyRooms'],
  ['Workspace seats', 'seats'], ['AI credits', 'credits'], ['Live captions', 'captions'], ['AI summaries', 'summaries'],
  ['Server recording', 'recordings'], ['File sharing', 'fileSharing'], ['File storage', 'storage'], ['Whiteboards', 'whiteboards'], ['Admin controls', 'adminControls'],
];

function planChangeBlocked(membership: Membership | null, targetPlan: PlanKey) {
  if (!membership?.active) return '';
  if (membership.plan === 'enterprise') return 'Enterprise changes are handled by sales or the system console.';

  const currentRank = getPlanRank(membership.plan);
  const targetRank = getPlanRank(targetPlan);
  if (targetRank >= currentRank) return '';

  return 'Downgrades unlock when your current plan ends.';
}

export default function PricingPage() {
  const [cycle, setCycle] = useState<BillingCycle>('monthly');
  const [membership, setMembership] = useState<Membership | null>(null);
  const [loadingMembership, setLoadingMembership] = useState(false);
  const [busyKey, setBusyKey] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const { data: session, status } = useSession();
  const router = useRouter();
  const isAuthenticated = status === 'authenticated';
  const visiblePlans = useMemo(() => BILLING_PLANS, []);
  const currentPlan = membership?.active ? BILLING_PLANS.find((plan) => plan.key === membership.plan) : null;

  const loadMembership = async () => {
    if (!isAuthenticated) {
      setMembership(null);
      return;
    }

    setLoadingMembership(true);
    try {
      const response = await fetch('/api/billing/subscription', { credentials: 'include' });
      const body = await response.json().catch(() => ({}));
      if (response.ok) {
        setMembership(body.subscription || null);
      }
    } finally {
      setLoadingMembership(false);
    }
  };

  useEffect(() => {
    void loadMembership();
  }, [isAuthenticated]);

  const requireLogin = () => {
    router.push(`/sign-in?callbackUrl=${encodeURIComponent('/pricing')}`);
  };

  const activateFreePlan = async () => {
    setBusyKey('free');
    setMessage(null);
    try {
      const response = await fetch('/api/billing/subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ plan: 'free', billingCycle: 'monthly' }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body.error || 'Could not activate Free plan');
      }
      setMembership(body.subscription);
      setMessage({ type: 'success', text: 'Free plan activated. Your workspace is ready.' });
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || 'Could not activate Free plan' });
    } finally {
      setBusyKey('');
    }
  };

  const openCheckout = async (payload: { planKey?: PlanKey; creditPackKey?: CreditPackKey }) => {
    if (!isAuthenticated) {
      requireLogin();
      return;
    }

    const actionKey = payload.creditPackKey || payload.planKey || 'checkout';
    setBusyKey(actionKey);
    setMessage(null);

    try {
      const response = await fetch('/api/billing/razorpay/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ...payload, billingCycle: cycle }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body.error || 'Checkout failed');
      }

      const key = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
      if (!key) {
        throw new Error('Missing Razorpay public key');
      }

      const checkout = new (window as any).Razorpay({
        key,
        amount: body.order.amount,
        currency: body.order.currency,
        name: 'Melanam',
        description: payload.creditPackKey ? 'Melanam credit top-up' : `Melanam ${payload.planKey} ${cycle}`,
        order_id: body.order.id,
        handler: async (payment: any) => {
          const verifyResponse = await fetch('/api/billing/razorpay/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              razorpayOrderId: payment.razorpay_order_id,
              razorpayPaymentId: payment.razorpay_payment_id,
              razorpaySignature: payment.razorpay_signature,
            }),
          });
          const verifyBody = await verifyResponse.json().catch(() => ({}));
          if (!verifyResponse.ok) {
            setMessage({ type: 'error', text: verifyBody.error || 'Payment verification failed' });
            return;
          }
          setMembership(verifyBody.subscription);
          setMessage({ type: 'success', text: payload.creditPackKey ? 'Credits added.' : 'Plan activated.' });
        },
        prefill: {
          email: session?.user?.email || '',
        },
        theme: { color: '#3f3f46' },
      });

      checkout.open();
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || 'Checkout failed' });
    } finally {
      setBusyKey('');
    }
  };

  const selectPlan = async (planKey: PlanKey) => {
    if (!isAuthenticated) {
      requireLogin();
      return;
    }

    const blockedReason = planChangeBlocked(membership, planKey);
    if (blockedReason) {
      setMessage({ type: 'error', text: blockedReason });
      return;
    }

    if (planKey === 'enterprise') {
      window.location.href = 'mailto:sales@melanam.com?subject=Melanam%20Enterprise%20Plan';
      return;
    }

    if (planKey === 'free') {
      await activateFreePlan();
      return;
    }

    await openCheckout({ planKey });
  };

  return (
    <>
      <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="afterInteractive" />
      <div className="mx-auto max-w-6xl px-4 pb-20 pt-12 sm:px-6 sm:pt-20">
        <header className="mb-14 text-center">
          <p className="section-kicker mb-4">Melanam pricing</p>
          <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl">Simple, transparent pricing.</h1>
          <p className="mx-auto mb-8 mt-5 max-w-2xl text-zinc-400">Start free. Record on every plan. Upgrade for longer meetings, live captions, and AI notes.</p>
          <BillingToggle cycle={cycle} onChange={setCycle} />
          {loadingMembership && <p role="status" className="mt-4 text-sm text-zinc-400">Loading your plan…</p>}
        </header>
        {message && <div role="status" className={'mb-8 rounded-xl border p-4 text-sm ' + (message.type === 'error' ? 'border-red-500/30 bg-red-500/10 text-red-300' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300')}>{message.text}</div>}
        {currentPlan && <section className="mb-10 flex flex-wrap items-center justify-between gap-6 rounded-2xl border border-zinc-700 bg-zinc-900 p-6">
          <div><p className="section-kicker">Your current plan</p><h2 className="mt-2 text-2xl font-semibold text-white">{currentPlan.title}</h2><p className="mt-1 text-sm text-zinc-400">{membership.creditBalance == null ? 'Custom AI credits' : Math.round(membership.creditBalance) + ' AI credits remaining'}</p></div>
          <GradientBorderLink href="/meetings" variant="light">Go to meetings <ArrowRight className="h-4 w-4" /></GradientBorderLink>
        </section>}
        <PlanCards cycle={cycle} action={planKey => {
          const isCurrent = membership?.active && membership.plan === planKey;
          const blocked = planChangeBlocked(membership, planKey);
          return <><button onClick={() => selectPlan(planKey)} disabled={Boolean(isCurrent || busyKey || blocked || loadingMembership)} className={(planKey === 'pro' ? 'button-primary shimmer-btn' : 'button-secondary') + ' w-full'}>{isCurrent ? 'Current plan' : blocked ? 'Downgrade locked' : busyKey === planKey ? 'Working…' : planKey === 'free' ? 'Get started free' : planKey === 'enterprise' ? 'Contact sales' : 'Choose ' + BILLING_PLANS.find(plan => plan.key === planKey)?.title}</button>{blocked && <p className="mt-3 text-xs text-zinc-400">{blocked}</p>}</>;
        }} />
        <section className="py-24" aria-labelledby="plan-details-title">
          <h2 id="plan-details-title" className="mb-3 text-center text-3xl font-bold tracking-tight text-white">Find your perfect fit.</h2>
          <p className="mb-10 text-center text-zinc-400">Every plan detail, in one place.</p>
          <div className="overflow-x-auto rounded-2xl border border-zinc-800" tabIndex={0} role="region" aria-label="Plan details; scroll horizontally">
            <table className="comparison-table"><caption className="sr-only">Melanam plan features and allowances</caption><thead><tr><th scope="col">Included</th>{BILLING_PLANS.map(plan => <th key={plan.key} scope="col">{plan.title}</th>)}</tr></thead><tbody>
              {planDetails.map(([label,key]) => <tr key={key}><th scope="row">{label}</th>{BILLING_PLANS.map(plan => <td key={plan.key}>{plan.limits[key]}</td>)}</tr>)}
            </tbody></table>
          </div>
          <p className="mt-4 text-xs leading-6 text-zinc-400">Recording allowances reset monthly in UTC, including annual plans. Recording storage is separate from file storage. One server recording at a time per workspace.</p>
        </section>
        <section aria-labelledby="credits-title">
          <div className="mb-10 text-center"><h2 id="credits-title" className="text-3xl font-bold tracking-tight text-white">A little extra, when you need it.</h2><p className="mt-4 text-zinc-400">Top up credits for AI notes and captions. Your recording allowance stays separate.</p></div>
          <div className="grid gap-4 md:grid-cols-3">{CREDIT_PACKS.map(pack => <article key={pack.key} className="template-card flex flex-col"><h3 className="text-lg font-semibold text-white">{pack.title}</h3><strong className="mt-4 text-3xl text-white">{formatInr(pack.amountInr)}</strong><p className="mt-2 text-sm text-zinc-300">{pack.credits} credits</p><p className="mb-6 mt-3 flex-1 text-sm text-zinc-400">{pack.description}</p><button onClick={() => openCheckout({ creditPackKey: pack.key })} disabled={!membership?.active || Boolean(busyKey)} className="button-secondary w-full">{busyKey === pack.key ? 'Opening…' : 'Add credits'}</button></article>)}</div>
          {!membership?.active && <p className="mt-4 text-center text-sm text-zinc-400">Activate a plan to add extra credits.</p>}
        </section>
      </div>
      <Footer />
    </>
  );
}
