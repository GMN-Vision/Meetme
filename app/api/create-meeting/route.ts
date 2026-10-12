import { NextRequest, NextResponse } from 'next/server';
import { parseScheduledAt } from '@/lib/meeting-schedule';
import { nanoid } from 'nanoid';
import dbConnect from '../../../lib/db';
import Meeting from '../../../models/Meeting';
import User from '../../../models/User';
import Organization from '../../../models/Organization';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../lib/auth-options';
import { checkRoomCreationLimit } from '../../../lib/membership';
import { getWorkspaceQuota } from '../../../lib/workspace-usage';

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const userEmail = session?.user?.email?.toLowerCase();

    if (!userEmail) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    let scheduledAt: Date | null;
    try { scheduledAt = parseScheduledAt(body.scheduledAt); }
    catch (error) { return NextResponse.json({ error: (error as Error).message }, { status: 400 }); }
    await dbConnect();

    // Check if user belongs to an organization and fetch its policies
    let orgPolicies = null;
    const dbUser = await User.findOne({ email: userEmail.toLowerCase() });
    const role = dbUser?.role === 'admin' ? 'admin' : 'user';
    const workspaceQuota = await getWorkspaceQuota(userEmail, role === 'admin');
    if (!workspaceQuota) {
      return NextResponse.json({ error: 'Active workspace plan required' }, { status: 402 });
    }

    if (role !== 'admin' && workspaceQuota.scope === 'user') {
      const membershipCheck = await checkRoomCreationLimit(userEmail);
      if (!membershipCheck.ok) {
        return NextResponse.json(
          { error: membershipCheck.error, code: membershipCheck.code, membership: membershipCheck.membership || null },
          { status: membershipCheck.status }
        );
      }
    }

    if (dbUser && dbUser.organizationId) {
      const org = await Organization.findById(dbUser.organizationId);
      if (org) {
        orgPolicies = org.policies;
      }
    }


    let {
      title,
      description,
      isPrivate = false,
      chatEnabled = true,
      recordingEnabled = true,
    } = body;

    // Apply enterprise organization policy overrides
    if (orgPolicies) {
      if (orgPolicies.recordingAllowed === false) {
        recordingEnabled = false;
      }
      if (orgPolicies.chatEnabled === false) {
        chatEnabled = false;
      }
      if (orgPolicies.requirePassword === true) {
        isPrivate = true;
      }
    }

    title = String(title || '').trim();
    description = String(description || '').trim();

    if (!title) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const meetingId = nanoid(12).toLowerCase();

    const meeting = new Meeting({
      meetingId,
      scheduledAt,
      hostId: userEmail,
      hostEmail: userEmail,
      title,
      description,
      isPrivate,
      chatEnabled,
      recordingEnabled,
      planSnapshot: workspaceQuota.plan,
      maxParticipants: workspaceQuota.planDefinition.maxParticipants,
      maxMeetingMinutes: workspaceQuota.planDefinition.maxMeetingMinutes,
    });

    await meeting.save();

    return NextResponse.json(
      {
        success: true,
        meetingId,
        meeting,
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('Error creating meeting:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create meeting' },
      { status: 500 }
    );
  }
}
