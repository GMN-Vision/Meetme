export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../lib/auth-options';
import dbConnect from '../../../../lib/db';
import User from '../../../../models/User';
import Subscription from '../../../../models/Subscription';
import { BILLING_PLAN_MAP, getPlanPrice, type PlanKey } from '../../../../lib/billing-plans';
import { activateFreeMembership, findMembershipByEmail, getPlanChangeBlock, serializeMembership } from '../../../../lib/membership';

async function requireUserSession() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return null;
  }
  return session;
}

export async function GET() {
  try {
    const session = await requireUserSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await dbConnect();
    const user = await User.findOne({ email: session.user.email.toLowerCase() });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const subscription = await Subscription.findOne({ userEmail: user.email });
    return NextResponse.json({ success: true, subscription: serializeMembership(subscription) });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to load subscription' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireUserSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { plan, billingCycle = 'monthly', notes } = body;

    if (!plan) {
      return NextResponse.json({ error: 'Plan is required' }, { status: 400 });
    }

    const planKey = String(plan).toLowerCase() as PlanKey;
    if (!BILLING_PLAN_MAP[planKey]) {
      return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });
    }

    await dbConnect();
    const user = await User.findOne({ email: session.user.email.toLowerCase() });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (planKey !== 'free') {
      const price = getPlanPrice(planKey, billingCycle);
      return NextResponse.json(
        {
          error: `${BILLING_PLAN_MAP[planKey].title} must be activated through Razorpay checkout.`,
          checkoutRequired: true,
          amount: price,
        },
        { status: 402 }
      );
    }

    const existingMembership = await findMembershipByEmail(user.email);
    const changeBlock = getPlanChangeBlock(existingMembership, planKey);
    if (changeBlock) {
      return NextResponse.json({ error: changeBlock, code: 'DOWNGRADE_BLOCKED' }, { status: 409 });
    }

    const subscription = await activateFreeMembership(user, notes || 'Free plan selected by user');

    return NextResponse.json({ success: true, subscription: serializeMembership(subscription) });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to update subscription' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await requireUserSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await dbConnect();
    const user = await User.findOne({ email: session.user.email.toLowerCase() });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const subscription = await Subscription.findOne({ userEmail: user.email });
    if (!subscription) {
      return NextResponse.json({ error: 'Subscription not found' }, { status: 404 });
    }

    if (subscription.plan === 'enterprise') {
      return NextResponse.json({ error: 'Contact support to change an Enterprise plan' }, { status: 409 });
    }
    if (subscription.status !== 'active' && subscription.status !== 'trialing') {
      return NextResponse.json({ error: 'No active plan to cancel' }, { status: 409 });
    }
    subscription.cancelAtPeriodEnd = true;
    subscription.notes = 'Cancellation requested by user; access ends at period end';
    await subscription.save();

    return NextResponse.json({ success: true, subscription: serializeMembership(subscription) });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to cancel subscription' }, { status: 500 });
  }
}
