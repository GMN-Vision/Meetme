import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { getWorkspaceQuota, getWorkspaceStorageUsageBytes } from '@/lib/workspace-usage';
import { FILE_LIMITS } from '@/lib/server-file-storage';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const email = session?.user?.email;
    if (!email) return NextResponse.json({ error: 'Sign in to share files' }, { status: 401 });
    const quota = await getWorkspaceQuota(email, (session.user as any)?.role === 'admin');
    if (!quota) return NextResponse.json({ error: 'Unable to find your plan' }, { status: 403 });
    const storageBytes = await getWorkspaceStorageUsageBytes(quota);
    const storageLimitBytes = quota.planDefinition.storageGb == null ? null : quota.planDefinition.storageGb * 1024 ** 3;
    const remainingBytes = storageLimitBytes == null ? null : Math.max(0, storageLimitBytes - storageBytes);
    const maxFileBytes = quota.planDefinition.features.files ? FILE_LIMITS[quota.plan] : 0;
    return NextResponse.json({ plan: quota.planDefinition.title, maxFileBytes, storageBytes, storageLimitBytes,
      remainingBytes, availableFileBytes: Math.min(maxFileBytes, remainingBytes ?? Infinity) });
  } catch {
    return NextResponse.json({ error: 'Unable to load your upload allowance' }, { status: 503 });
  }
}
