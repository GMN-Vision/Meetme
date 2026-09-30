'use client';

import { useEffect, useState } from 'react';
import { BILLING_PLANS, formatInr, getPlanPrice, type BillingCycle, type PlanKey } from '@/lib/billing-plans';

type Subscription = {
  _id: string;
  userId: string;
  userEmail: string;
  userName?: string;
  userRole?: string;
  userStatus?: string;
  plan: PlanKey;
  status: 'active' | 'trialing' | 'past_due' | 'canceled' | 'pending';
  billingCycle: BillingCycle;
  amount: number;
  currency: 'INR' | 'USD';
  includedCredits: number;
  usedCredits: number;
  extraCredits: number;
  creditBalance: number | null;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
  active: boolean;
  selected: boolean;
  notes?: string;
  updatedAt: string | null;
};

const statusClasses: Record<Subscription['status'], string> = {
  active: 'bg-emerald-50 text-emerald-700 ring-emerald-500/20',
  trialing: 'bg-cyan-50 text-cyan-700 ring-cyan-500/20',
  pending: 'bg-amber-50 text-amber-700 ring-amber-500/20',
  past_due: 'bg-orange-50 text-orange-700 ring-orange-500/20',
  canceled: 'bg-red-50 text-red-700 ring-red-500/20',
};

function formatDate(value: string | null) {
  if (!value) return 'No period';
  return new Date(value).toLocaleDateString();
}

function planAmount(plan: PlanKey, cycle: BillingCycle) {
  return getPlanPrice(plan, cycle) || 0;
}

export default function AdminSubscriptionTable() {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const fetchSubscriptions = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/admin/subscriptions', { credentials: 'include' });
      if (response.status === 403) {
        window.location.href = '/admin/login';
        return;
      }
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to load subscriptions');
      }
      setSubscriptions(data.subscriptions || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load subscriptions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchSubscriptions();
  }, []);

  const updateSubscription = async (subscription: Subscription, updates: Partial<Subscription> & Record<string, any>) => {
    const savingKey = subscription._id || subscription.userEmail;
    setSavingId(savingKey);
    setError('');

    try {
      const response = await fetch('/api/admin/subscriptions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          subscriptionId: subscription._id || undefined,
          userEmail: subscription.userEmail,
          ...updates,
        }),
      });
      if (response.status === 403) {
        window.location.href = '/admin/login';
        return;
      }
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to update subscription');
      }
      setSubscriptions((prev) =>
        prev.map((item) =>
          (item._id && item._id === subscription._id) || item.userEmail === subscription.userEmail
            ? { ...item, ...data.subscription, selected: true }
            : item
        )
      );
    } catch (err: any) {
      setError(err.message || 'Failed to update subscription');
    } finally {
      setSavingId(null);
    }
  };

  const cancelSubscription = async (subscription: Subscription) => {
    if (!subscription._id) {
      await updateSubscription(subscription, { action: 'cancel' });
      return;
    }

    if (!confirm('Cancel this membership?')) return;
    const savingKey = subscription._id || subscription.userEmail;
    setSavingId(savingKey);
    setError('');

    try {
      const response = await fetch(`/api/admin/subscriptions?subscriptionId=${encodeURIComponent(subscription._id)}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (response.status === 403) {
        window.location.href = '/admin/login';
        return;
      }
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to cancel subscription');
      }
      setSubscriptions((prev) =>
        prev.map((item) => (item._id === subscription._id ? { ...item, ...data.subscription } : item))
      );
    } catch (err: any) {
      setError(err.message || 'Failed to cancel subscription');
    } finally {
      setSavingId(null);
    }
  };

  if (loading) {
    return <div className="text-sm text-slate-500">Loading memberships...</div>;
  }

  if (error) {
    return <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>;
  }

  if (!subscriptions.length) {
    return <div className="text-sm text-slate-500">No users found yet.</div>;
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Active</p>
          <p className="mt-2 font-display text-2xl font-semibold text-slate-950">
            {subscriptions.filter((item) => item.active).length}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">No Plan</p>
          <p className="mt-2 font-display text-2xl font-semibold text-slate-950">
            {subscriptions.filter((item) => !item.selected).length}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Paid Plans</p>
          <p className="mt-2 font-display text-2xl font-semibold text-slate-950">
            {subscriptions.filter((item) => item.active && ['pro', 'business', 'enterprise'].includes(item.plan)).length}
          </p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-[1180px] divide-y divide-slate-200 text-left text-sm text-slate-600">
          <thead className="bg-slate-50 font-semibold text-slate-800">
            <tr>
              <th className="px-4 py-4">Member</th>
              <th className="px-4 py-4">Plan</th>
              <th className="px-4 py-4">Status</th>
              <th className="px-4 py-4">Credits</th>
              <th className="px-4 py-4">Period</th>
              <th className="px-4 py-4">Amount</th>
              <th className="px-4 py-4">Notes</th>
              <th className="px-4 py-4 text-right">Console Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {subscriptions.map((subscription) => {
              const saving = savingId === (subscription._id || subscription.userEmail);
              return (
                <tr key={subscription._id || subscription.userEmail} className="align-top transition hover:bg-slate-50/60">
                  <td className="px-4 py-4">
                    <div className="font-medium text-slate-900">{subscription.userEmail}</div>
                    <div className="mt-1 text-xs text-slate-500">
                      {[subscription.userName || 'No name', subscription.userRole || 'user', subscription.userStatus || 'active'].join(' - ')}
                    </div>
                    {!subscription.selected ? (
                      <span className="mt-2 inline-flex rounded-lg bg-amber-50 px-2 py-1 text-sm font-semibold text-amber-700 ring-1 ring-amber-500/20">
                        No plan selected
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-4">
                    <select
                      value={subscription.plan}
                      onChange={(event) => {
                        const nextPlan = event.target.value as PlanKey;
                        updateSubscription(subscription, {
                          plan: nextPlan,
                          amount: planAmount(nextPlan, subscription.billingCycle),
                        });
                      }}
                      className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold"
                      disabled={saving}
                    >
                      {BILLING_PLANS.map((plan) => (
                        <option key={plan.key} value={plan.key}>
                          {plan.title}
                        </option>
                      ))}
                    </select>
                    <select
                      value={subscription.billingCycle}
                      onChange={(event) =>
                        updateSubscription(subscription, {
                          billingCycle: event.target.value as BillingCycle,
                          amount: planAmount(subscription.plan, event.target.value as BillingCycle),
                        })
                      }
                      className="mt-2 block rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold"
                      disabled={saving}
                    >
                      <option value="monthly">Monthly</option>
                      <option value="annual">Annual</option>
                    </select>
                  </td>
                  <td className="px-4 py-4">
                    <select
                      value={subscription.status}
                      onChange={(event) => updateSubscription(subscription, { status: event.target.value as any })}
                      className={`rounded-lg px-2 py-1 text-xs font-semibold ring-1 ${statusClasses[subscription.status]}`}
                      disabled={saving}
                    >
                      <option value="pending">Pending</option>
                      <option value="active">Active</option>
                      <option value="trialing">Trialing</option>
                      <option value="past_due">Past Due</option>
                      <option value="canceled">Canceled</option>
                    </select>
                    <p className="mt-2 text-xs text-slate-500">{subscription.cancelAtPeriodEnd ? 'Cancels at period end' : 'Renewal allowed'}</p>
                  </td>
                  <td className="px-4 py-4">
                    <div className="text-xs leading-5">
                      <div><span className="font-semibold text-slate-800">Left:</span> {subscription.creditBalance == null ? 'Custom' : Math.round(subscription.creditBalance)}</div>
                      <div><span className="font-semibold text-slate-800">Included:</span> {Math.round(subscription.includedCredits)}</div>
                      <div><span className="font-semibold text-slate-800">Used:</span> {Math.round(subscription.usedCredits)}</div>
                      <div><span className="font-semibold text-slate-800">Extra:</span> {Math.round(subscription.extraCredits)}</div>
                    </div>
                  </td>
                  <td className="px-4 py-4 text-xs text-slate-500">
                    <div>{formatDate(subscription.currentPeriodEnd)}</div>
                    <button
                      disabled={saving}
                      onClick={() => updateSubscription(subscription, { action: 'extend', extendDays: 30 })}
                      className="mt-2 rounded-lg border border-slate-200 px-2 py-1 font-semibold text-slate-700 hover:bg-white disabled:opacity-50"
                    >
                      Extend 30d
                    </button>
                  </td>
                  <td className="px-4 py-4">
                    <input
                      type="number"
                      defaultValue={subscription.amount}
                      onBlur={(event) => updateSubscription(subscription, { amount: Number(event.target.value) })}
                      className="w-24 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs"
                      disabled={saving}
                    />
                    <p className="mt-2 text-xs text-slate-500">{formatInr(subscription.amount)}</p>
                  </td>
                  <td className="px-4 py-4">
                    <input
                      defaultValue={subscription.notes || ''}
                      onBlur={(event) => updateSubscription(subscription, { notes: event.target.value })}
                      className="w-44 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs"
                      disabled={saving}
                    />
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex flex-wrap justify-end gap-2">
                      <button
                        disabled={saving}
                        onClick={() => updateSubscription(subscription, { plan: 'pro', amount: planAmount('pro', 'monthly'), billingCycle: 'monthly', action: 'activate' })}
                        className="rounded-lg bg-cyan-600 px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                      >
                        Give Pro
                      </button>
                      <button
                        disabled={saving}
                        onClick={() => updateSubscription(subscription, { plan: 'business', amount: planAmount('business', 'monthly'), billingCycle: 'monthly', action: 'activate' })}
                        className="rounded-lg bg-slate-950 px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                      >
                        Give Business
                      </button>
                      <button
                        disabled={saving}
                        onClick={() => updateSubscription(subscription, { action: 'activate' })}
                        className="rounded-lg border border-emerald-200 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 disabled:opacity-50"
                      >
                        Activate
                      </button>
                      <button
                        disabled={saving}
                        onClick={() => updateSubscription(subscription, { action: 'grantCredits', creditAmount: 300 })}
                        className="rounded-lg border border-sky-200 px-2.5 py-1.5 text-xs font-semibold text-sky-700 disabled:opacity-50"
                      >
                        +300
                      </button>
                      <button
                        disabled={saving}
                        onClick={() => updateSubscription(subscription, { action: 'resetCredits' })}
                        className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-50"
                      >
                        Reset
                      </button>
                      <button
                        disabled={saving}
                        onClick={() => cancelSubscription(subscription)}
                        className="rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-semibold text-red-600 disabled:opacity-50"
                      >
                        {saving ? 'Saving...' : 'Cancel'}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
