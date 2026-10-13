export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import mongoose from 'mongoose';
import { authOptions } from '../../../../../../lib/auth-options';
import dbConnect from '../../../../../../lib/db';
import BillingPayment from '../../../../../../models/BillingPayment';

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character] || character));
}

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!mongoose.isValidObjectId(params.id)) return NextResponse.json({ error: 'Receipt not found' }, { status: 404 });
  try {
    await dbConnect();
    const payment = await BillingPayment.findOne({ _id: params.id, userEmail: session.user.email.toLowerCase(), status: 'paid' });
    if (!payment) return NextResponse.json({ error: 'Receipt not found' }, { status: 404 });
    const amount = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(payment.amountInr);
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Melanam payment receipt</title><style>body{font-family:Arial,sans-serif;max-width:680px;margin:48px auto;padding:0 20px;color:#18181b}h1{margin-bottom:4px}dl{display:grid;grid-template-columns:160px 1fr;gap:14px;border-top:1px solid #ddd;padding-top:24px}dt{color:#52525b}dd{margin:0;word-break:break-word}.print{margin-top:30px;padding:10px 18px}@media print{.print{display:none}}</style></head><body><h1>Melanam</h1><p>Payment receipt</p><dl><dt>Payment date</dt><dd>${escapeHtml((payment.paidAt || payment.createdAt).toISOString().slice(0, 10))}</dd><dt>Account</dt><dd>${escapeHtml(payment.userEmail)}</dd><dt>Item</dt><dd>${escapeHtml(payment.description)}</dd><dt>Amount paid</dt><dd>${escapeHtml(amount)}</dd><dt>Currency</dt><dd>INR</dd><dt>Payment ID</dt><dd>${escapeHtml(payment.paymentId || '')}</dd><dt>Order ID</dt><dd>${escapeHtml(payment.orderId)}</dd></dl><p>This confirms payment received through Razorpay. It is not a tax invoice.</p><button class="print" onclick="window.print()">Print or save as PDF</button></body></html>`;
    return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-store', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'" } });
  } catch {
    return NextResponse.json({ error: 'Could not load receipt' }, { status: 500 });
  }
}
