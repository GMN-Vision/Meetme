'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import FileShare from '@/components/FileShare';
import { GlowCard } from '@/components/ui/glow-card';
import { GradientBorderButton } from '@/components/ui/gradient-border-button';
import { LmsShell } from './LmsShell';
import { AIMeetingNotesPanel } from './AIMeetingNotesPanel';

type InstructorDashboardData = {
  courses: any[];
  upcomingClasses: any[];
  assignments: any[];
  sessions: any[];
  submissions: any[];
  recentRecordings: any[];
  pendingGrading: any[];
  submissionsByAssignment: Record<string, number>;
  availableMeetings?: any[];
  aiMeetings?: any[];
};

const emptyCourseForm = {
  title: '',
  description: '',
  slug: '',
  code: '',
  status: 'draft',
};

const emptyAssignmentForm = {
  title: '',
  description: '',
  instructions: '',
  dueAt: '',
  pointsPossible: 100,
  status: 'draft',
};

export type InstructorWorkspaceView = 'course-editor' | 'courses' | 'schedule' | 'assignments' | 'students' | 'resources' | 'notes';

const workspaceViews: Record<InstructorWorkspaceView, { title: string; description: string }> = {
  'course-editor': {
    title: 'Create or edit course',
    description: 'Set course details, status, and learner-facing information in a focused editor.',
  },
  courses: {
    title: 'Courses',
    description: 'Create, edit, and organize the courses that anchor your learning workspace.',
  },
  schedule: {
    title: 'Schedule',
    description: 'Attach a live meeting to a course and give learners a clear session time.',
  },
  assignments: {
    title: 'Assignments',
    description: 'Create course work, publish it to learners, and open submissions for grading.',
  },
  students: {
    title: 'Students',
    description: 'Enroll learners into the active course and keep the roster current.',
  },
  resources: {
    title: 'Course resources',
    description: 'Manage the files and materials available inside the active course.',
  },
  notes: {
    title: 'AI meeting notes',
    description: 'Review concise meeting briefs, notes, decisions, actions, and transcripts.',
  },
};

export function InstructorLmsDashboard({ view = 'courses' }: { view?: InstructorWorkspaceView }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [dashboard, setDashboard] = useState<InstructorDashboardData>({
    courses: [],
    upcomingClasses: [],
    assignments: [],
    sessions: [],
    submissions: [],
    recentRecordings: [],
    pendingGrading: [],
    submissionsByAssignment: {},
    availableMeetings: [],
    aiMeetings: [],
  });
  const [loading, setLoading] = useState(true);
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [courseForm, setCourseForm] = useState(emptyCourseForm);
  const [editingCourseId, setEditingCourseId] = useState('');
  const [enrollmentValue, setEnrollmentValue] = useState('');
  const [sessionForm, setSessionForm] = useState({ meetingId: '', meetingTitle: '', startsAt: '', notes: '' });
  const [assignmentForm, setAssignmentForm] = useState(emptyAssignmentForm);
  const [gradingTarget, setGradingTarget] = useState<any | null>(null);
  const [gradeScore, setGradeScore] = useState('');
  const [gradeFeedback, setGradeFeedback] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState<'students' | 'schedule' | null>(null);
  const [formError, setFormError] = useState('');
  const [loadError, setLoadError] = useState('');
  const page = workspaceViews[view];
  const courseScopedView = view === 'schedule' || view === 'assignments' || view === 'students' || view === 'resources';
  const editCourseIdFromUrl = searchParams.get('courseId') || '';

  const selectedCourse = dashboard.courses.find((course) => course._id === selectedCourseId) || dashboard.courses[0] || null;

  const studentEmails = [...new Set(enrollmentValue.toLowerCase().split(/[\s,;]+/).map(email => email.trim()).filter(Boolean))];
  const newStudentEmails = studentEmails.filter(email => !(selectedCourse?.enrolledStudents || []).some((student: any) => student.email.toLowerCase() === email));

  const selectedAssignments = dashboard.assignments.filter((assignment) => assignment.courseId === selectedCourse?._id || assignment.courseId?.toString?.() === selectedCourse?._id);
  const selectedSessions = dashboard.sessions.filter((session) => session.courseId === selectedCourse?._id || session.courseId?.toString?.() === selectedCourse?._id);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setLoadError('');
      try {
        const [dashboardResponse, meetingsResponse] = await Promise.all([
          fetch('/api/lms/dashboard/instructor'),
          fetch('/api/lms/courses/meetings')
        ]);

        const dashboardBody = await dashboardResponse.json().catch(() => ({}));
        const meetingsBody = await meetingsResponse.json().catch(() => ({ meetings: [] }));


        if (dashboardResponse.ok) {
          const dashboardData = dashboardBody.dashboard || dashboard;
          setDashboard({
            ...dashboardData,
            availableMeetings: meetingsBody.meetings || []
          });
          const firstCourse = dashboardData.courses?.[0];
          if (firstCourse && !selectedCourseId) {
            setSelectedCourseId(firstCourse._id);
          }
        } else {
          setLoadError(dashboardBody.error || 'Failed to load instructor dashboard');
        }
      } catch (err) {
        console.error('Error loading dashboard:', err);
        setLoadError('Failed to load instructor dashboard');
      }
      setLoading(false);
    };

    void load();
  }, []);

  useEffect(() => {
    if (view !== 'course-editor' || !editCourseIdFromUrl || editingCourseId === editCourseIdFromUrl) return;

    const course = dashboard.courses.find((item) => item._id === editCourseIdFromUrl);
    if (!course) return;

    setSelectedCourseId(course._id);
    setEditingCourseId(course._id);
    setCourseForm({
      title: course.title || '',
      description: course.description || '',
      slug: course.slug || '',
      code: course.code || '',
      status: course.status || 'draft',
    });
  }, [dashboard.courses, editCourseIdFromUrl, editingCourseId, view]);

  useEffect(() => {
    if (courseScopedView && editCourseIdFromUrl && dashboard.courses.some(course => course._id === editCourseIdFromUrl)) {
      setSelectedCourseId(editCourseIdFromUrl);
    }
  }, [courseScopedView, editCourseIdFromUrl, dashboard.courses]);

  const stats = useMemo(
    () => [
      { label: 'Courses', value: dashboard.courses.length, helper: 'Managed learning spaces' },
      { label: 'Classes', value: dashboard.upcomingClasses.length, helper: 'Scheduled live sessions' },
      { label: 'Assignments', value: dashboard.assignments.length, helper: 'Published and draft work' },
      { label: 'Needs grading', value: dashboard.pendingGrading.length, helper: 'Submissions waiting for feedback' },
    ],
    [dashboard]
  );

  const reloadDashboard = async () => {
    const response = await fetch('/api/lms/dashboard/instructor');
    const body = await response.json().catch(() => ({}));
    if (response.ok) {
      setDashboard(body.dashboard || dashboard);
    }
  };

  const handleCourseSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage('');

    const payload = { ...courseForm };
    const isEditingCourse = Boolean(editingCourseId);
    const request = isEditingCourse ? fetch(`/api/lms/courses/${editingCourseId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }) : fetch('/api/lms/courses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const response = await request;
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMessage(body.error || 'Failed to save course');
      return;
    }

    setMessage(isEditingCourse ? 'Course updated' : 'Course created');
    setCourseForm(emptyCourseForm);
    setEditingCourseId('');
    await reloadDashboard();
    router.push('/lms/instructor');
  };

  const handleDeleteCourse = async (courseId: string) => {
    if (!confirm('Delete this course and its sessions, assignments, and submissions?')) return;
    const response = await fetch(`/api/lms/courses/${courseId}`, { method: 'DELETE' });
    if (response.ok) {
      setMessage('Course deleted');
      await reloadDashboard();
    }
  };

  const handleEnrollStudents = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedCourse || saving) return;
    setFormError(''); setMessage('');
    if (studentEmails.some(email => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
      setFormError('Check the email addresses. Use a comma, space, or new line between each address.'); return;
    }
    if (!newStudentEmails.length) { setFormError('Enter at least one new student email address.'); return; }
    setSaving('students');
    try {
      const response = await fetch(`/api/lms/courses/${selectedCourse._id}/enroll`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ students: newStudentEmails.map(email => ({ email })) }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Could not add students. Please try again.');
      setEnrollmentValue('');
      setMessage('Students added. They can sign in with these email addresses to find this course.');
      await reloadDashboard();
    } catch (error) { setFormError(error instanceof Error ? error.message : 'Could not add students. Please try again.'); }
    finally { setSaving(null); }
  };

  const handleSessionSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedCourse || saving) return;
    setFormError(''); setMessage('');
    const selectedMeeting = dashboard.availableMeetings?.find(m => m._id === sessionForm.meetingId);
    if (!selectedMeeting && !sessionForm.meetingTitle.trim()) { setFormError('Give your class a name.'); return; }
    const startsAt = new Date(sessionForm.startsAt);
    if (!Number.isFinite(startsAt.getTime()) || startsAt.getTime() <= Date.now()) { setFormError('Choose a future date and time.'); return; }
    setSaving('schedule');
    try {
      const response = await fetch(`/api/lms/courses/${selectedCourse._id}/sessions`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startsAt: startsAt.toISOString(), notes: sessionForm.notes,
          meetingTitle: sessionForm.meetingTitle.trim() || selectedMeeting?.title || selectedMeeting?.roomName,
          ...(selectedMeeting ? { meetingId: selectedMeeting.meetingId } : {}),
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Could not schedule your class. Please try again.');
      setSessionForm({ meetingId: '', meetingTitle: '', startsAt: '', notes: '' });
      setMessage('Class scheduled. Students in this course can find it under Upcoming classes.');
      await reloadDashboard();
    } catch (error) { setFormError(error instanceof Error ? error.message : 'Could not schedule your class. Please try again.'); }
    finally { setSaving(null); }
  };

  const handleJoinSession = async (session: any) => {
    setMessage('');

    try {
      // Ensure a meeting exists (will create one for manual sessions)
      const resp = await fetch(`/api/lms/courses/${selectedCourseId}/sessions/${session._id}/create-meeting`, { method: 'POST' });
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

      // Navigate to room
      window.location.href = `/room/${encodeURIComponent(meetingId)}`;
    } catch (err) {
      console.error('join session error', err);
      setMessage('Failed to join session');
    }
  };

  const handleAssignmentSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedCourseId) return;

    const response = await fetch(`/api/lms/courses/${selectedCourseId}/assignments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(assignmentForm),
    });

    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMessage(body.error || 'Assignment creation failed');
      return;
    }

    setAssignmentForm(emptyAssignmentForm);
    setMessage('Assignment created');
    await reloadDashboard();
  };

  const handleGradeSubmission = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!gradingTarget) return;

    const response = await fetch(`/api/lms/submissions/${gradingTarget._id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ score: gradeScore, feedback: gradeFeedback, status: 'returned' }),
    });

    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMessage(body.error || 'Grading failed');
      return;
    }

    setMessage('Submission graded');
    setGradingTarget(null);
    setGradeScore('');
    setGradeFeedback('');
    await reloadDashboard();
  };

  if (loading || loadError) {
    return (
      <LmsShell
        role="instructor"
        kicker="Instructor Dashboard"
        title={page.title}
        description={page.description}
        stats={stats}
      >
        <GlowCard>
          <div className="flex flex-col gap-2">
            <p className="font-display text-xl font-semibold text-slate-950">
              {loadError ? 'Could not load instructor dashboard' : 'Loading your teaching workspace'}
            </p>
            <p className="text-sm leading-6 text-slate-600">
              {loadError || 'Courses, meetings, sessions, assignments, resources, and grading queues are being prepared.'}
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
      role="instructor"
      kicker="Instructor Dashboard"
      title={page.title}
      description={page.description}
      stats={stats}
    >
      {message ? <GlowCard><p role="status" className="text-sm text-slate-700">{message}</p></GlowCard> : null}

      {courseScopedView && selectedCourse ? (
        <GlowCard className="p-4">
          <label className="block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500" htmlFor="active-course">
            Active course
          </label>
          <select
            id="active-course"
            className="mt-2 w-full max-w-xl rounded-2xl border border-slate-200 px-4 py-3 text-sm"
            disabled={Boolean(saving)} value={selectedCourse?._id || ''}
            onChange={(event) => { setSelectedCourseId(event.target.value); setFormError(''); setMessage(''); router.replace(`/lms/instructor/${view}?courseId=${encodeURIComponent(event.target.value)}`); }}
          >
            {dashboard.courses.map((course) => <option key={course._id} value={course._id}>{course.title}</option>)}
          </select>
        </GlowCard>
      ) : null}

      {view === 'courses' || view === 'course-editor' ? (
      <div className="grid gap-6">
        <GlowCard id="course-editor" className={`scroll-mt-24 ${view === 'course-editor' ? '' : 'hidden'}`}>
          <h3 className="font-display text-xl font-semibold text-slate-950">{editingCourseId ? 'Edit course' : 'New course'}</h3>
          <form onSubmit={handleCourseSubmit} className="mt-4 space-y-3">
            <input className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm" aria-label="Course title" required placeholder="Course name" value={courseForm.title} onChange={(event) => setCourseForm({ ...courseForm, title: event.target.value })} />
            <textarea className="min-h-[110px] w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm" aria-label="Course description (optional)" placeholder="What will students learn? (optional)" value={courseForm.description} onChange={(event) => setCourseForm({ ...courseForm, description: event.target.value })} />
            <details className="rounded-xl border border-slate-700 p-4"><summary className="cursor-pointer text-sm font-semibold">Course settings (optional)</summary><p className="my-3 text-xs text-slate-500">A course code and link are created automatically. Change them here if needed.</p>
            <input className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm" aria-label="Course link slug" placeholder="Course link slug (automatic)" value={courseForm.slug} onChange={(event) => setCourseForm({ ...courseForm, slug: event.target.value })} />
            <input className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm" aria-label="Course code" placeholder="Course code (automatic)" value={courseForm.code} onChange={(event) => setCourseForm({ ...courseForm, code: event.target.value })} />
            <select aria-label="Course status" className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm" value={courseForm.status} onChange={(event) => setCourseForm({ ...courseForm, status: event.target.value })}>
              <option value="draft">Draft</option>
              <option value="active">Active</option>
              <option value="archived">Archived</option>
            </select>
            </details>
            <div className="flex gap-3">
              <button type="button" onClick={() => { setCourseForm(emptyCourseForm); setEditingCourseId(''); router.push('/lms/instructor'); }} className="rounded-full border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-700">Cancel</button>
              <button type="submit" className="rounded-full bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white">{editingCourseId ? 'Update course' : 'Create course'}</button>
            </div>
          </form>
        </GlowCard>

        <GlowCard id="course-management" className={`scroll-mt-24 ${view === 'courses' ? '' : 'hidden'}`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-display text-xl font-semibold text-slate-950">Your courses</h3>
            <button className="rounded-full bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white" onClick={() => router.push('/lms/instructor/course-editor')}>Create course</button>
          </div>
          <div className="mt-4 space-y-3">
            {dashboard.courses.map((course) => (
              <div key={course._id} className={`rounded-2xl border p-4 ${selectedCourseId === course._id ? 'border-sky-300 bg-sky-50/70' : 'border-slate-200 bg-slate-50/70'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-950">{course.title}</p>
                    <p className="text-xs text-slate-500">{course.code} • {course.studentCount || course.enrolledStudents?.length || 0} students</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(['schedule', 'students', 'resources'] as const).map(section => <button key={section} className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold" onClick={() => router.push(`/lms/instructor/${section}?courseId=${encodeURIComponent(course._id)}`)}>{section === 'schedule' ? 'Schedule' : section === 'students' ? 'Students' : 'Resources'}</button>)}
                    <button className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold" onClick={() => router.push(`/lms/instructor/course-editor?courseId=${encodeURIComponent(course._id)}`)}>Edit</button>
                    <button className="rounded-full border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600" onClick={() => handleDeleteCourse(course._id)}>Delete</button>
                  </div>
                </div>
              </div>
            ))}
            {dashboard.courses.length === 0 ? <p className="text-sm text-slate-500">Create your first course to start organizing meetings and assignments.</p> : null}
          </div>
        </GlowCard>
      </div>
      ) : null}

      {courseScopedView && !selectedCourse ? (
        <GlowCard>
          <p className="text-sm text-slate-600">Start by creating a course. Then add students and schedule your first class.</p><button className="mt-4 rounded-full bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white" onClick={() => router.push('/lms/instructor/course-editor')}>Create your first course</button>
        </GlowCard>
      ) : null}

      {courseScopedView && selectedCourse ? (
        <div className="grid gap-6 xl:grid-cols-1">
          <GlowCard id="students" className={`scroll-mt-24 ${view === 'students' ? '' : 'hidden'}`}>
            <h3 className="font-display text-xl font-semibold text-slate-950">Add students</h3>
            <p className="mt-2 text-sm text-slate-500">Paste email addresses to add students to {selectedCourse.title}. No separate invitation setup needed.</p>
            <form onSubmit={handleEnrollStudents} className="mt-4 space-y-3">
              <label htmlFor="student-emails" className="block text-sm font-semibold">Student email addresses</label>
              <textarea id="student-emails" required disabled={Boolean(saving)} aria-describedby="student-email-help" className="min-h-[110px] w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm" placeholder="alex@example.com, sam@example.com" value={enrollmentValue} onChange={(event) => setEnrollmentValue(event.target.value)} />
              <p id="student-email-help" className="text-xs text-slate-500">Separate addresses with commas, spaces, or new lines. Duplicate addresses and existing students are skipped.</p>
              {formError && view === 'students' && <p role="alert" className="text-sm text-red-400">{formError}</p>}
              <button disabled={Boolean(saving) || !newStudentEmails.length} type="submit" className="rounded-full bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{saving === 'students' ? 'Adding students...' : newStudentEmails.length ? `Add ${newStudentEmails.length} student${newStudentEmails.length === 1 ? '' : 's'}` : 'Add students'}</button>
            </form>
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3"><h4 className="text-sm font-semibold">Students in this course ({selectedCourse.enrolledStudents?.length || 0})</h4><button className="text-sm underline" onClick={() => router.push(`/lms/instructor/schedule?courseId=${selectedCourse._id}`)}>Next: schedule a class</button></div>
            <div className="mt-4 space-y-2">
              {(selectedCourse.enrolledStudents || []).map((student: any) => (
                <div key={student.email} className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-sm text-slate-700">{student.email}</div>
              ))}
              {(selectedCourse.enrolledStudents || []).length === 0 ? <p className="text-sm text-slate-500">No students enrolled yet.</p> : null}
            </div>
          </GlowCard>

          <GlowCard id="class-schedule" className={`scroll-mt-24 ${view === 'schedule' ? '' : 'hidden'}`}>
            <h3 className="font-display text-xl font-semibold text-slate-950">Schedule a Class</h3>
            <p className="mt-2 text-sm text-slate-500">Name your class and choose a time. Your meeting room is prepared when you start the class.</p>
            <form onSubmit={handleSessionSubmit} className="mt-4 space-y-4">
              <fieldset disabled={Boolean(saving)} className="space-y-4">
                <div><label htmlFor="class-title" className="mb-2 block text-sm font-semibold">Class name</label><input id="class-title" required={!sessionForm.meetingId} className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm" placeholder="e.g. Introduction to photography" value={sessionForm.meetingTitle} onChange={(event) => setSessionForm({ ...sessionForm, meetingTitle: event.target.value })} /></div>
                <div><label htmlFor="class-time" className="mb-2 block text-sm font-semibold">Date and time</label><input id="class-time" required type="datetime-local" aria-describedby="class-time-help" className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm" value={sessionForm.startsAt} onChange={(event) => setSessionForm({ ...sessionForm, startsAt: event.target.value })} /><p id="class-time-help" className="mt-2 text-xs text-slate-500">Choose the time in your device?s local time zone. Students see it in their own time zone.</p></div>
                <details className="rounded-xl border border-slate-700 p-4"><summary className="cursor-pointer text-sm font-semibold">More options: notes or an existing meeting</summary>
                  <label htmlFor="class-notes" className="mb-2 mt-4 block text-sm">Notes (optional)</label><textarea id="class-notes" className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm" placeholder="What should students prepare?" value={sessionForm.notes} onChange={event => setSessionForm({ ...sessionForm, notes: event.target.value })} />
                  <label htmlFor="class-meeting" className="mb-2 mt-4 block text-sm">Meeting room</label><select id="class-meeting" className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm" value={sessionForm.meetingId} onChange={event => setSessionForm({ ...sessionForm, meetingId: event.target.value })}><option value="">Create a room when class starts (recommended)</option>{(dashboard.availableMeetings || []).map(meeting => <option key={meeting._id} value={meeting._id}>{meeting.roomName || meeting.title}</option>)}</select>
                </details>
              </fieldset>
              {formError && view === 'schedule' && <p role="alert" className="text-sm text-red-400">{formError}</p>}
              <button type="submit" disabled={Boolean(saving)} className="rounded-full bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{saving === 'schedule' ? 'Scheduling...' : 'Schedule class'}</button>
            </form>
            <p className="mt-4 text-sm text-slate-500">{selectedCourse.enrolledStudents?.length || 0} students in this course. <button className="underline" onClick={() => router.push(`/lms/instructor/students?courseId=${selectedCourse._id}`)}>Add students</button></p>
            <div className="mt-4 space-y-2">
              <p className="text-xs font-semibold text-slate-600 mb-2">Scheduled Classes</p>
              {selectedSessions.map((session) => (
                <div key={session._id} className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-sm text-slate-700">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold text-slate-950">{session.meetingTitle || session.meetingId}</div>
                      <div className="text-xs text-slate-500 mt-1">📅 {new Date(session.startsAt).toLocaleDateString()} • ⏰ {new Date(session.startsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                      {session.notes && <div className="text-xs text-slate-600 mt-2 italic">📝 {session.notes}</div>}
                    </div>
                    <div className="flex items-center">
                      <button onClick={() => handleJoinSession(session)} className="rounded-full bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white">Join</button>
                    </div>
                  </div>
                </div>
              ))}
              {selectedSessions.length === 0 ? <p className="text-sm text-slate-500">No classes scheduled yet.</p> : null}
            </div>
          </GlowCard>

          <GlowCard id="assignments" className={`scroll-mt-24 ${view === 'assignments' ? '' : 'hidden'}`}>
            <h3 className="font-display text-xl font-semibold text-slate-950">Create an assignment</h3>
            <form onSubmit={handleAssignmentSubmit} className="mt-4 space-y-3">
              <input className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm" aria-label="Assignment title" required placeholder="Assignment name" value={assignmentForm.title} onChange={(event) => setAssignmentForm({ ...assignmentForm, title: event.target.value })} />
              <textarea className="min-h-[110px] w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm" aria-label="Assignment description" placeholder="Short description (optional)" value={assignmentForm.description} onChange={(event) => setAssignmentForm({ ...assignmentForm, description: event.target.value })} />
              <textarea className="min-h-[110px] w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm" aria-label="Assignment instructions" placeholder="What should students do?" value={assignmentForm.instructions} onChange={(event) => setAssignmentForm({ ...assignmentForm, instructions: event.target.value })} />
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm">Due date (optional)<input type="datetime-local" className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm" value={assignmentForm.dueAt} onChange={(event) => setAssignmentForm({ ...assignmentForm, dueAt: event.target.value })} /></label>
                <label className="text-sm">Points<input type="number" min="0" className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm" value={assignmentForm.pointsPossible} onChange={(event) => setAssignmentForm({ ...assignmentForm, pointsPossible: Number(event.target.value) })} /></label>
              </div>
              <select aria-label="Assignment status" className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm" value={assignmentForm.status} onChange={(event) => setAssignmentForm({ ...assignmentForm, status: event.target.value })}>
                <option value="draft">Draft</option>
                <option value="published">Published</option>
                <option value="closed">Closed</option>
              </select>
              <button type="submit" className="rounded-full bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white">Create assignment</button>
            </form>
            <div className="mt-4 space-y-2">
              {selectedAssignments.map((assignment) => (
                <div key={assignment._id} className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-sm text-slate-700">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-semibold text-slate-950">{assignment.title}</div>
                      <div className="text-xs text-slate-500">{assignment.status} • {dashboard.submissionsByAssignment[assignment._id] || 0} submissions</div>
                    </div>
                    <button className="text-xs font-semibold text-sky-600 underline" onClick={() => setGradingTarget({ ...assignment, courseId: selectedCourse._id })}>Grade</button>
                  </div>
                </div>
              ))}
              {selectedAssignments.length === 0 ? <p className="text-sm text-slate-500">No assignments yet.</p> : null}
            </div>
          </GlowCard>

          <GlowCard id="resources" className={`scroll-mt-24 ${view === 'resources' ? '' : 'hidden'}`}>
            <h3 className="font-display text-xl font-semibold text-slate-950">Course Resources</h3>
            <p className="mt-2 text-sm text-slate-600">Share files and learning materials with this course.</p>
            <div className="mt-4">
              <FileShare scopeType="course" scopeId={selectedCourse._id} title="Course Resources" className="rounded-[1.5rem] border border-slate-200 bg-white p-4" />
            </div>
          </GlowCard>
        </div>
      ) : null}

      {view === 'assignments' && selectedCourse ? (
        <GlowCard id="grading" className="scroll-mt-24">
          <h3 className="font-display text-xl font-semibold text-slate-950">Submissions to grade</h3>
          <div className="space-y-3">
            {dashboard.pendingGrading.filter(submission => String(submission.courseId) === String(selectedCourse._id)).map((submission) => (
              <div key={submission._id} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 text-sm text-slate-700">
                <div className="font-semibold text-slate-950">{submission.studentName || submission.studentEmail}</div>
                <div className="text-xs text-slate-500">{submission.content?.slice(0, 120) || 'No submission content preview'}</div>
                <button className="mt-3 text-xs font-semibold text-sky-600 underline" onClick={() => setGradingTarget(submission)}>Open grading</button>
              </div>
            ))}
            {dashboard.pendingGrading.filter(submission => String(submission.courseId) === String(selectedCourse._id)).length === 0 ? <p className="text-sm text-slate-500">No submissions waiting for grading.</p> : null}
          </div>

        </GlowCard>
      ) : null}

      {view === 'notes' ? <AIMeetingNotesPanel meetings={dashboard.aiMeetings || []} /> : null}

      {gradingTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4 backdrop-blur-sm">
          <GlowCard className="w-full max-w-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">Grade Submission</p>
                <h3 className="mt-2 font-display text-2xl font-semibold text-slate-950">{gradingTarget.title}</h3>
              </div>
              <button onClick={() => setGradingTarget(null)} className="text-sm font-semibold text-slate-500">Close</button>
            </div>
            <form onSubmit={handleGradeSubmission} className="mt-6 space-y-4">
              <input className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm" placeholder="Score" value={gradeScore} onChange={(event) => setGradeScore(event.target.value)} />
              <textarea className="min-h-[140px] w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm" placeholder="Feedback" value={gradeFeedback} onChange={(event) => setGradeFeedback(event.target.value)} />
              <div className="flex gap-3">
                <button type="button" onClick={() => setGradingTarget(null)} className="rounded-full border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-700">Cancel</button>
                <button type="submit" className="rounded-full bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white">Save grade</button>
              </div>
            </form>
          </GlowCard>
        </div>
      ) : null}
    </LmsShell>
  );
}
