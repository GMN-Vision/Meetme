import Subscription, { type ISubscription, type SubscriptionPlan } from '@/models/Subscription';
import Meeting from '@/models/Meeting';
import { BILLING_PLAN_MAP, getIncludedCredits, getPlanRank, type BillingCycle, type PlanFeatureKey, type PlanKey } from '@/lib/billing-plans';
import dbConnect from '@/lib/db';

export type SerializedMembership = {
  _id: string;
  userId: string;
  userEmail: string;
  plan: SubscriptionPlan;
  status: ISubscription['status'];
  billingCycle: BillingCycle;
  amount: number;
  currency: 'INR' | 'USD';
  includedCredits: number;
  usedCredits: number;
  extraCredits: number;
  creditBalance: number | null;
  cancelAtPeriodEnd: boolean;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  active: boolean;
  selected: boolean;
  notes: string;
  updatedAt: string | null;
};

export type MembershipCheck =
  | { ok: true; membership: SerializedMembership; subscription: ISubscription; status?: never; error?: never; code?: never }
  | { ok: false; status: number; error: string; code: string; membership?: SerializedMembership | null };

export function getNextPeriodEnd(cycle: BillingCycle, from = new Date()) {
  const end = new Date(from);
  if (cycle === 'annual') {
    end.setFullYear(end.getFullYear() + 1);
  } else {
    end.setMonth(end.getMonth() + 1);
  }
  return end;
}

export function getCreditBalance(subscription: Pick<ISubscription, 'plan' | 'includedCredits' | 'usedCredits' | 'extraCredits'>) {
  if (subscription.plan === 'enterprise') return null;
  return Math.max(0, Number(subscription.includedCredits || 0) + Number(subscription.extraCredits || 0) - Number(subscription.usedCredits || 0));
}

export function isSubscriptionActive(subscription?: ISubscription | null, at = new Date()) {
  if (!subscription) return false;
  if (!['active', 'trialing'].includes(subscription.status)) return false;
  if (subscription.currentPeriodEnd && new Date(subscription.currentPeriodEnd).getTime() < at.getTime()) return false;
  return true;
}

export function serializeMembership(subscription?: ISubscription | null): SerializedMembership | null {
  if (!subscription) return null;

  const active = isSubscriptionActive(subscription);
  return {
    _id: subscription._id.toString(),
    userId: subscription.userId || '',
    userEmail: subscription.userEmail || '',
    plan: subscription.plan,
    status: subscription.status,
    billingCycle: subscription.billingCycle,
    amount: Number(subscription.amount || 0),
    currency: subscription.currency || 'INR',
    includedCredits: Number(subscription.includedCredits || 0),
    usedCredits: Number(subscription.usedCredits || 0),
    extraCredits: Number(subscription.extraCredits || 0),
    creditBalance: getCreditBalance(subscription),
    cancelAtPeriodEnd: Boolean(subscription.cancelAtPeriodEnd),
    currentPeriodStart: subscription.currentPeriodStart ? new Date(subscription.currentPeriodStart).toISOString() : null,
    currentPeriodEnd: subscription.currentPeriodEnd ? new Date(subscription.currentPeriodEnd).toISOString() : null,
    active,
    selected: true,
    notes: subscription.notes || '',
    updatedAt: subscription.updatedAt ? new Date(subscription.updatedAt).toISOString() : null,
  };
}

export async function findMembershipByEmail(userEmail: string) {
  await dbConnect();
  return Subscription.findOne({ userEmail: userEmail.toLowerCase() });
}

export async function activateFreeMembership(user: { _id: unknown; email: string }, notes = 'Free plan selected by user') {
  await dbConnect();
  const now = new Date();
  return Subscription.findOneAndUpdate(
    { userEmail: user.email.toLowerCase() },
    {
      userId: String(user._id),
      userEmail: user.email.toLowerCase(),
      plan: 'free',
      status: 'active',
      billingCycle: 'monthly',
      amount: 0,
      currency: 'INR',
      includedCredits: getIncludedCredits('free'),
      usedCredits: 0,
      extraCredits: 0,
      pendingPurchaseType: '',
      pendingPlanKey: '',
      pendingBillingCycle: '',
      pendingPlanAmount: 0,
      pendingCreditPackKey: '',
      pendingCreditAmount: 0,
      pendingCreditQuantity: 0,
      razorpayOrderId: '',
      cancelAtPeriodEnd: false,
      currentPeriodStart: now,
      currentPeriodEnd: getNextPeriodEnd('monthly', now),
      lastCreditResetAt: now,
      notes,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

export async function upsertPendingPlanMembership({
  user,
  planKey,
  billingCycle,
  amount,
  razorpayOrderId,
}: {
  user: { _id: unknown; email: string };
  planKey: Exclude<PlanKey, 'free' | 'enterprise'>;
  billingCycle: BillingCycle;
  amount: number;
  razorpayOrderId: string;
}) {
  await dbConnect();
  const existing = await Subscription.findOne({ userEmail: user.email.toLowerCase() });
  const pendingFields = {
    userId: String(user._id),
    userEmail: user.email.toLowerCase(),
    pendingPurchaseType: 'plan',
    pendingPlanKey: planKey,
    pendingBillingCycle: billingCycle,
    pendingPlanAmount: amount,
    pendingCreditPackKey: '',
    pendingCreditAmount: 0,
    pendingCreditQuantity: 0,
    razorpayOrderId,
    notes: `Pending ${planKey} ${billingCycle} checkout`,
  };

  if (existing && isSubscriptionActive(existing)) {
    Object.assign(existing, pendingFields);
    await existing.save();
    return existing;
  }

  return Subscription.findOneAndUpdate(
    { userEmail: user.email.toLowerCase() },
    {
      ...pendingFields,
      plan: planKey,
      status: 'pending',
      billingCycle,
      amount,
      currency: 'INR',
      includedCredits: getIncludedCredits(planKey),
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

export async function markPendingCreditPurchase({
  subscription,
  packKey,
  credits,
  amount,
  razorpayOrderId,
}: {
  subscription: ISubscription;
  packKey: string;
  credits: number;
  amount: number;
  razorpayOrderId: string;
}) {
  await dbConnect();
  subscription.pendingPurchaseType = 'credits';
  subscription.pendingPlanKey = '';
  subscription.pendingBillingCycle = '';
  subscription.pendingPlanAmount = 0;
  subscription.pendingCreditPackKey = packKey;
  subscription.pendingCreditAmount = amount;
  subscription.pendingCreditQuantity = credits;
  subscription.razorpayOrderId = razorpayOrderId;
  subscription.notes = `Pending ${credits} credit top-up`;
  await subscription.save();
  return subscription;
}

export async function completeVerifiedPurchase(subscription: ISubscription, payment: { paymentId: string; signature: string }) {
  await dbConnect();
  if (subscription.razorpayPaymentId === payment.paymentId && !subscription.pendingPurchaseType) {
    return subscription;
  }

  const now = new Date();
  subscription.razorpayPaymentId = payment.paymentId;
  subscription.razorpaySignature = payment.signature;

  if (subscription.pendingPurchaseType === 'credits') {
    subscription.extraCredits = Number(subscription.extraCredits || 0) + Number(subscription.pendingCreditQuantity || 0);
    subscription.pendingPurchaseType = '';
    subscription.pendingCreditPackKey = '';
    subscription.pendingCreditAmount = 0;
    subscription.pendingCreditQuantity = 0;
    subscription.notes = 'Extra credits added after Razorpay verification';
    await subscription.save();
    return subscription;
  }

  const nextPlan = (subscription.pendingPlanKey || subscription.plan) as PlanKey;
  const nextCycle = (subscription.pendingBillingCycle || subscription.billingCycle || 'monthly') as BillingCycle;
  const nextAmount = Number(subscription.pendingPlanAmount || subscription.amount || 0);

  subscription.plan = nextPlan;
  subscription.billingCycle = nextCycle;
  subscription.amount = nextAmount;
  subscription.status = 'active';
  subscription.cancelAtPeriodEnd = false;
  subscription.includedCredits = getIncludedCredits(nextPlan);
  subscription.usedCredits = 0;
  subscription.currentPeriodStart = now;
  subscription.currentPeriodEnd = getNextPeriodEnd(nextCycle, now);
  subscription.lastCreditResetAt = now;
  subscription.pendingPurchaseType = '';
  subscription.pendingPlanKey = '';
  subscription.pendingBillingCycle = '';
  subscription.pendingPlanAmount = 0;
  subscription.notes = 'Plan activated after Razorpay verification';
  await subscription.save();
  return subscription;
}

export async function resetMembershipCredits(subscription: ISubscription) {
  await dbConnect();
  subscription.includedCredits = getIncludedCredits(subscription.plan as PlanKey);
  subscription.usedCredits = 0;
  subscription.lastCreditResetAt = new Date();
  await subscription.save();
  return subscription;
}

export function getPlanChangeBlock(subscription: ISubscription | null | undefined, targetPlan: PlanKey) {
  if (!subscription || !isSubscriptionActive(subscription)) return '';
  if (subscription.plan === 'enterprise') return 'Enterprise changes must be handled by the system console.';

  const currentRank = getPlanRank(subscription.plan as PlanKey);
  const targetRank = getPlanRank(targetPlan);
  if (targetRank >= currentRank) return '';

  return `You can downgrade after your ${BILLING_PLAN_MAP[subscription.plan as PlanKey]?.title || 'current'} plan ends.`;
}

export async function requireActiveMembership(userEmail: string): Promise<MembershipCheck> {
  const subscription = await findMembershipByEmail(userEmail);
  const membership = serializeMembership(subscription);

  if (!subscription || !membership) {
    return {
      ok: false,
      status: 402,
      error: 'Please select a Melanam plan before using the workspace.',
      code: 'PLAN_REQUIRED',
      membership: null,
    };
  }

  if (!membership.active) {
    return {
      ok: false,
      status: 402,
      error: 'Your Melanam membership is not active. Choose a plan or ask the system console to reactivate it.',
      code: 'PLAN_INACTIVE',
      membership,
    };
  }

  return { ok: true, membership, subscription };
}

export async function requireFeatureAccess(userEmail: string, feature: PlanFeatureKey): Promise<MembershipCheck> {
  const check = await requireActiveMembership(userEmail);
  if (!check.ok) return check;

  const plan = BILLING_PLAN_MAP[check.subscription.plan as PlanKey];
  if (!plan?.features?.[feature]) {
    return {
      ok: false,
      status: 402,
      error: `${plan?.title || 'Current'} plan does not include this feature. Upgrade your plan to continue.`,
      code: 'FEATURE_NOT_INCLUDED',
      membership: check.membership,
    };
  }

  return check;
}

export async function requireCredits(userEmail: string, credits: number, reason: string): Promise<MembershipCheck> {
  const check = await requireActiveMembership(userEmail);
  if (!check.ok) return check;

  if (check.subscription.plan === 'enterprise') {
    return check;
  }

  const balance = getCreditBalance(check.subscription);
  if (balance !== null && balance < credits) {
    return {
      ok: false,
      status: 402,
      error: `Not enough credits for ${reason}. Buy extra credits or upgrade your plan.`,
      code: 'CREDITS_REQUIRED',
      membership: check.membership,
    };
  }

  check.subscription.usedCredits = Math.round((Number(check.subscription.usedCredits || 0) + credits) * 100) / 100;
  await check.subscription.save();
  return { ok: true, subscription: check.subscription, membership: serializeMembership(check.subscription)! };
}

export async function checkRoomCreationLimit(userEmail: string): Promise<MembershipCheck> {
  const check = await requireFeatureAccess(userEmail, 'rooms');
  if (!check.ok) return check;

  const plan = BILLING_PLAN_MAP[check.subscription.plan as PlanKey];
  if (!plan?.monthlyRooms) return check;

  const periodStart = check.subscription.currentPeriodStart || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const roomsCreated = await Meeting.countDocuments({
    hostEmail: userEmail,
    createdAt: { $gte: periodStart },
  });

  if (roomsCreated >= plan.monthlyRooms) {
    return {
      ok: false,
      status: 402,
      error: `${plan.title} allows ${plan.monthlyRooms} rooms in this billing period. Upgrade or ask the system console to extend your account.`,
      code: 'ROOM_LIMIT_REACHED',
      membership: check.membership,
    };
  }

  return check;
}
