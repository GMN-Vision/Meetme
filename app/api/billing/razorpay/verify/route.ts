export const dynamic = 'force-dynamic';

import crypto from 'crypto';
import Razorpay from 'razorpay';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../../lib/auth-options';
import dbConnect from '../../../../../lib/db';
import Subscription from '../../../../../models/Subscription';
import BillingPayment from '../../../../../models/BillingPayment';
import { completeVerifiedPurchase, serializeMembership } from '../../../../../lib/membership';

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = await req.json();
    if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      return NextResponse.json({ error: 'Missing verification payload' }, { status: 400 });
    }

    const secret = process.env.RAZORPAY_KEY_SECRET || '';
    if (!secret) {
      return NextResponse.json({ error: 'Razorpay secret is not configured' }, { status: 500 });
    }

    const expected = crypto
      .createHmac('sha256', secret)
      .update(`${razorpayOrderId}|${razorpayPaymentId}`)
      .digest('hex');

    const expectedBuffer = Buffer.from(expected);
    const suppliedBuffer = Buffer.from(String(razorpaySignature));
    if (expectedBuffer.length !== suppliedBuffer.length || !crypto.timingSafeEqual(expectedBuffer, suppliedBuffer)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    }

    await dbConnect();
    const subscription = await Subscription.findOne({ razorpayOrderId, userEmail: session.user.email.toLowerCase() });
    if (!subscription) return NextResponse.json({ error: 'Subscription not found' }, { status: 404 });
    let purchase = await BillingPayment.findOne({ orderId: razorpayOrderId, userEmail: session.user.email.toLowerCase() });
    // Orders started before payment history was added still need to complete.
    if (!purchase && subscription.pendingPurchaseType) {
      const isCredits = subscription.pendingPurchaseType === 'credits';
      purchase = await BillingPayment.findOneAndUpdate({ orderId: razorpayOrderId }, {
        $setOnInsert: {
          userEmail: session.user.email.toLowerCase(), orderId: razorpayOrderId,
          type: isCredits ? 'credits' : 'plan',
          description: isCredits ? `${subscription.pendingCreditQuantity} credit top-up` : `${subscription.pendingPlanKey} ${subscription.pendingBillingCycle} plan`,
          planKey: isCredits ? undefined : subscription.pendingPlanKey,
          billingCycle: isCredits ? undefined : subscription.pendingBillingCycle,
          credits: isCredits ? subscription.pendingCreditQuantity : undefined,
          amountInr: isCredits ? subscription.pendingCreditAmount : subscription.pendingPlanAmount,
          status: 'pending',
        },
      }, { upsert: true, new: true });
    }
    if (!purchase) return NextResponse.json({ error: 'Purchase not found' }, { status: 404 });
    const keyId = process.env.RAZORPAY_KEY_ID || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || '';
    const razorpay = new Razorpay({ key_id: keyId, key_secret: secret });
    const gatewayPayment = await razorpay.payments.fetch(razorpayPaymentId);
    if (gatewayPayment.status !== 'captured' || gatewayPayment.order_id !== razorpayOrderId || gatewayPayment.amount !== Math.round(purchase.amountInr * 100) || gatewayPayment.currency !== 'INR') {
      return NextResponse.json({ error: 'Payment has not been captured for this order' }, { status: 409 });
    }
    const updatedSubscription = await completeVerifiedPurchase(subscription, {
      paymentId: razorpayPaymentId,
      signature: razorpaySignature,
    });

    if (purchase.status !== 'paid') {
      purchase.status = 'paid';
      purchase.paymentId = razorpayPaymentId;
      purchase.paidAt = new Date(Number(gatewayPayment.created_at) * 1000);
      await purchase.save();
    }

    return NextResponse.json({ success: true, subscription: serializeMembership(updatedSubscription) });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Verification failed' }, { status: 500 });
  }
}
