"use client";

import Script from 'next/script';
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

const valueStats = [
  { label: 'Razorpay-ready', value: 'INR', icon: Landmark },
  { label: 'Paid gateway reserve', value: '2.36%', icon: BarChart3 },
  { label: 'Credits start from', value: 'Rs. 0.69/min', icon: Gauge },
];

const comparisonRows = [
  ['Meeting rooms', 'Unlimited', 'Unlimited', 'Unlimited'],
  ['People who can join', '25', '150', '500'],
  ['Workspace seats', '1', '25', '100'],
  ['Maximum meeting length', '3 hours', '24 hours', '48 hours'],
  ['AI live captions', 'Not included', 'Included credits', 'Team credits'],
  ['AI meeting summaries', 'Not included', 'Included', 'Advanced notes and tasks'],
  ['Recording and replay', 'Not included', 'Local recording', 'Recording workspace'],
  ['File, media, and document sharing', '100 MB / upload', '1 GB / upload', '5 GB / upload'],
  ['Workspace storage', '1 GB', '50 GB', '250 GB'],
  ['Excalidraw whiteboard', '1 board / meeting', 'Unlimited boards', 'Boards and templates'],
  ['YouTube livestreaming', 'Not included', 'Not included', 'Included'],
  ['LMS workspace', 'Student and instructor basics', 'Full LMS', 'LMS and organization controls'],
  ['Admin controls', 'Not included', 'Basic member controls', 'Full plan and policy controls'],
];

const competitorRows = [
  ['Free group meeting length', '3 hours', '40 minutes', '60 minutes'],
  ['Free-plan participants', '25', '100', '100'],
  ['Collaboration canvas', 'Excalidraw whiteboard', 'Zoom Whiteboard', 'Workspace tools'],
  ['Live captions', 'Pro and Business', 'Plan dependent', 'Account or edition dependent'],
  ['YouTube livestreaming', 'Business included', 'Plan or add-on dependent', 'Eligible Workspace editions'],
  ['File, media, and document sharing', 'Built into workspace', 'In-meeting and app ecosystem', 'Google Drive ecosystem'],
  ['AI meeting recap', 'Pro and Business included', 'Product or add-on dependent', 'Workspace edition dependent'],
];

function PlanPrice({ planKey, cycle }: { planKey: PlanKey; cycle: BillingCycle }) {
  const price = getPlanPrice(planKey, cycle);
  const suffix = planKey === 'enterprise' ? '' : cycle === 'annual' ? '/year' : '/month';

  return (
    <div className="pricing-plan-price">
      <span>{formatInr(price)}</span>
      {suffix ? <small>{suffix}</small> : null}
    </div>
  );
}

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
        theme: { color: '#ef233c' },
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
      <div className="pricing-noir page-shell-wide pb-20 sm:pb-28">
        <header className="pricing-hero">
          <div className="pricing-hero__copy">
            <p className="pricing-kicker"><Sparkles /> Melanam pricing</p>
            <h1>Simple plans.<br /><span>Serious capability.</span></h1>
            <p className="pricing-hero__description">
              Start with full 3-hour meetings at no cost. Upgrade when live captions, recordings, AI notes, YouTube livestreaming, and larger team workflows become daily work.
            </p>

            <div className="pricing-cycle" aria-label="Billing cycle">
              {(['monthly', 'annual'] as BillingCycle[]).map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setCycle(item)}
                  className={cycle === item ? 'pricing-cycle__option pricing-cycle__option--active' : 'pricing-cycle__option'}
                  aria-pressed={cycle === item}
                >
                  {item === 'monthly' ? 'Monthly' : 'Annual'}
                </button>
              ))}
            </div>
            <div className="pricing-trust-line">
              <span><Check /> 3-hour free meetings</span>
              <span><Check /> Unlimited rooms</span>
              <span><Check /> Save up to 2 months yearly</span>
              <span><Check /> Secure INR checkout</span>
            </div>
          </div>

          <aside className="pricing-assurance" aria-label="Membership and checkout information">
            <div className="pricing-assurance__topline">
              <span><LockKeyhole /> Membership status</span>
              <b>{isAuthenticated ? 'Signed in' : 'Secure access'}</b>
            </div>
            {loadingMembership ? (
              <p className="pricing-assurance__loading">Loading membership...</p>
            ) : membership?.active ? (
              <div className="pricing-assurance__membership">
                <span>Current workspace</span>
                <strong>{BILLING_PLANS.find((plan) => plan.key === membership.plan)?.title || membership.plan}</strong>
                <p>Active until {membership.currentPeriodEnd ? new Date(membership.currentPeriodEnd).toLocaleDateString() : 'manual renewal'} · {membership.creditBalance == null ? 'Custom credits' : `${Math.round(membership.creditBalance)} credits left`}</p>
                <GradientBorderLink href="/lms" variant="dark" className="mt-1 w-fit">
                  Continue to LMS <ArrowRight className="h-4 w-4" />
                </GradientBorderLink>
              </div>
            ) : (
              <div className="pricing-assurance__membership">
                <span>Workspace access</span>
                <strong>Choose a plan to begin.</strong>
                <p>Free activates without payment. Paid plans unlock after Razorpay verification.</p>
              </div>
            )}
            <div className="pricing-assurance__stats">
              {valueStats.map(({ label, value, icon: Icon }) => (
                <div key={label}>
                  <span><Icon /> {label}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>
            <small>Seats are signed-in workspace members. Meeting participants are counted separately.</small>
          </aside>
        </header>

        {message ? (
          <div className={`pricing-message pricing-message--${message.type}`} role="status">{message.text}</div>
        ) : null}

        {currentPlan ? (
          <section className="pricing-current-plan">
            <div>
              <p className="pricing-kicker">Current plan</p>
              <h2>{currentPlan.title}</h2>
              <p>{currentPlan.description} You can upgrade at any time. Downgrades unlock after this plan ends.</p>
            </div>
            <dl>
              <div><dt>Rooms</dt><dd>{currentPlan.limits.monthlyRooms}</dd></div>
              <div><dt>Participants</dt><dd>{currentPlan.limits.participants}</dd></div>
              <div><dt>Seats</dt><dd>{currentPlan.limits.seats}</dd></div>
              <div><dt>Credits left</dt><dd>{membership.creditBalance == null ? 'Custom' : Math.round(membership.creditBalance)}</dd></div>
            </dl>
          </section>
        ) : null}

        <section className="pricing-plans" aria-labelledby="pricing-plans-title">
          <div className="pricing-section-heading">
            <div>
              <p className="pricing-kicker">{currentPlan ? 'All plans' : 'Choose your plan'}</p>
              <h2 id="pricing-plans-title">One clear tier for every stage.</h2>
            </div>
            <p>All plans include unlimited meeting rooms.</p>
          </div>

          <div className={`pricing-plan-grid ${visiblePlans.length < 4 ? 'pricing-plan-grid--compact' : ''}`}>
            {visiblePlans.map((plan) => {
              const isCurrent = membership?.active && membership.plan === plan.key;
              const annualSavings = getAnnualSavings(plan.key);
              const blockedReason = planChangeBlocked(membership, plan.key);
              const disabled = Boolean(isCurrent || busyKey || blockedReason);

              return (
                <article key={plan.key} className={`pricing-plan-card ${plan.recommended ? 'pricing-plan-card--recommended' : ''}`}>
                  {plan.recommended ? <span className="pricing-plan-card__recommended">Recommended</span> : null}
                  <div className="pricing-plan-card__header">
                    <span>{plan.badge}</span>
                    <h3>{plan.title}</h3>
                    <p>{plan.description}</p>
                  </div>

                  <div className="pricing-plan-card__price">
                    <PlanPrice planKey={plan.key} cycle={cycle} />
                    {cycle === 'annual' && annualSavings > 0 ? <span>Save {formatInr(annualSavings)} yearly</span> : null}
                  </div>

                  <dl className="pricing-plan-card__metrics">
                    <div><dt>Room length</dt><dd>{plan.limits.meetingMinutes}</dd></div>
                    <div><dt>Participants</dt><dd>{plan.limits.participants}</dd></div>
                    <div><dt>Workspace seats</dt><dd>{plan.limits.seats}</dd></div>
                    <div><dt>Credits</dt><dd>{plan.limits.credits}</dd></div>
                  </dl>

                  <ul className="pricing-plan-card__features">
                    {plan.highlights.map((highlight) => (
                      <li key={highlight}><Check /> <span>{highlight}</span></li>
                    ))}
                  </ul>

                  <div className="pricing-plan-card__action">
                    <GradientBorderButton
                      variant={plan.recommended ? 'create' : 'dark'}
                      onClick={() => selectPlan(plan.key)}
                      disabled={disabled}
                      className="w-full"
                    >
                      {plan.key === 'enterprise' ? <Infinity className="h-4 w-4" /> : <CreditCard className="h-4 w-4" />}
                      {isCurrent ? 'Current plan' : blockedReason ? 'Downgrade locked' : busyKey === plan.key ? 'Working...' : plan.key === 'free' ? 'Activate Free' : plan.key === 'enterprise' ? 'Contact Sales' : `Buy ${plan.title}`}
                    </GradientBorderButton>
                    {blockedReason ? <p>{blockedReason}</p> : null}
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <section className="pricing-comparison" aria-labelledby="pricing-comparison-title">
          <div className="pricing-section-heading">
            <div>
              <p className="pricing-kicker">System matrix</p>
              <h2 id="pricing-comparison-title">Everything included, at a glance.</h2>
            </div>
            <p>Compare meeting limits, collaboration, sharing, AI, and admin tools.</p>
          </div>
          <div className="pricing-comparison__scroll">
            <div className="pricing-comparison__table">
              <div className="pricing-comparison__head">
                <span>Capability</span><span>Free</span><span>Pro</span><span>Business</span>
              </div>
              {comparisonRows.map(([feature, free, pro, business]) => (
                <div key={feature} className="pricing-comparison__row">
                  <strong>{feature}</strong><span>{free}</span><span>{pro}</span><span>{business}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="pricing-benchmark" aria-labelledby="pricing-benchmark-title">
          <div className="pricing-section-heading">
            <div>
              <p className="pricing-kicker">How we compare</p>
              <h2 id="pricing-benchmark-title">More time to meet. More ways to work together.</h2>
            </div>
            <p>Melanam combines video meetings with a collaborative workspace, rather than making teams stitch together separate tools.</p>
          </div>
          <div className="pricing-benchmark__scroll">
            <div className="pricing-benchmark__table">
              <div className="pricing-benchmark__head">
                <span>Capability</span><span>Melanam</span><span>Zoom</span><span>Google Meet</span>
              </div>
              {competitorRows.map(([feature, melanam, zoom, meet]) => (
                <div key={feature} className="pricing-benchmark__row">
                  <strong>{feature}</strong><span>{melanam}</span><span>{zoom}</span><span>{meet}</span>
                </div>
              ))}
            </div>
          </div>
          <p className="pricing-benchmark__note">
            Provider allowances and availability vary by account, edition, region, and configuration. Free meeting-time and participant figures are based on published <a href="https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0067966" target="_blank" rel="noreferrer">Zoom</a> and <a href="https://support.google.com/meet/answer/13396001" target="_blank" rel="noreferrer">Google Meet</a> documentation.
          </p>
        </section>

        <section className="pricing-credits" aria-labelledby="pricing-credits-title">
          <div className="pricing-credits__intro">
            <span><WalletCards /></span>
            <p className="pricing-kicker">On-demand power</p>
            <h2 id="pricing-credits-title">Extra credits, only when needed.</h2>
            <p>Top up AI summaries, captions, and recording workflows without changing your plan.</p>
          </div>
          <div className="pricing-credit-grid">
            {CREDIT_PACKS.map((pack) => (
              <article key={pack.key} className={pack.key === 'growth' ? 'pricing-credit-card pricing-credit-card--popular' : 'pricing-credit-card'}>
                {pack.key === 'growth' ? <span className="pricing-credit-card__badge">Popular</span> : null}
                <div>
                  <span>{pack.title}</span>
                  <strong>{formatInr(pack.amountInr)}</strong>
                  <b>{pack.credits} credits</b>
                  <p>{pack.description}</p>
                </div>
                <button
                  type="button"
                  onClick={() => openCheckout({ creditPackKey: pack.key })}
                  disabled={!membership?.active || Boolean(busyKey)}
                  className={pack.key === 'growth' ? 'noir-shimmer-button' : ''}
                >
                  <span><Zap /> {busyKey === pack.key ? 'Opening...' : 'Select pack'}</span>
                </button>
              </article>
            ))}
          </div>
          {!membership?.active ? <p className="pricing-credits__note">Activate Free, Pro, or Business before adding credits.</p> : null}
        </section>
      </div>
      <Footer />
    </>
  );
}
