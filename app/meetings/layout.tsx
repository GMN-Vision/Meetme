import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth-options';
import { MeetingWorkspace } from '@/components/meetings/MeetingWorkspace';

export const dynamic = 'force-dynamic';

export default async function MeetingsLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect('/sign-in?callbackUrl=%2Fmeetings');
  return <MeetingWorkspace>{children}</MeetingWorkspace>;
}
