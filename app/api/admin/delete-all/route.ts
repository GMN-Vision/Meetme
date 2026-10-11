import { NextRequest, NextResponse } from 'next/server';
import type { Model } from 'mongoose';
import dbConnect from '../../../../lib/db';
import { getAdminAuthorization } from '../../../../lib/admin-auth';
import Feedback from '../../../../models/Feedback';
import Meeting from '../../../../models/Meeting';
import MeetingActivity from '../../../../models/MeetingActivity';
import MeetingMessage from '../../../../models/MeetingMessage';
import Organization from '../../../../models/Organization';
import Poll from '../../../../models/Poll';
import Subscription from '../../../../models/Subscription';
import Task from '../../../../models/Task';
import User from '../../../../models/User';
import Whiteboard from '../../../../models/Whiteboard';

const DELETION_CONFIRMATION = 'DELETE';

const applicationModels: Array<{ name: string; model: Model<any> }> = [
  { name: 'feedback', model: Feedback },
  { name: 'meetingActivities', model: MeetingActivity },
  { name: 'meetingMessages', model: MeetingMessage },
  { name: 'meetings', model: Meeting },
  { name: 'organizations', model: Organization },
  { name: 'polls', model: Poll },
  { name: 'subscriptions', model: Subscription },
  { name: 'tasks', model: Task },
  { name: 'users', model: User },
  { name: 'whiteboards', model: Whiteboard },
];

export async function DELETE(request: NextRequest) {
  try {
    const auth = await getAdminAuthorization(request);
    if (!auth.authorized) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    if (body?.confirmation !== DELETION_CONFIRMATION) {
      return NextResponse.json({ error: 'Type DELETE to confirm this destructive action' }, { status: 400 });
    }

    await dbConnect();

    const results = await Promise.all(
      applicationModels.map(async ({ name, model }) => {
        const result = await model.deleteMany({});
        return { name, deletedCount: result.deletedCount ?? 0 };
      })
    );

    return NextResponse.json({
      success: true,
      deleted: results,
    });
  } catch (error) {
    console.error('Admin delete all data error:', error);
    return NextResponse.json({ error: 'Failed to delete application data' }, { status: 500 });
  }
}
