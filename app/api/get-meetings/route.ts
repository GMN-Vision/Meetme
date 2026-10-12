import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '../../../lib/db';
import Meeting from '../../../models/Meeting';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../lib/auth-options';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const userEmail = session?.user?.email;

    if (!userEmail) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    await dbConnect();

    const hostEmail = userEmail.toLowerCase();
    const now = new Date();
    const [upcomingMeetings, meetings] = await Promise.all([
      Meeting.find({ hostEmail, scheduledAt: { $gt: now } }).sort({ scheduledAt: 1 }),
      Meeting.find({ hostEmail, $or: [{ scheduledAt: null }, { scheduledAt: { $lte: now } }] }).sort({ createdAt: -1 }).limit(12),
    ]);

    return NextResponse.json(
      {
        success: true,
        meetings,
        upcomingMeetings,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('Error fetching meetings:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch meetings' },
      { status: 500 }
    );
  }
}
