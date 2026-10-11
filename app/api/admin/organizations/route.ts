export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuthorization } from '../../../../lib/admin-auth';
import dbConnect from '../../../../lib/db';
import Organization from '../../../../models/Organization';
import User from '../../../../models/User';

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

    const organizations = await Organization.find({}).sort({ createdAt: -1 });

    // Aggregate member counts for each organization
    const orgsWithCount = await Promise.all(
      organizations.map(async (org) => {
        const memberCount = await User.countDocuments({ organizationId: org._id.toString() });
        return {
          ...org.toObject(),
          memberCount,
        };
      })
    );

    return NextResponse.json({ success: true, organizations: orgsWithCount });
  } catch (error: any) {
    console.error('Admin organizations GET error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { authorized } = await checkAdminAuth();
    if (!authorized) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await dbConnect();

    const body = await req.json();
    const { name, domain, billingPlan, recordingAllowed = true, chatEnabled = true, requirePassword = false } = body;

    if (!name) {
      return NextResponse.json({ error: 'Organization name is required' }, { status: 400 });
    }

    if (domain) {
      // Check if domain is already registered
      const existingOrg = await Organization.findOne({ domain: domain.toLowerCase() });
      if (existingOrg) {
        return NextResponse.json({ error: 'An organization with this domain already exists' }, { status: 400 });
      }
    }

    const org = new Organization({
      name,
      domain: domain ? domain.toLowerCase() : undefined,
      billingPlan: billingPlan || 'enterprise',
      policies: {
        recordingAllowed,
        chatEnabled,
        requirePassword,
      },
    });

    await org.save();

    return NextResponse.json({ success: true, organization: org });
  } catch (error: any) {
    console.error('Admin organizations POST error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const { authorized } = await checkAdminAuth(req);
  if (!authorized) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  try {
    const { orgId, name, domain, billingPlan, recordingAllowed, chatEnabled } = await req.json();
    if (typeof orgId !== 'string' || !/^[a-f\d]{24}$/i.test(orgId) ||
        typeof name !== 'string' || !name.trim() ||
        (domain !== undefined && typeof domain !== 'string') ||
        !['basic', 'premium', 'enterprise'].includes(billingPlan) ||
        typeof recordingAllowed !== 'boolean' || typeof chatEnabled !== 'boolean') {
      return NextResponse.json({ error: 'Check the organization name, plan, and meeting settings.' }, { status: 400 });
    }
    const normalizedDomain = (domain || '').trim().toLowerCase();
    if (normalizedDomain && !/^(?:[a-z\d](?:[a-z\d-]*[a-z\d])?\.)+[a-z]{2,}$/i.test(normalizedDomain)) {
      return NextResponse.json({ error: 'Enter an email domain such as example.com.' }, { status: 400 });
    }
    await dbConnect();
    const org = await Organization.findById(orgId);
    if (!org) return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    if (normalizedDomain && await Organization.findOne({ domain: normalizedDomain, _id: { $ne: orgId } })) {
      return NextResponse.json({ error: 'An organization with this domain already exists' }, { status: 400 });
    }
    org.name = name.trim();
    org.domain = normalizedDomain || undefined;
    org.billingPlan = billingPlan;
    org.policies.recordingAllowed = recordingAllowed;
    org.policies.chatEnabled = chatEnabled;
    await org.save();
    return NextResponse.json({ success: true, organization: org });
  } catch (error) {
    console.error('Admin organizations PUT error:', error);
    return NextResponse.json({ error: 'Could not save organization settings.' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { authorized } = await checkAdminAuth();
    if (!authorized) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await dbConnect();

    const searchParams = req.nextUrl.searchParams;
    const orgId = searchParams.get('orgId');

    if (!orgId) {
      return NextResponse.json({ error: 'Organization ID is required' }, { status: 400 });
    }

    const org = await Organization.findById(orgId);
    if (!org) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    }

    // Dissolve organization relation from users belonging to it
    await User.updateMany({ organizationId: orgId }, { $set: { organizationId: null, role: 'user' } });

    await Organization.findByIdAndDelete(orgId);

    return NextResponse.json({ success: true, message: 'Organization deleted successfully' });
  } catch (error: any) {
    console.error('Admin organizations DELETE error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
