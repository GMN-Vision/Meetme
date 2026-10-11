import { BILLING_PLAN_MAP, type BillingPlan, type PlanKey } from '@/lib/billing-plans';
import dbConnect from '@/lib/db';
import { findMembershipByEmail, isSubscriptionActive } from '@/lib/membership';
import { MEETING_FILES_BUCKET } from '@/lib/meeting-storage';
import { supabaseServer } from '@/lib/supabaseServer';
import Meeting from '@/models/Meeting';
import Organization from '@/models/Organization';
import User from '@/models/User';

export type WorkspaceQuota = {
  plan: PlanKey;
  planDefinition: BillingPlan;
  scope: 'user' | 'organization';
  scopeId: string;
  ownerEmails: string[];
  organizationName?: string;
};

function normalizePlan(value: unknown): PlanKey | null {
  const plan = String(value || '').trim().toLowerCase();
  if (plan === 'premium') return 'business';
  return ['free', 'pro', 'business', 'enterprise'].includes(plan) ? plan as PlanKey : null;
}

/**
 * Business and Enterprise limits belong to the organisation when one is
 * assigned. Free and Pro limits remain tied to the individual subscriber.
 */
export async function getWorkspaceQuota(userEmail: string, allowAdmin = false): Promise<WorkspaceQuota | null> {
  const email = String(userEmail || '').trim().toLowerCase();
  if (!email) return null;

  await dbConnect();
  const user = await User.findOne({ email }).lean();
  if (!user) return null;

  if (allowAdmin && user.role === 'admin') {
    return {
      plan: 'enterprise',
      planDefinition: BILLING_PLAN_MAP.enterprise,
      scope: 'user',
      scopeId: email,
      ownerEmails: [email],
    };
  }

  if (user.organizationId) {
    const organization = await Organization.findById(user.organizationId).lean();
    const organizationPlan = normalizePlan(organization?.billingPlan);
    if (organizationPlan === 'business' || organizationPlan === 'enterprise') {
      const members = await User.find({ organizationId: user.organizationId, status: { $ne: 'disabled' } })
        .select('email')
        .lean();

      return {
        plan: organizationPlan,
        planDefinition: BILLING_PLAN_MAP[organizationPlan],
        scope: 'organization',
        scopeId: String(user.organizationId),
        ownerEmails: members.map((member) => String(member.email).toLowerCase()),
        organizationName: organization?.name || undefined,
      };
    }
  }

  const subscription = await findMembershipByEmail(email);
  const plan = subscription && isSubscriptionActive(subscription)
    ? normalizePlan(subscription.plan) || 'free'
    : 'free';

  return {
    plan,
    planDefinition: BILLING_PLAN_MAP[plan],
    scope: 'user',
    scopeId: email,
    ownerEmails: [email],
  };
}

async function getFolderSizeBytes(folder: string) {
  const { data, error } = await supabaseServer.storage
    .from(MEETING_FILES_BUCKET)
    .list(folder, { limit: 1000 });

  if (error) {
    throw new Error(`Unable to calculate workspace storage: ${error.message}`);
  }

  return (data || []).reduce((total: number, file: any) => {
    const size = Number(file?.metadata?.size || 0);
    return total + (Number.isFinite(size) ? size : 0);
  }, 0);
}

export async function getWorkspaceStorageUsageBytes(quota: WorkspaceQuota) {
  await dbConnect();
  const meetings = await Meeting.find({ hostEmail: { $in: quota.ownerEmails } }).select('meetingId').lean();
  const folders = meetings.map((meeting) => String(meeting.meetingId));

  const sizes = await Promise.all(folders.map(getFolderSizeBytes));
  return sizes.reduce((total, size) => total + size, 0);
}

export async function getWorkspaceUsage(userEmail: string, allowAdmin = false) {
  const quota = await getWorkspaceQuota(userEmail, allowAdmin);
  if (!quota) return null;

  const [storageBytes, monthlyRooms, seatsUsed] = await Promise.all([
    getWorkspaceStorageUsageBytes(quota),
    Meeting.countDocuments({ hostEmail: { $in: quota.ownerEmails } }),
    quota.scope === 'organization'
      ? User.countDocuments({ organizationId: quota.scopeId, status: { $ne: 'disabled' } })
      : Promise.resolve(1),
  ]);

  const storageLimitBytes = quota.planDefinition.storageGb == null
    ? null
    : quota.planDefinition.storageGb * 1024 * 1024 * 1024;

  return {
    ...quota,
    usage: {
      storageBytes,
      storageLimitBytes,
      monthlyRooms,
      seatsUsed,
      seatLimit: quota.planDefinition.seats,
    },
  };
}

export async function assertStorageCapacity(userEmail: string, incomingBytes: number, allowAdmin = false) {
  const quota = await getWorkspaceQuota(userEmail, allowAdmin);
  if (!quota) {
    return { ok: false as const, error: 'Choose an active plan before uploading files.' };
  }

  const storageLimitBytes = quota.planDefinition.storageGb == null
    ? null
    : quota.planDefinition.storageGb * 1024 * 1024 * 1024;

  if (storageLimitBytes === null) {
    return { ok: true as const, quota };
  }

  const usedBytes = await getWorkspaceStorageUsageBytes(quota);
  if (usedBytes + incomingBytes > storageLimitBytes) {
    return {
      ok: false as const,
      error: `${quota.planDefinition.title} includes ${quota.planDefinition.storageGb} GB of storage. Delete files or upgrade to continue.`,
    };
  }

  return { ok: true as const, quota };
}

export async function canAddOrganizationSeat(organizationId: string) {
  await dbConnect();
  const organization = await Organization.findById(organizationId).lean();
  const plan = normalizePlan(organization?.billingPlan);
  if (plan !== 'business' && plan !== 'enterprise') {
    return { ok: true as const };
  }

  const limit = BILLING_PLAN_MAP[plan].seats;
  if (limit == null) return { ok: true as const };
  const used = await User.countDocuments({ organizationId, status: { $ne: 'disabled' } });
  if (used >= limit) {
    return { ok: false as const, error: `${BILLING_PLAN_MAP[plan].title} allows ${limit} workspace seats. Ask an administrator to upgrade before adding another member.` };
  }

  return { ok: true as const };
}
