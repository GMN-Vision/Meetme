'use client';

import { useEffect, useMemo, useState } from 'react';
import { GlowCard } from '@/components/ui/glow-card';
import { GradientBorderButton } from '@/components/ui/gradient-border-button';
import { LmsShell } from './LmsShell';
import { AIMeetingNotesPanel } from './AIMeetingNotesPanel';

type StudentDashboardData = {
  courses: any[];
  upcomingClasses: any[];
  pendingAssignments: any[];
  recentRecordings: any[];
  submissions: any[];
  aiMeetings?: any[];
};

export type StudentWorkspaceView = 'courses' | 'classes' | 'assignments' | 'recordings' | 'notes';

const workspaceViews: Record<StudentWorkspaceView, { title: string; description: string }> = {
  courses: {
    title: 'My courses',
    description: 'Review the learning tracks you are enrolled in and the material attached to each course.',
  },
  classes: {
    title: 'Upcoming classes',
    description: 'See scheduled live sessions and join them when the class is ready to begin.',
  },
  assignments: {
    title: 'Assignments',
    description: 'Review pending course work and submit your response from one focused screen.',
  },
  recordings: {
    title: 'Recordings',
    description: 'Return to recordings from the courses and live sessions you have attended.',
  },
  notes: {
    title: 'AI meeting notes',
    description: 'Review meeting briefs, key notes, decisions, actions, and downloadable transcripts.',
  },
};

export function StudentLmsDashboard({ view = 'courses' }: { view?: StudentWorkspaceView }) {
  const [dashboard, setDashboard] = useState<StudentDashboardData>({ courses: [], upcomingClasses: [], pendingAssignments: [], recentRecordings: [], submissions: [], aiMeetings: [] });
  const [loading, setLoading] = useState(true);
  const [activeAssignment, setActiveAssignment] = useState<any | null>(null);
  const [submissionContent, setSubmissionContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [loadError, setLoadError] = useState('');
  const page = workspaceViews[view];

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setLoadError('');
      try {
        const response = await fetch('/api/lms/dashboard/student');
        const body = await response.json().catch(() => ({}));
        if (response.ok) {
          setDashboard(body.dashboard || { courses: [], upcomingClasses: [], pendingAssignments: [], recentRecordings: [], submissions: [], aiMeetings: [] });
        } else {
          setLoadError(body.error || 'Failed to load student dashboard');
        }
      } catch (error) {
        setLoadError('Failed to load student dashboard');
      }
      setLoading(false);
    };

    void load();
  }, []);

  const stats = useMemo(
    () => [
      { label: 'My courses', value: dashboard.courses.length, helper: 'Enrolled learning tracks' },
      { label: 'Upcoming classes', value: dashboard.upcomingClasses.length, helper: 'Scheduled live sessions' },
      { label: 'Pending assignments', value: dashboard.pendingAssignments.length, helper: 'Work waiting for submission' },
      { label: 'Recent recordings', value: dashboard.recentRecordings.length, helper: 'Saved course sessions' },
    ],
    [dashboard]
  );

  const handleSubmitAssignment = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!activeAssignment) return;

    setSubmitting(true);
    setMessage('');

    const response = await fetch(`/api/lms/assignments/${activeAssignment._id}/submissions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: submissionContent }),
    });

    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMessage(body.error || 'Submission failed');
      setSubmitting(false);
      return;
    }

    setMessage('Assignment submitted');
    setSubmissionContent('');
    setActiveAssignment(null);
    setSubmitting(false);

    const reload = await fetch('/api/lms/dashboard/student');
    const reloadBody = await reload.json().catch(() => ({}));
    if (reload.ok) {
    setDashboard(reloadBody.dashboard || dashboard);
    }
  };

  const handleJoinSession = async (session: any) => {
    setMessage('');
    try {
      const resp = await fetch(`/api/lms/courses/${session.courseId}/sessions/${session._id}/create-meeting`, { method: 'POST' });
      const body = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        setMessage(body.error || 'Failed to prepare meeting');
        return;
      }

      const meetingId = body.meetingId || session.meetingId;
      if (!meetingId) {
        setMessage('No meeting id available');
        return;
      }

      window.location.href = `/room/${encodeURIComponent(meetingId)}`;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('join session error', err);
      setMessage('Failed to join session');
    }
  };

  if (loading || loadError) {
    return (
      <LmsShell
        role="student"
        kicker="Student Dashboard"
        title={page.title}
        description={page.description}
        stats={stats}
      >
        <GlowCard>
          <div className="flex flex-col gap-2">
            <p className="font-display text-xl font-semibold text-slate-950">
              {loadError ? 'Could not load student dashboard' : 'Loading your learning workspace'}
            </p>
            <p className="text-sm leading-6 text-slate-600">
              {loadError || 'Courses, classes, assignments, recordings, and submissions are being prepared.'}
            </p>
            {loadError ? (
              <button onClick={() => window.location.reload()} className="mt-2 w-fit rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white">
                Refresh dashboard
              </button>
            ) : null}
          </div>
        </GlowCard>
      </LmsShell>
    );
  }

  return (
    <LmsShell
      role="student"
      kicker="Student Dashboard"
      title={page.title}
      description={page.description}
      stats={stats}
    >
      {message ? <GlowCard><p className="text-sm text-slate-700">{message}</p></GlowCard> : null}

      <div className="grid gap-6">
        <GlowCard id="my-courses" className={`scroll-mt-24 ${view === 'courses' ? '' : 'hidden'}`}>
          <h3 className="font-display text-xl font-semibold text-slate-950">My Courses</h3>
          <div className="mt-4 space-y-3">
            {dashboard.courses.map((course) => (
              <div key={course._id} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-950">{course.title}</p>
                    <p className="text-xs text-slate-500">{course.code}</p>
                  </div>
                  <span className="rounded-full bg-emerald-100 px-3 py-1 text-sm font-semibold text-emerald-700">Active</span>
                </div>
                <p className="mt-3 text-sm text-slate-600">{course.description || 'No description provided.'}</p>
              </div>
            ))}
            {dashboard.courses.length === 0 ? <p className="text-sm text-slate-500">You are not enrolled in any courses yet.</p> : null}
          </div>
        </GlowCard>

        <GlowCard id="upcoming-classes" className={`scroll-mt-24 ${view === 'classes' ? '' : 'hidden'}`}>
          <h3 className="font-display text-xl font-semibold text-slate-950">Upcoming Classes</h3>
          <div className="mt-4 space-y-3">
            {dashboard.upcomingClasses.map((session) => (
              <div key={session._id} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-950">{session.meetingTitle || session.meetingId}</p>
                    <p className="text-xs text-slate-500">{new Date(session.startsAt).toLocaleString()}</p>
                    <p className="mt-2 text-sm text-slate-600">{session.notes || 'Live class session linked to your course.'}</p>
                  </div>
                  <div className="flex items-center">
                    <button onClick={() => handleJoinSession(session)} className="rounded-full bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white">Join</button>
                  </div>
                </div>
              </div>
            ))}
            {dashboard.upcomingClasses.length === 0 ? <p className="text-sm text-slate-500">No upcoming classes yet.</p> : null}
          </div>
        </GlowCard>
      </div>

      <div className="grid gap-6">
        <GlowCard id="assignments" className={`scroll-mt-24 ${view === 'assignments' ? '' : 'hidden'}`}>
          <h3 className="font-display text-xl font-semibold text-slate-950">Pending Assignments</h3>
          <div className="mt-4 space-y-3">
            {dashboard.pendingAssignments.map((assignment) => (
              <div key={assignment._id} className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-950">{assignment.title}</p>
                    <p className="text-xs text-slate-500">Due {assignment.dueAt ? new Date(assignment.dueAt).toLocaleString() : 'any time'}</p>
                  </div>
                  <GradientBorderButton variant="create" onClick={() => setActiveAssignment(assignment)}>Submit</GradientBorderButton>
                </div>
                <p className="mt-2 text-sm text-slate-600">{assignment.description || assignment.instructions || 'No instructions provided.'}</p>
              </div>
            ))}
            {dashboard.pendingAssignments.length === 0 ? <p className="text-sm text-slate-500">All caught up. Nothing pending right now.</p> : null}
          </div>
        </GlowCard>

        <GlowCard id="recordings" className={`scroll-mt-24 ${view === 'recordings' ? '' : 'hidden'}`}>
          <h3 className="font-display text-xl font-semibold text-slate-950">Recent Recordings</h3>
          <div className="mt-4 space-y-3">
            {dashboard.recentRecordings.map((recording) => (
              <div key={`${recording.courseSessionId}-${recording.createdAt}`} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                <p className="text-sm font-semibold text-slate-950">{recording.title}</p>
                <p className="text-xs text-slate-500">{new Date(recording.createdAt).toLocaleString()}</p>
                {recording.url ? (
                  <a href={recording.url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm font-semibold text-sky-600 underline">
                    Open recording
                  </a>
                ) : null}
              </div>
            ))}
            {dashboard.recentRecordings.length === 0 ? <p className="text-sm text-slate-500">Recordings linked to your courses will show up here.</p> : null}
          </div>
        </GlowCard>
      </div>

      {view === 'notes' ? <AIMeetingNotesPanel meetings={dashboard.aiMeetings || []} /> : null}

      {view === 'assignments' && activeAssignment ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4 backdrop-blur-sm">
          <GlowCard className="w-full max-w-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">Submit Assignment</p>
                <h3 className="mt-2 font-display text-2xl font-semibold text-slate-950">{activeAssignment.title}</h3>
              </div>
              <button onClick={() => setActiveAssignment(null)} className="text-sm font-semibold text-slate-500">Close</button>
            </div>
            <form onSubmit={handleSubmitAssignment} className="mt-6 space-y-4">
              <textarea
                value={submissionContent}
                onChange={(event) => setSubmissionContent(event.target.value)}
                className="min-h-[180px] w-full rounded-[1.25rem] border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-sky-400"
                placeholder="Write your submission here"
              />
              <div className="flex gap-3">
                <button type="button" onClick={() => setActiveAssignment(null)} className="rounded-full border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-700">
                  Cancel
                </button>
                <button disabled={submitting} type="submit" className="rounded-full bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white">
                  {submitting ? 'Submitting...' : 'Submit work'}
                </button>
              </div>
            </form>
          </GlowCard>
        </div>
      ) : null}
    </LmsShell>
  );
}
