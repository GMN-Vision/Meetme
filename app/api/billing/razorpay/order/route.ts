export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import Razorpay from 'razorpay';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../../lib/auth-options';
import { BILLING_PLAN_MAP, CREDIT_PACK_MAP, getPlanPrice, type BillingCycle, type CreditPackKey, type PlanKey } from '../../../../../lib/billing-plans';
import dbConnect from '../../../../../lib/db';
import User from '../../../../../models/User';
import BillingPayment from '../../../../../models/BillingPayment';
import { findMembershipByEmail, getPlanChangeBlock, markPendingCreditPurchase, upsertPendingPlanMembership } from '../../../../../lib/membership';

function toPaise(amountInr: number) {
  return Math.round(amountInr * 100);
}

function getRazorpayClient() {
  const keyId = process.env.RAZORPAY_KEY_ID || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || '';
  const keySecret = process.env.RAZORPAY_KEY_SECRET || '';

  if (!keyId || !keySecret) {
    throw new Error('Razorpay keys are not configured');
  }

  return new Razorpay({
    key_id: keyId,
    key_secret: keySecret,
  });
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await dbConnect();
    const user = await User.findOne({ email: session.user.email.toLowerCase() });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const { planKey, billingCycle = 'monthly', creditPackKey } = await req.json();
    const razorpay = getRazorpayClient();

    if (creditPackKey) {
      const pack = CREDIT_PACK_MAP[String(creditPackKey) as CreditPackKey];
      if (!pack) {
        return NextResponse.json({ error: 'Invalid credit pack' }, { status: 400 });
      }

      const subscription = await findMembershipByEmail(user.email);
      if (!subscription || !['active', 'trialing'].includes(subscription.status)) {
        return NextResponse.json({ error: 'Activate a plan before buying extra credits' }, { status: 402 });
      }

      const order = await razorpay.orders.create({
        amount: toPaise(pack.amountInr),
        currency: 'INR',
        receipt: `mel_cred_${pack.key}_${Date.now()}`.slice(0, 40),
        notes: {
          purchaseType: 'credits',
          creditPackKey: pack.key,
          credits: String(pack.credits),
          userEmail: user.email,
        },
      });

      await BillingPayment.create({ userEmail: user.email, orderId: order.id, type: 'credits', description: `${pack.credits} ${pack.title}`, credits: pack.credits, amountInr: pack.amountInr, status: 'pending' });

      const updatedSubscription = await markPendingCreditPurchase({
        subscription,
        packKey: pack.key,
        credits: pack.credits,
        amount: pack.amountInr,
        razorpayOrderId: order.id,
      });

      return NextResponse.json({ success: true, order, subscription: updatedSubscription });
    }

    const normalizedPlanKey = String(planKey || '').toLowerCase() as PlanKey;
    const normalizedCycle = String(billingCycle || 'monthly') === 'annual' ? 'annual' : 'monthly';
    const plan = BILLING_PLAN_MAP[normalizedPlanKey];
    if (!plan) {
      return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });
    }

    if (normalizedPlanKey === 'free') {
      return NextResponse.json({ error: 'Use free activation for the Free plan' }, { status: 400 });
    }

    const price = getPlanPrice(normalizedPlanKey, normalizedCycle as BillingCycle);
    if (price == null) {
      return NextResponse.json({ error: 'Custom plan requires sales contact' }, { status: 400 });
    }

    const existingMembership = await findMembershipByEmail(user.email);
    const changeBlock = getPlanChangeBlock(existingMembership, normalizedPlanKey);
    if (changeBlock) {
      return NextResponse.json({ error: changeBlock, code: 'DOWNGRADE_BLOCKED' }, { status: 409 });
    }

    const order = await razorpay.orders.create({
      amount: toPaise(price),
      currency: 'INR',
      receipt: `mel_${normalizedPlanKey}_${Date.now()}`.slice(0, 40),
      notes: {
        purchaseType: 'plan',
        planKey: normalizedPlanKey,
        billingCycle: normalizedCycle,
        userEmail: user.email,
      },
    });

    await BillingPayment.create({ userEmail: user.email, orderId: order.id, type: 'plan', description: `${plan.title} ${normalizedCycle} plan`, planKey: normalizedPlanKey, billingCycle: normalizedCycle, amountInr: price, status: 'pending' });

    const subscription = await upsertPendingPlanMembership({
      user,
      planKey: normalizedPlanKey as Exclude<PlanKey, 'free' | 'enterprise'>,
      billingCycle: normalizedCycle as BillingCycle,
      amount: price,
      razorpayOrderId: order.id,
    });

    return NextResponse.json({ success: true, order, subscription });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to create Razorpay order' }, { status: 500 });
  }
}
