export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../lib/auth-options';
import dbConnect from '../../../../lib/db';
import BillingPayment from '../../../../models/BillingPayment';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    await dbConnect();
    const payments = await BillingPayment.find({ userEmail: session.user.email.toLowerCase(), status: 'paid' })
      .sort({ paidAt: -1 }).limit(100).lean();
    return NextResponse.json({ payments: payments.map(payment => ({
      id: String(payment._id), description: payment.description, amountInr: payment.amountInr,
      paidAt: payment.paidAt?.toISOString() || null, paymentId: payment.paymentId,
      credits: payment.credits || null, type: payment.type,
    })) });
  } catch {
    return NextResponse.json({ error: 'Could not load payment history' }, { status: 500 });
  }
}
