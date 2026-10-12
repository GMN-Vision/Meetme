export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuthorization } from '../../../../lib/admin-auth';
import dbConnect from '../../../../lib/db';
import Meeting from '../../../../models/Meeting';

async function checkAdminAuth(request?: Request) {
  const auth = await getAdminAuthorization(request);
  return auth;
}

export async function GET(req: NextRequest) {
  try {
    const auth = await checkAdminAuth(req);
    if (!auth.authorized) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await dbConnect();

    const searchParams = req.nextUrl.searchParams;
    const search = searchParams.get('search') || '';

    const query: any = {};
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { hostEmail: { $regex: search, $options: 'i' } },
        { meetingId: { $regex: search, $options: 'i' } },
      ];
    }

    const meetings = await Meeting.find(query).sort({ createdAt: -1 });

    return NextResponse.json({ success: true, meetings });
  } catch (error: any) {
    console.error('Admin meetings GET error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const auth = await checkAdminAuth(req);
    if (!auth.authorized) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await dbConnect();

    const searchParams = req.nextUrl.searchParams;
    const meetingId = searchParams.get('meetingId');
    const terminateAll = searchParams.get('all') === 'true';

    if (terminateAll) {
      const body = await req.json().catch(() => null);
      if (body?.confirmation !== 'TERMINATE') {
        return NextResponse.json(
          { error: 'Type TERMINATE to confirm ending all rooms' },
          { status: 400 },
        );
      }

      const result = await Meeting.deleteMany({});
      return NextResponse.json({
        success: true,
        message: `${result.deletedCount} room${result.deletedCount === 1 ? '' : 's'} terminated successfully`,
        deletedCount: result.deletedCount,
      });
    }

    if (!meetingId) {
      const body = await req.json().catch(() => null);
      const ids = body?.meetingIds;
      if (Array.isArray(ids) && ids.length > 0 && ids.length <= 100 && ids.every(id => typeof id === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(id))) {
        const result = await Meeting.deleteMany({ meetingId: { $in: [...new Set(ids)] } });
        return NextResponse.json({ success: true, deletedCount: result.deletedCount });
      }
      return NextResponse.json({ error: 'Select between 1 and 100 valid meeting rooms.' }, { status: 400 });
    }

    const meeting = await Meeting.findOne({ meetingId });
    if (!meeting) {
      return NextResponse.json({ error: 'Meeting not found' }, { status: 404 });
    }

    await Meeting.findOneAndDelete({ meetingId });

    return NextResponse.json({ success: true, message: 'Meeting deleted successfully' });
  } catch (error: any) {
    console.error('Admin meetings DELETE error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
