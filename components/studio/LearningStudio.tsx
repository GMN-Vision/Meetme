'use client';

import { useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { BookOpen, CalendarClock, CheckCircle2, ChevronRight, ClipboardCheck, Clock3, Copy, FileDown, FileText, GraduationCap, Loader2, PlaySquare, Sparkles, Video, Wand2 } from 'lucide-react';
import { GlowCard } from '@/components/ui/glow-card';
import type { StudioResult } from '@/lib/studio/types';

type SavedCourse = { _id: string; title: string; code: string; status: string };
type ScheduledMeeting = { meetingId: string; startsAt: string; title: string };

function defaultStartValue() {
  const start = new Date();
  start.setDate(start.getDate() + 1);
  start.setHours(10, 0, 0, 0);
  const timezoneOffset = start.getTimezoneOffset() * 60_000;
  return new Date(start.getTime() - timezoneOffset).toISOString().slice(0, 16);
}

function filename(title: string) {
  return `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'melanam-course'}.md`;
}

export function LearningStudio() {
  const { data: session } = useSession();
  const [source, setSource] = useState('');
  const [result, setResult] = useState<StudioResult | null>(null);
  const [savedCourse, setSavedCourse] = useState<SavedCourse | null>(null);
  const [scheduledMeeting, setScheduledMeeting] = useState<ScheduledMeeting | null>(null);
  const [startAt, setStartAt] = useState(defaultStartValue);
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [meetingTitle, setMeetingTitle] = useState('');
  const [error, setError] = useState('');
  const [status, setStatus] = useState<'idle' | 'generating' | 'saving' | 'scheduling'>('idle');
  const [copied, setCopied] = useState(false);

  const isManager = ['instructor', 'admin'].includes(String((session?.user as any)?.lmsRole || (session?.user as any)?.role || ''));
  const sourceLabel = useMemo(() => !source.trim() ? 'Ready for a topic or public YouTube URL' : /youtu\.be|youtube\.com/i.test(source) ? 'YouTube source detected' : /^https?:\/\//i.test(source) ? 'Video URL detected' : 'Topic prompt detected', [source]);
  const isBusy = status !== 'idle';

  const createBlueprint = async () => {
    if (!source.trim() || isBusy) return;
    setStatus('generating'); setError(''); setResult(null); setSavedCourse(null); setScheduledMeeting(null);
    try {
      const response = await fetch('/api/studio/process', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ source }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Unable to generate a course blueprint.');
      setResult(body.result);
      setMeetingTitle(`${body.result.course.title} - Live Session 1`);
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : 'Unable to generate a course blueprint.'); }
    finally { setStatus('idle'); }
  };

  const saveCourse = async () => {
    if (!result || !isManager || isBusy) return;
    setStatus('saving'); setError('');
    try {
      const { course, markdown, source: sourceInfo } = result;
      const response = await fetch('/api/lms/courses', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: course.title, description: course.description, status: 'draft', outline: { ...course, markdown, sourceUrl: sourceInfo.url || '' } }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Unable to save this course.');
      setSavedCourse(body.course);
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : 'Unable to save this course.'); }
    finally { setStatus('idle'); }
  };

  const scheduleMeeting = async () => {
    if (!savedCourse || !result || !isManager || isBusy) return;
    setStatus('scheduling'); setError('');
    try {
      const startsAt = new Date(startAt);
      const endsAt = new Date(startsAt.getTime() + durationMinutes * 60_000);
      if (Number.isNaN(startsAt.getTime())) throw new Error('Choose a valid start date and time.');
      const sessionResponse = await fetch(`/api/lms/courses/${encodeURIComponent(savedCourse._id)}/sessions`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(), meetingTitle: meetingTitle.trim() || `${result.course.title} - Live Session 1`, notes: `First live session for ${result.course.title}. ${result.course.modules[0]?.description || ''}` }),
      });
      const sessionBody = await sessionResponse.json().catch(() => ({}));
      if (!sessionResponse.ok) throw new Error(sessionBody.error || 'Unable to schedule the course session.');
      const meetingResponse = await fetch(`/api/lms/courses/${encodeURIComponent(savedCourse._id)}/sessions/${encodeURIComponent(sessionBody.session._id)}/create-meeting`, { method: 'POST' });
      const meetingBody = await meetingResponse.json().catch(() => ({}));
      if (!meetingResponse.ok) throw new Error(meetingBody.error || 'Session saved, but the meeting could not be created.');
      setScheduledMeeting({ meetingId: meetingBody.meetingId, startsAt: startsAt.toISOString(), title: sessionBody.session.meetingTitle });
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : 'Unable to schedule the course session.'); }
    finally { setStatus('idle'); }
  };

  const downloadCourse = () => {
    if (!result) return;
    const url = URL.createObjectURL(new Blob([result.markdown], { type: 'text/markdown;charset=utf-8' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename(result.course.title); document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url);
  };

  const copyCourse = async () => {
    if (!result) return;
    try { await navigator.clipboard.writeText(result.markdown); setCopied(true); window.setTimeout(() => setCopied(false), 1800); }
    catch { setError('Copy is unavailable in this browser.'); }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] pb-10">
      <section className="relative overflow-hidden border-b border-white/10 bg-slate-950 text-white">
        <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(2,6,23,0.98),rgba(15,23,42,0.95)_48%,rgba(8,47,73,0.92))]" />
        <div className="relative mx-auto w-full max-w-[80rem] px-4 py-8 sm:px-6 lg:px-8">
          <div className="inline-flex items-center gap-2 border border-white/10 bg-white/5 px-3 py-1 text-sm font-bold uppercase tracking-[0.2em] text-cyan-200"><Sparkles className="h-3.5 w-3.5" /> Melanam Studio</div>
          <div className="mt-4 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between"><div><h1 className="font-display text-3xl font-semibold tracking-normal sm:text-4xl">Course Builder</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">Build the curriculum, save the course, and schedule the first live class from one focused workspace.</p></div><div className="flex items-center gap-3 text-xs font-bold uppercase tracking-[0.14em] text-slate-400"><span className={`flex h-7 w-7 items-center justify-center border ${result ? 'border-cyan-300/60 bg-cyan-300/10 text-cyan-200' : 'border-white/25'}`}>1</span><span className="h-px w-7 bg-white/20" /><span className={`flex h-7 w-7 items-center justify-center border ${savedCourse ? 'border-cyan-300/60 bg-cyan-300/10 text-cyan-200' : 'border-white/25'}`}>2</span><span className="h-px w-7 bg-white/20" /><span className={`flex h-7 w-7 items-center justify-center border ${scheduledMeeting ? 'border-emerald-300/60 bg-emerald-300/10 text-emerald-200' : 'border-white/25'}`}>3</span></div></div>
        </div>
      </section>

      <main className="mx-auto grid w-full max-w-[80rem] gap-6 px-3 py-6 sm:px-5 lg:px-8">
        <GlowCard className="rounded-lg border-slate-200 bg-white p-4 shadow-sm hover:shadow-sm sm:p-6">
          <div className="flex flex-col gap-3 lg:flex-row"><label className="relative min-w-0 flex-1"><span className="sr-only">Course source</span><input value={source} onChange={(event) => setSource(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void createBlueprint(); }} placeholder="Paste a public YouTube URL or describe the course you want to build" className="h-12 w-full border border-slate-300 bg-white px-4 pr-12 text-sm text-slate-950 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/15" /><Wand2 className="pointer-events-none absolute right-4 top-3.5 h-5 w-5 text-slate-400" /></label><button type="button" onClick={() => void createBlueprint()} disabled={!source.trim() || isBusy} className="inline-flex h-12 items-center justify-center gap-2 bg-cyan-600 px-5 text-sm font-semibold text-white transition hover:bg-cyan-700 disabled:cursor-not-allowed disabled:bg-slate-300">{status === 'generating' ? <Loader2 className="h-4 w-4 animate-spin" /> : <GraduationCap className="h-4 w-4" />}{status === 'generating' ? 'Building curriculum' : 'Build course'}</button></div>
          <div className="mt-3 flex items-center gap-2 text-xs font-medium text-slate-500" aria-live="polite"><span className={`h-2 w-2 rounded-full ${status === 'generating' ? 'animate-pulse bg-cyan-500' : result ? 'bg-emerald-500' : 'bg-slate-300'}`} />{status === 'generating' ? 'Extracting source context and organizing the course' : sourceLabel}</div>
        </GlowCard>

        {error && <div className="flex items-start justify-between gap-4 border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900" role="alert"><div><p className="font-semibold">Course Builder needs your attention</p><p className="mt-1 text-amber-800">{error}</p></div><button type="button" onClick={() => setError('')} className="text-xs font-bold uppercase tracking-[0.08em] text-amber-800">Dismiss</button></div>}

        {result ? <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_23rem]">
          <section className="border border-slate-200 bg-white"><header className="border-b border-slate-200 px-4 py-5 sm:px-6"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-cyan-700">Course blueprint</p><h2 className="mt-1 text-xl font-semibold text-slate-950">{result.course.title}</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{result.course.description}</p></div><span className="shrink-0 border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600">{result.course.learnerLevel}</span></div><div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-600"><span className="inline-flex items-center gap-1.5 border border-slate-200 px-2 py-1"><Clock3 className="h-3.5 w-3.5 text-cyan-700" />{result.course.estimatedDuration}</span><span className="inline-flex items-center gap-1.5 border border-slate-200 px-2 py-1"><BookOpen className="h-3.5 w-3.5 text-cyan-700" />{result.course.modules.length} modules</span></div></header>
            <div className="p-4 sm:p-6"><section><h3 className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Learning outcomes</h3><ul className="mt-3 grid gap-2 sm:grid-cols-2">{result.course.learningOutcomes.map((outcome) => <li key={outcome} className="flex gap-2 border-l-2 border-cyan-500 bg-cyan-50/40 px-3 py-2 text-sm leading-6 text-slate-700"><CheckCircle2 className="mt-1 h-3.5 w-3.5 shrink-0 text-cyan-700" />{outcome}</li>)}</ul></section>
              <section className="mt-8"><h3 className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Curriculum</h3><div className="mt-3 divide-y divide-slate-200 border border-slate-200">{result.course.modules.map((module, index) => <details key={`${module.title}-${index}`} open={index === 0} className="group"><summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-4 text-sm font-semibold text-slate-900"><span className="flex h-7 w-7 shrink-0 items-center justify-center bg-slate-100 text-xs text-slate-600">{String(index + 1).padStart(2, '0')}</span><span className="min-w-0 flex-1">{module.title}<span className="mt-1 block text-xs font-normal leading-5 text-slate-500">{module.description}</span></span><ChevronRight className="h-4 w-4 text-slate-400 transition group-open:rotate-90" /></summary><div className="border-t border-slate-100 bg-slate-50/60 p-3 sm:p-4"><div className="grid gap-3">{module.lessons.map((lesson, lessonIndex) => <div key={`${lesson.title}-${lessonIndex}`} className="border border-slate-200 bg-white p-3"><div className="flex gap-3"><span className="pt-0.5 text-xs font-bold text-cyan-700">{index + 1}.{lessonIndex + 1}</span><div className="min-w-0 flex-1"><div className="flex flex-col justify-between gap-1 sm:flex-row"><h4 className="text-sm font-semibold text-slate-900">{lesson.title}</h4><span className="shrink-0 text-xs font-medium text-slate-500">{lesson.durationMinutes} min</span></div><p className="mt-1 text-sm leading-6 text-slate-600">{lesson.objective}</p>{lesson.notes && <p className="mt-2 border-l-2 border-slate-200 pl-2 text-xs leading-5 text-slate-500">{lesson.notes}</p>}{lesson.exercise && <p className="mt-2 text-xs font-medium leading-5 text-emerald-800">Exercise: {lesson.exercise}</p>}</div></div></div>)}</div></div></details>)}</div></section>
              <div className="mt-8 grid gap-4 md:grid-cols-2"><section className="border border-slate-200 p-4"><h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-slate-500"><ClipboardCheck className="h-4 w-4 text-cyan-700" /> Assessment</h3><p className="mt-3 text-sm leading-6 text-slate-700">{result.course.assessment}</p></section><section className="border border-slate-200 p-4"><h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-slate-500"><FileText className="h-4 w-4 text-cyan-700" /> Instructor notes</h3><p className="mt-3 text-sm leading-6 text-slate-700">{result.course.instructorNotes}</p></section></div>
            </div></section>

          <aside className="grid gap-4"><section className="border border-slate-200 bg-white p-4"><p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Course actions</p>{isManager ? <button type="button" onClick={() => void saveCourse()} disabled={Boolean(savedCourse) || isBusy} className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 bg-slate-950 px-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300">{status === 'saving' ? <Loader2 className="h-4 w-4 animate-spin" /> : savedCourse ? <CheckCircle2 className="h-4 w-4" /> : <BookOpen className="h-4 w-4" />}{status === 'saving' ? 'Saving course' : savedCourse ? 'Course saved to LMS' : 'Save course to LMS'}</button> : <p className="mt-3 text-sm leading-6 text-slate-600">An instructor or admin can save this blueprint as an LMS course and schedule live sessions.</p>}<div className="mt-3 grid grid-cols-2 gap-2"><button type="button" onClick={downloadCourse} className="flex h-10 items-center justify-center gap-2 border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50"><FileDown className="h-4 w-4" />Markdown</button><button type="button" onClick={() => void copyCourse()} className="flex h-10 items-center justify-center gap-2 border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50"><Copy className="h-4 w-4" />{copied ? 'Copied' : 'Copy'}</button></div></section>
            {savedCourse && <section className="border border-cyan-200 bg-cyan-50/40 p-4"><p className="text-xs font-bold uppercase tracking-[0.16em] text-cyan-800">Live course session</p><h3 className="mt-2 text-sm font-semibold text-slate-950">Schedule the first meeting</h3>{scheduledMeeting ? <div className="mt-3 border border-emerald-200 bg-emerald-50 p-3"><p className="flex items-center gap-2 text-sm font-semibold text-emerald-900"><CheckCircle2 className="h-4 w-4" />Meeting scheduled</p><p className="mt-1 text-xs leading-5 text-emerald-800">{new Date(scheduledMeeting.startsAt).toLocaleString()}</p><a href={`/room/${encodeURIComponent(scheduledMeeting.meetingId)}`} className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 bg-emerald-600 px-3 text-sm font-semibold text-white hover:bg-emerald-700"><Video className="h-4 w-4" />Open meeting</a></div> : <div className="mt-3 grid gap-3"><label className="grid gap-1 text-xs font-semibold text-slate-700">Session title<input value={meetingTitle} onChange={(event) => setMeetingTitle(event.target.value)} className="h-10 border border-slate-300 bg-white px-3 text-sm font-normal outline-none focus:border-cyan-500" /></label><label className="grid gap-1 text-xs font-semibold text-slate-700">Start time<input type="datetime-local" value={startAt} onChange={(event) => setStartAt(event.target.value)} className="h-10 border border-slate-300 bg-white px-3 text-sm font-normal outline-none focus:border-cyan-500" /></label><label className="grid gap-1 text-xs font-semibold text-slate-700">Duration<select value={durationMinutes} onChange={(event) => setDurationMinutes(Number(event.target.value))} className="h-10 border border-slate-300 bg-white px-3 text-sm font-normal outline-none focus:border-cyan-500"><option value={45}>45 minutes</option><option value={60}>60 minutes</option><option value={90}>90 minutes</option><option value={120}>120 minutes</option></select></label><button type="button" onClick={() => void scheduleMeeting()} disabled={isBusy} className="inline-flex h-11 items-center justify-center gap-2 bg-cyan-600 px-3 text-sm font-semibold text-white hover:bg-cyan-700 disabled:bg-slate-300">{status === 'scheduling' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarClock className="h-4 w-4" />}{status === 'scheduling' ? 'Scheduling' : 'Schedule meeting'}</button></div>}</section>}
            <section className="bg-slate-950 p-4 text-white"><p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Source</p><dl className="mt-4 grid gap-3 text-sm"><div><dt className="text-sm font-bold uppercase tracking-[0.12em] text-slate-500">Provider</dt><dd className="mt-1 font-medium">{result.source.providerLabel}</dd></div><div><dt className="text-sm font-bold uppercase tracking-[0.12em] text-slate-500">Course record</dt><dd className="mt-1 font-medium">{savedCourse ? `${savedCourse.code} (${savedCourse.status})` : 'Not saved yet'}</dd></div></dl>{result.source.url && <a href={result.source.url} target="_blank" rel="noreferrer" className="mt-5 inline-flex w-full items-center justify-center border border-white/20 px-3 py-2 text-xs font-bold uppercase tracking-[0.1em] text-slate-200 hover:bg-white/10">Open source</a>}</section>
            {result.transcriptPreview && <details className="border border-slate-200 bg-white p-4"><summary className="cursor-pointer text-xs font-bold uppercase tracking-[0.12em] text-slate-600">Transcript preview</summary><p className="mt-3 whitespace-pre-wrap text-xs leading-5 text-slate-600">{result.transcriptPreview}</p></details>}
          </aside>
        </div> : <section className="border border-slate-200 bg-white"><div className="flex min-h-[28rem] flex-col items-center justify-center p-6 text-center"><GraduationCap className="h-10 w-10 text-slate-300" /><h2 className="mt-4 text-base font-semibold text-slate-800">Start with the material you want to teach.</h2><p className="mt-2 max-w-md text-sm leading-6 text-slate-500">Course Builder turns a topic prompt or public YouTube lesson into a teachable curriculum, then puts it on the LMS calendar as a live session.</p></div></section>}
      </main>
    </div>
  );
}
