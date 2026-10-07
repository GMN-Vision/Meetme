'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MeetingRecordings } from './MeetingRecordings';
import {
  BookOpen,
  CalendarDays,
  ClipboardList,
  FolderOpen,
  GraduationCap,
  Sparkles,
  Users,
  Video,
} from 'lucide-react';

export function LmsShell({
  kicker,
  title,
  description,
  children,
  stats,
  role,
  showHeader = true,
}: {
  kicker: string;
  title: string;
  description: string;
  children: React.ReactNode;
  stats?: Array<{ label: string; value: string | number; helper?: string }>;
  role?: 'instructor' | 'student' | 'admin';
  showHeader?: boolean;
}) {
  const pathname = usePathname();
  const workspaceRole = role || (kicker.toLowerCase().includes('instructor') ? 'instructor' : kicker.toLowerCase().includes('admin') ? 'admin' : 'student');
  const workspaceLabel = workspaceRole === 'instructor' ? 'Instructor workspace' : workspaceRole === 'admin' ? 'Admin workspace' : 'Student workspace';
  const navigation = workspaceRole === 'instructor'
    ? [
        { href: '/lms', label: 'Meeting hub', icon: Video },
        { href: '/lms/instructor/course-editor', label: 'Create / edit course', icon: BookOpen },
        { href: '/lms/instructor', label: 'Course management', icon: GraduationCap },
        { href: '/lms/instructor/schedule', label: 'Schedule class', icon: CalendarDays },
        { href: '/lms/instructor/assignments', label: 'Assignments', icon: ClipboardList },
        { href: '/lms/instructor/students', label: 'Students', icon: Users },
        { href: '/lms/instructor/resources', label: 'Resources', icon: FolderOpen },
        { href: '/lms/instructor/course-activity', label: 'Course activity', icon: BookOpen },
        { href: '/lms/instructor/notes', label: 'AI meeting notes', icon: Sparkles },
      ]
    : workspaceRole === 'student'
      ? [
          { href: '/lms', label: 'Meeting hub', icon: Video },
          { href: '/lms/student', label: 'My courses', icon: GraduationCap },
          { href: '/lms/student/classes', label: 'Upcoming classes', icon: CalendarDays },
          { href: '/lms/student/assignments', label: 'Assignments', icon: ClipboardList },
          { href: '/lms/student/recordings', label: 'Recordings', icon: FolderOpen },
          { href: '/lms/student/notes', label: 'AI meeting notes', icon: Sparkles },
        ]
      : [
          { href: '/lms', label: 'Meeting hub', icon: Video },
          { href: '/lms/admin', label: 'System console', icon: GraduationCap },
        ];

  return (
    <div className="lms-workspace mx-auto grid w-full max-w-[90rem] gap-6 px-3 py-6 sm:px-5 lg:grid-cols-[15rem_minmax(0,1fr)] lg:py-8">
      <aside className="lms-sidebar hidden lg:flex">
        <div className="lms-sidebar__brand">
          <span className="font-display text-sm font-semibold text-[#f4f7fa]">Melanam</span>
          <span className="mt-1 block text-sm font-bold uppercase tracking-[0.12em] text-[#aeb4bf]">{workspaceLabel}</span>
        </div>
        <nav className="lms-sidebar__nav" aria-label="Workspace navigation">
          {navigation.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} aria-current={pathname === href ? 'page' : undefined} className={`lms-sidebar__link ${pathname === href ? 'lms-sidebar__link--active' : ''}`}>
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          ))}
        </nav>
        <div className="lms-sidebar__footer">
          <CalendarDays className="h-4 w-4 text-[#37d7ff]" />
          <span>Sessions and course work stay connected.</span>
        </div>
      </aside>

      <div className="min-w-0">
        <nav className="lms-mobile-nav mb-5 flex gap-2 overflow-x-auto pb-1 lg:hidden" aria-label="Workspace navigation">
          {navigation.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} aria-current={pathname === href ? 'page' : undefined} className={`lms-mobile-nav__link ${pathname === href ? 'lms-mobile-nav__link--active' : ''}`}>
              <Icon className="h-3.5 w-3.5" />
              {label}
            </Link>
          ))}
        </nav>

        {showHeader ? <header className="lms-shell-header relative overflow-hidden border-b border-[#2a3039] pb-6">
          <div aria-hidden="true" className="lms-shell-header__grid" />
          <div aria-hidden="true" className="lms-shell-header__glow" />
          <div className="min-w-0">
            <div className="lms-shell-eyebrow inline-flex items-center gap-2 text-sm font-bold uppercase tracking-[0.14em] text-[#37d7ff]">
              <span className="lms-shell-eyebrow__signal" />
              <Sparkles className="h-3.5 w-3.5" />
              {kicker}
            </div>
            <h1 className="lms-shell-title mt-3 max-w-4xl font-display text-[28px] font-semibold leading-tight text-[#f4f7fa] sm:text-[34px]">
              {title}
            </h1>
            <p className="lms-shell-description mt-3 max-w-2xl text-sm leading-6 text-[#a7b1bc] sm:text-[15px]">
              {description}
            </p>
            {stats && stats.length > 0 ? (
              <div className="lms-shell-stats mt-6 grid gap-px overflow-hidden rounded-lg border border-[#2a3039] bg-[#2a3039] sm:grid-cols-2 xl:grid-cols-4">
                {stats.map((stat) => (
                  <div key={stat.label} className="lms-shell-stat bg-[#12151a] px-4 py-3.5">
                    <p className="text-sm font-bold uppercase tracking-[0.1em] text-[#aeb4bf]">{stat.label}</p>
                    <p className="mt-1 text-[24px] font-semibold leading-none text-[#f4f7fa]">{stat.value}</p>
                    {stat.helper ? <p className="mt-2 text-sm leading-4 text-[#8f9aa8]">{stat.helper}</p> : null}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </header> : null}
        <main className={`lms-shell-body grid min-w-0 gap-5 ${showHeader ? 'pt-6' : ''}`}><MeetingRecordings />{children}</main>
      </div>
    </div>
  );
}
