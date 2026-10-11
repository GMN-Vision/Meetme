import { NextResponse } from 'next/server';
import dbConnect from '../../../../lib/db';
import User from '../../../../models/User';
import Organization from '../../../../models/Organization';
import { canAddOrganizationSeat } from '../../../../lib/workspace-usage';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email } = body || {};

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    const normalizedEmail = email.trim().toLowerCase();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return NextResponse.json({ error: 'Enter a valid email address' }, { status: 400 });
    }

    await dbConnect();

    // Check if user email already exists
    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) {
      return NextResponse.json(
        {
          error: 'Email already registered',
          code: 'USER_ALREADY_EXISTS',
          signInUrl: `/sign-in?email=${encodeURIComponent(normalizedEmail)}`,
        },
        { status: 409 }
      );
    }

    let orgId: string | null = null;

    const domain = normalizedEmail.split('@')[1] || '';
    if (domain) {
      const organization = await Organization.findOne({ domain });
      if (organization) {
        const seatCheck = await canAddOrganizationSeat(String(organization._id));
        if (!seatCheck.ok) {
          return NextResponse.json({ error: seatCheck.error, code: 'SEAT_LIMIT_REACHED' }, { status: 402 });
        }
        orgId = String(organization._id);
      }
    }

    // Create user record
    const user = new User({
      email: normalizedEmail,
      role: 'user',
      organizationId: orgId,
    });

    await user.save();

    return NextResponse.json({ ok: true, userId: user._id.toString(), organizationId: orgId || null });
  } catch (err: any) {
    console.error('Registration pre-create error', err);
    return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500 });
  }
}
export const dynamic = 'force-dynamic';



