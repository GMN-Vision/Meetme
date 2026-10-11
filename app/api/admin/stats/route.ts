export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getAdminAuthorization } from '../../../../lib/admin-auth';
import dbConnect from '../../../../lib/db';
import User from '../../../../models/User';
import Meeting from '../../../../models/Meeting';
import Organization from '../../../../models/Organization';

async function checkAdminAuth(request?: Request) {
  const auth = await getAdminAuthorization(request);
  return auth;
}

export async function GET() {
  try {
    const auth = await checkAdminAuth();
    if (!auth.authorized) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await dbConnect();

    const [totalUsers, totalMeetings, totalOrgs] = await Promise.all([
      User.countDocuments(),
      Meeting.countDocuments(),
      Organization.countDocuments(),
    ]);

    // Calculate active rooms in the last 2 hours
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const activeMeetings = await Meeting.countDocuments({
      $or: [
        { lastSessionAt: { $gte: twoHoursAgo } },
        { updatedAt: { $gte: twoHoursAgo } },
      ],
    });

    // Aggregate counts by role
    const usersByRole = await User.aggregate([
      { $group: { _id: '$role', count: { $sum: 1 } } },
    ]);

    const rolesMap = {
      admin: 0,
      user: 0,
    };

    usersByRole.forEach((item) => {
      rolesMap[item._id === 'admin' ? 'admin' : 'user'] += item.count;
    });

    return NextResponse.json({
      success: true,
      stats: {
        totalUsers,
        totalMeetings,
        totalOrganizations: totalOrgs,
        activeMeetings,
        roles: rolesMap,
      },
    });
  } catch (error: any) {
    console.error('Admin stats GET error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
