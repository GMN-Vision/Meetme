export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '../../../../lib/db';
import Subscription from '../../../../models/Subscription';
import User from '../../../../models/User';
import { getAdminAuthorization } from '../../../../lib/admin-auth';
import { BILLING_PLAN_MAP, getIncludedCredits, getPlanPrice, type BillingCycle, type PlanKey } from '../../../../lib/billing-plans';
import { getNextPeriodEnd, resetMembershipCredits, serializeMembership } from '../../../../lib/membership';

export async function GET(request: NextRequest) {
  const auth = await getAdminAuthorization(request);
  if (!auth.authorized) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  await dbConnect();
  const [users, subscriptions] = await Promise.all([
    User.find({}).sort({ createdAt: -1 }).lean(),
    Subscription.find({}).sort({ updatedAt: -1 }),
  ]);

  const subscriptionsByEmail = new Map(subscriptions.map((subscription) => [subscription.userEmail.toLowerCase(), subscription]));
  const rows: any[] = users.map((user: any) => {
    const email = String(user.email || '').toLowerCase();
    const subscription = subscriptionsByEmail.get(email);
    subscriptionsByEmail.delete(email);

    return {
      ...(serializeMembership(subscription) || buildUnselectedMembershipRow(user)),
      userName: user.name || '',
      userRole: user.role === 'admin' ? 'admin' : 'user',
      userStatus: user.status || 'active',
    };
  });

  subscriptionsByEmail.forEach((subscription) => {
    rows.push({
      ...serializeMembership(subscription),
      userName: '',
      userRole: 'user',
      userStatus: 'active',
    });
  });

  return NextResponse.json({ success: true, subscriptions: rows });
}

export async function PATCH(request: NextRequest) {
  const auth = await getAdminAuthorization(request);
  if (!auth.authorized) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await request.json();
  const {
    subscriptionId,
    userEmail,
    plan,
    status,
    cancelAtPeriodEnd,
    notes,
    amount,
    billingCycle,
    includedCredits,
    usedCredits,
    extraCredits,
    currentPeriodEnd,
    action,
    creditAmount,
    extendDays,
  } = body;

  if (!subscriptionId && !userEmail) {
    return NextResponse.json({ error: 'subscriptionId or userEmail required' }, { status: 400 });
  }

  await dbConnect();
  let subscription = subscriptionId ? await Subscription.findById(subscriptionId) : null;

  if (!subscription && userEmail) {
    const user = await User.findOne({ email: String(userEmail).toLowerCase() });
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    subscription = new Subscription({
      userId: user._id.toString(),
      userEmail: user.email,
      plan: 'free',
      status: 'pending',
      billingCycle: 'monthly',
      amount: 0,
      currency: 'INR',
      includedCredits: getIncludedCredits('free'),
      usedCredits: 0,
      extraCredits: 0,
      cancelAtPeriodEnd: false,
      notes: 'Created by system console',
    });
  }

  if (!subscription) return NextResponse.json({ error: 'Subscription not found' }, { status: 404 });

  if (plan !== undefined) {
    const planKey = String(plan) as PlanKey;
    if (!BILLING_PLAN_MAP[planKey]) {
      return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });
    }
    subscription.plan = planKey;
    subscription.includedCredits = getIncludedCredits(planKey);
    const planAmount = getPlanPrice(planKey, subscription.billingCycle as BillingCycle);
    if (amount === undefined && planAmount != null) {
      subscription.amount = planAmount;
    }
  }
  if (status !== undefined) subscription.status = status;
  if (cancelAtPeriodEnd !== undefined) subscription.cancelAtPeriodEnd = cancelAtPeriodEnd;
  if (notes !== undefined) subscription.notes = notes;
  if (amount !== undefined) subscription.amount = amount;
  if (billingCycle !== undefined) subscription.billingCycle = billingCycle;
  if (includedCredits !== undefined) subscription.includedCredits = Number(includedCredits);
  if (usedCredits !== undefined) subscription.usedCredits = Number(usedCredits);
  if (extraCredits !== undefined) subscription.extraCredits = Number(extraCredits);
  if (currentPeriodEnd !== undefined) {
    subscription.currentPeriodEnd = currentPeriodEnd ? new Date(currentPeriodEnd) : null;
  }

  if (action === 'activate') {
    subscription.status = 'active';
    subscription.cancelAtPeriodEnd = false;
    subscription.currentPeriodStart = subscription.currentPeriodStart || new Date();
    subscription.currentPeriodEnd = subscription.currentPeriodEnd || getNextPeriodEnd(subscription.billingCycle as BillingCycle);
    subscription.notes = notes || 'Activated by system console';
  }

  if (action === 'cancel') {
    subscription.status = 'canceled';
    subscription.cancelAtPeriodEnd = true;
    subscription.notes = notes || 'Canceled by system console';
  }

  if (action === 'extend') {
    const days = Math.max(1, Number(extendDays || 30));
    const base = subscription.currentPeriodEnd && new Date(subscription.currentPeriodEnd).getTime() > Date.now()
      ? new Date(subscription.currentPeriodEnd)
      : new Date();
    base.setDate(base.getDate() + days);
    subscription.status = 'active';
    subscription.cancelAtPeriodEnd = false;
    subscription.currentPeriodEnd = base;
    subscription.notes = notes || `Extended ${days} days by system console`;
  }

  if (action === 'resetCredits') {
    await resetMembershipCredits(subscription);
  }

  if (action === 'grantCredits') {
    subscription.extraCredits = Number(subscription.extraCredits || 0) + Math.max(0, Number(creditAmount || 0));
    subscription.notes = notes || `Granted ${creditAmount || 0} credits by system console`;
  }

  if (subscription.status === 'active' && !subscription.currentPeriodStart) {
    subscription.currentPeriodStart = new Date();
  }

  if (subscription.status === 'active' && !subscription.currentPeriodEnd && subscription.plan !== 'enterprise') {
    subscription.currentPeriodEnd = getNextPeriodEnd(subscription.billingCycle as BillingCycle);
  }

  subscription.adminOverrideBy = auth.username;
  subscription.adminOverrideAt = new Date();

  await subscription.save();
  return NextResponse.json({ success: true, subscription: serializeMembership(subscription) });
}

export async function DELETE(request: NextRequest) {
  const auth = await getAdminAuthorization(request);
  if (!auth.authorized) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const searchParams = request.nextUrl.searchParams;
  const subscriptionId = searchParams.get('subscriptionId');
  if (!subscriptionId) return NextResponse.json({ error: 'subscriptionId required' }, { status: 400 });

  await dbConnect();
  const subscription = await Subscription.findById(subscriptionId);
  if (!subscription) return NextResponse.json({ error: 'Subscription not found' }, { status: 404 });

  subscription.status = 'canceled';
  subscription.cancelAtPeriodEnd = true;
  subscription.notes = 'Canceled by admin';
  subscription.adminOverrideBy = auth.username;
  subscription.adminOverrideAt = new Date();
  await subscription.save();

  return NextResponse.json({ success: true, subscription: serializeMembership(subscription) });
}

function buildUnselectedMembershipRow(user: any) {
  const now = new Date();
  return {
    _id: '',
    userId: String(user._id || ''),
    userEmail: String(user.email || '').toLowerCase(),
    plan: 'free',
    status: 'pending',
    billingCycle: 'monthly',
    amount: 0,
    currency: 'INR',
    includedCredits: getIncludedCredits('free'),
    usedCredits: 0,
    extraCredits: 0,
    creditBalance: getIncludedCredits('free'),
    cancelAtPeriodEnd: false,
    currentPeriodStart: null,
    currentPeriodEnd: null,
    active: false,
    selected: false,
    notes: 'No plan selected yet',
    updatedAt: now.toISOString(),
  };
}
