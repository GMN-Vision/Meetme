export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '../../../../lib/db';
import Subscription from '../../../../models/Subscription';
import User from '../../../../models/User';
import { getAdminAuthorization } from '../../../../lib/admin-auth';
import { BILLING_PLAN_MAP, getIncludedCredits, getPlanPrice, type BillingCycle, type PlanKey } from '../../../../lib/billing-plans';
import { getNextPeriodEnd, resetMembershipCredits, serializeMembership } from '../../../../lib/membership';

async function listSubscriptions(request: NextRequest) {
  const auth = await getAdminAuthorization(request);
  if (!auth.authorized) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  await dbConnect();
  const [users, subscriptions] = await Promise.all([
    User.find({}).sort({ createdAt: -1 }).lean(),
    Subscription.find({}).sort({ updatedAt: -1 }),
  ]);

  const subscriptionsByEmail = new Map<string, typeof subscriptions[number]>();
  for (const subscription of subscriptions) {
    const email = String(subscription.userEmail || '').trim().toLowerCase();
    if (email && !subscriptionsByEmail.has(email)) subscriptionsByEmail.set(email, subscription);
  }
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

async function updateSubscription(request: NextRequest) {
  const auth = await getAdminAuthorization(request);
  if (!auth.authorized) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await request.json();
  const validationError = validateUpdate(body);
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });
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
    subscription = await Subscription.findOne({ userEmail: String(userEmail).trim().toLowerCase() }).sort({ updatedAt: -1 });
  }

  if (!subscription && userEmail) {
    const user = await User.findOne({ email: String(userEmail).trim().toLowerCase() });
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

  if (billingCycle !== undefined) subscription.billingCycle = billingCycle;
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
  if (billingCycle !== undefined && plan === undefined && amount === undefined) {
    const planAmount = getPlanPrice(subscription.plan as PlanKey, subscription.billingCycle as BillingCycle);
    if (planAmount != null) subscription.amount = planAmount;
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

async function cancelSubscription(request: NextRequest) {
  const auth = await getAdminAuthorization(request);
  if (!auth.authorized) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const searchParams = request.nextUrl.searchParams;
  const subscriptionId = searchParams.get('subscriptionId');
  if (!subscriptionId) return NextResponse.json({ error: 'subscriptionId required' }, { status: 400 });
  if (!/^[a-f0-9]{24}$/i.test(subscriptionId)) return NextResponse.json({ error: 'Invalid subscription ID' }, { status: 400 });

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

function validateUpdate(body: any) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return 'A membership update is required';
  if (body.subscriptionId && (typeof body.subscriptionId !== 'string' || !/^[a-f0-9]{24}$/i.test(body.subscriptionId))) return 'Invalid subscription ID';
  if (body.userEmail !== undefined && (typeof body.userEmail !== 'string' || !body.userEmail.trim())) return 'Invalid member email';
  if (body.plan !== undefined && !['free', 'pro', 'business', 'enterprise'].includes(body.plan)) return 'Invalid plan';
  if (body.status !== undefined && !['active', 'trialing', 'past_due', 'canceled', 'pending'].includes(body.status)) return 'Invalid membership status';
  if (body.billingCycle !== undefined && !['monthly', 'annual'].includes(body.billingCycle)) return 'Invalid billing cycle';
  if (body.action !== undefined && !['activate', 'cancel', 'extend', 'resetCredits', 'grantCredits'].includes(body.action)) return 'Invalid membership action';
  if (body.cancelAtPeriodEnd !== undefined && typeof body.cancelAtPeriodEnd !== 'boolean') return 'Cancellation flag must be true or false';
  if (body.notes !== undefined && typeof body.notes !== 'string') return 'Notes must be text';
  for (const field of ['amount', 'includedCredits', 'usedCredits', 'extraCredits']) {
    if (body[field] !== undefined && (typeof body[field] !== 'number' || !Number.isFinite(body[field]) || body[field] < 0)) return `${field} must be a non-negative number`;
  }
  for (const [action, field] of [['extend', 'extendDays'], ['grantCredits', 'creditAmount']]) {
    if (body.action === action && body[field] !== undefined && (!Number.isSafeInteger(body[field]) || body[field] < 1)) return `${field} must be a positive whole number`;
  }
  if (body.currentPeriodEnd && (typeof body.currentPeriodEnd !== 'string' || !Number.isFinite(new Date(body.currentPeriodEnd).getTime()))) return 'Invalid membership end date';
  return '';
}

async function respond(action: string, handler: () => Promise<NextResponse>) {
  try { return await handler(); }
  catch (error: any) {
    if (error instanceof SyntaxError) return NextResponse.json({ error: 'Invalid JSON request' }, { status: 400 });
    if (error.name === 'CastError' || error.name === 'ValidationError') {
      const fields = Object.keys(error.errors || {});
      return NextResponse.json({ error: fields.length ? `Invalid membership fields: ${fields.join(', ')}. Check the values and save again.` : 'Invalid membership value or ID' }, { status: 400 });
    }
    if (error.code === 11000) return NextResponse.json({ error: 'A membership already exists for this user. Refresh the list and try again.' }, { status: 409 });
    console.error(`[admin/subscriptions] Unable to ${action}`, error);
    const unavailable = ['MongoServerSelectionError', 'MongooseServerSelectionError', 'MongoNetworkError', 'MongoNetworkTimeoutError'].includes(error.name);
    return NextResponse.json({ error: unavailable ? 'The membership database is temporarily unavailable. Please retry.' : `Unable to ${action}. Please retry or check the server logs.` }, { status: unavailable ? 503 : 500 });
  }
}

export async function GET(request: NextRequest) { return respond('load memberships', () => listSubscriptions(request)); }
export async function PATCH(request: NextRequest) { return respond('save membership', () => updateSubscription(request)); }
export async function DELETE(request: NextRequest) { return respond('cancel membership', () => cancelSubscription(request)); }

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
