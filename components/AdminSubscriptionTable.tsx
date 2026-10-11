'use client';

import { useEffect, useState } from 'react';
import { BILLING_PLANS, getPlanPrice, type BillingCycle, type PlanKey } from '@/lib/billing-plans';

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
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [draft, setDraft] = useState<Subscription | null>(null);
  const [creditAmount, setCreditAmount] = useState(300);
  const [extendDays, setExtendDays] = useState(30);

  const fetchSubscriptions = async () => {
    setLoading(true);
    setError('');
    setNotice('');
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
    setNotice('');

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
      setNotice('Membership updated successfully.');
      setDraft(null);
    } catch (err: any) {
      setError(err.message || 'Failed to update subscription');
    } finally {
      setSavingId(null);
    }
  };

  const cancelSubscription = async (subscription: Subscription) => {
    if (!confirm('Cancel this membership?')) return;
    if (!subscription._id) {
      await updateSubscription(subscription, { action: 'cancel' });
      return;
    }

    const savingKey = subscription._id || subscription.userEmail;
    setSavingId(savingKey);
    setError('');
    setNotice('');

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
      setNotice('Membership canceled.');
      setDraft(null);
    } catch (err: any) {
      setError(err.message || 'Failed to cancel subscription');
    } finally {
      setSavingId(null);
    }
  };

  const visible = subscriptions.filter(item => {
    const matches = `${item.userEmail} ${item.userName || ''}`.toLowerCase().includes(search.trim().toLowerCase());
    return matches && (filter === 'all' || (filter === 'active' ? item.active : !item.selected));
  });
  const runAction = (updates: Record<string, unknown>) => {
    if (!draft) return;
    const saved = subscriptions.find(item => item.userEmail === draft.userEmail);
    if (saved) void updateSubscription(saved, updates);
  };

  return <div className="space-y-5">
    {error && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-200"><span>{error}</span>{!subscriptions.length && <button className="underline" onClick={() => void fetchSubscriptions()}>Retry</button>}</div>}
    {notice && <p role="status" className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-4 text-sm text-emerald-200">{notice}</p>}
    {loading ? <p role="status" className="text-sm text-zinc-400">Loading memberships…</p> : <>
      <div className="flex flex-wrap gap-3">
        <input aria-label="Search memberships" className="input-modern min-w-0 basis-full sm:flex-1" placeholder="Search member name or email" value={search} onChange={e => setSearch(e.target.value)} />
        <select aria-label="Filter memberships" className="px-3 py-2 text-sm" value={filter} onChange={e => setFilter(e.target.value)}><option value="all">All members ({subscriptions.length})</option><option value="active">Active memberships</option><option value="unselected">No plan selected</option></select>
      </div>
      {draft && <form className="rounded-2xl border border-zinc-600 bg-zinc-950 p-5" onSubmit={e => {
        e.preventDefault();
        const saved = subscriptions.find(item => item.userEmail === draft.userEmail);
        if (saved) void updateSubscription(saved, { plan: draft.plan, billingCycle: draft.billingCycle, status: draft.status, amount: draft.amount, notes: draft.notes || '' });
      }}>
        <h3 className="font-semibold">Edit membership</h3><p className="mt-1 break-all text-sm text-zinc-400">{draft.userEmail}</p>
        <fieldset disabled={!!savingId} className="mt-5 space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-2 text-sm text-zinc-400"><span>Plan</span><select className="input-modern" value={draft.plan} onChange={e => { const plan = e.target.value as PlanKey; setDraft({ ...draft, plan, amount: planAmount(plan, draft.billingCycle) }); }}>{BILLING_PLANS.map(plan => <option key={plan.key} value={plan.key}>{plan.title}</option>)}</select></label>
            <label className="space-y-2 text-sm text-zinc-400"><span>Billing cycle</span><select className="input-modern" value={draft.billingCycle} onChange={e => { const billingCycle = e.target.value as BillingCycle; setDraft({ ...draft, billingCycle, amount: planAmount(draft.plan, billingCycle) }); }}><option value="monthly">Monthly</option><option value="annual">Annual</option></select></label>
            <label className="space-y-2 text-sm text-zinc-400"><span>Status</span><select className="input-modern" value={draft.status} onChange={e => setDraft({ ...draft, status: e.target.value as Subscription['status'] })}><option value="pending">Pending</option><option value="active">Active</option><option value="trialing">Trial</option><option value="past_due">Past due</option><option value="canceled">Canceled</option></select></label>
            <label className="space-y-2 text-sm text-zinc-400"><span>Amount ({draft.currency})</span><input className="input-modern" type="number" min="0" step="0.01" required value={draft.amount} onChange={e => setDraft({ ...draft, amount: Number(e.target.value) })} /></label>
          </div>
          <label className="block space-y-2 text-sm text-zinc-400"><span>Admin notes</span><textarea className="input-modern py-3" rows={2} value={draft.notes || ''} onChange={e => setDraft({ ...draft, notes: e.target.value })} /></label>
          <p className="text-xs text-zinc-400">Changes apply only when you save. Changing the plan or billing cycle updates the suggested amount.</p>
          <div className="flex gap-3"><button type="submit" className="button-primary">{savingId ? 'Saving…' : 'Save changes'}</button><button type="button" className="button-secondary" onClick={() => setDraft(null)}>Cancel</button></div>
          <details className="border-t border-zinc-800 pt-4"><summary className="cursor-pointer text-sm text-zinc-300">Credits & membership actions</summary>
            <p className="my-4 text-xs leading-6 text-zinc-400">These actions apply immediately to the saved membership. Save any plan changes above first.</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div><label className="text-sm text-zinc-400">Extra credits<input aria-label="Extra credits" type="number" min="1" step="1" className="input-modern my-2" value={creditAmount} onChange={e => setCreditAmount(Number(e.target.value))} /></label><button type="button" disabled={!Number.isInteger(creditAmount) || creditAmount < 1} onClick={() => runAction({ action: 'grantCredits', creditAmount })} className="button-secondary">Add credits</button></div>
              <div><label className="text-sm text-zinc-400">Extend by days<input aria-label="Extend by days" type="number" min="1" step="1" className="input-modern my-2" value={extendDays} onChange={e => setExtendDays(Number(e.target.value))} /></label><button type="button" disabled={!Number.isInteger(extendDays) || extendDays < 1} onClick={() => runAction({ action: 'extend', extendDays })} className="button-secondary">Extend membership</button></div>
            </div>
            <div className="mt-4 flex flex-wrap gap-3">
              <button type="button" className="button-secondary" onClick={() => runAction({ action: 'activate' })}>Activate membership</button>
              <button type="button" className="button-secondary" onClick={() => { if (confirm('Reset this member’s credit usage?')) runAction({ action: 'resetCredits' }); }}>Reset credit usage</button>
              <button type="button" className="button-secondary !text-red-300" onClick={() => { const saved = subscriptions.find(item => item.userEmail === draft.userEmail); if (saved) void cancelSubscription(saved); }}>Cancel membership</button>
            </div>
          </details>
        </fieldset>
      </form>}
      <p className="text-xs text-zinc-400">{visible.length} members shown</p>
      {!visible.length && <p className="rounded-xl border border-dashed border-zinc-800 p-8 text-center text-sm text-zinc-400">No members found. Try another search or filter.</p>}
      <div className="grid gap-3">{visible.map(item => <article key={item.userEmail} className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-zinc-800 p-4">
        <div className="min-w-0"><h3 className="break-all font-medium">{item.userName || item.userEmail}</h3>{item.userName && <p className="break-all text-sm text-zinc-400">{item.userEmail}</p>}<p className="mt-2 text-sm text-zinc-400">{item.selected ? `${BILLING_PLANS.find(plan => plan.key === item.plan)?.title || item.plan} · ${item.status.replace('_', ' ')}` : 'No plan selected'}</p><p className="mt-1 text-xs text-zinc-500">{item.creditBalance == null ? 'Custom credits' : `${Math.round(item.creditBalance)} credits left`} · Ends: {formatDate(item.currentPeriodEnd)}{item.cancelAtPeriodEnd ? ' · Cancels at period end' : ''}</p></div>
        <button disabled={!!savingId} type="button" className="button-secondary" onClick={() => { setDraft({ ...item }); setError(''); setNotice(''); }}>Edit membership</button>
      </article>)}</div>
    </>}
  </div>;
}
