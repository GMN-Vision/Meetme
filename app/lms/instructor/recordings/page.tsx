'use client';

import { LmsGate } from '@/components/lms/LmsGate';
import { LmsShell } from '@/components/lms/LmsShell';

export default function InstructorRecordingsPage() {
  return <LmsGate allowed={['instructor', 'admin']} redirectTo="/lms/instructor/recordings">
    <LmsShell role="instructor" kicker="Instructor workspace" title="Recordings" description="Watch, download, and share your recorded meetings.">{null}</LmsShell>
  </LmsGate>;
}
