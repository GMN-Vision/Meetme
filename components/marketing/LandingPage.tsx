'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useSession } from 'next-auth/react';
import {
  ArrowRight,
  Check,
  ChevronDown,
  Link2,
  Mic,
  MonitorPlay,
  MessageCircle,
  PencilLine,
  Play,
  ShieldCheck,
  Users,
  Video,
  Globe2,
} from 'lucide-react';
import { JoinModal } from '@/components/JoinModal';
import { HoverBorderGradient } from '@/components/ui/hover-border-gradient';
import { Footer } from '@/components/ui/footer';
import { BILLING_PLAN_MAP, type BillingCycle, type DisplayCurrency } from '@/lib/billing-plans';
import { BillingToggle, CurrencySelector, PlanCards } from './PlanCards';
import { ComparisonTable } from './ComparisonTable';

const STEPS = [
  { title: 'Create a room', copy: 'Open a meeting in one click and send the link. Guests do not need an account.' },
  { title: 'Meet, share, decide', copy: 'Turn on captions, present a deck, run a poll or sketch on the board while the room talks.' },
  { title: 'Keep the outcome', copy: 'The recording, transcript, summary and action items are waiting when the call ends.' },
];

const FAQ = [
  { q: 'Do guests need an account?', a: 'No. Anyone with the meeting link can join from the browser. An account is only needed to host, keep recordings, and use the workspace.' },
  { q: 'Which plans include captions and AI notes?', a: 'Captions, transcripts and AI summaries are included from Pro. The Free plan covers meetings, cloud recording, files and whiteboards.' },
  { q: 'How long can a meeting run?', a: 'Free meetings run up to 3 hours. Pro allows 24-hour rooms and Business allows 48 hours.' },
  { q: 'Where do recordings and transcripts live?', a: 'They are processed in the cloud and appear in the Recordings and Notes pages of your workspace, ready to watch, download or share with the meeting group.' },
  { q: 'Can I present a slide deck or a video?', a: 'Yes. Upload a presentation and present it inside the room with speaker notes beside the slides. Shared video playlists and YouTube livestreaming are also available.' },
  { q: 'How is access controlled?', a: 'Each meeting uses signed room tokens, a host approval step for the waiting room, and plan-based feature limits for captions, notes, storage and recording.' },
];

const CAPTION_LANGUAGES = ['EN', 'ES', 'DE', 'FR', 'PT', 'IT', 'NL', 'JA', 'KO', 'ZH', 'HI', 'AR', 'TR', 'VI'];

function SectionHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return (
    <div className="mx-auto mb-12 max-w-2xl text-center">
      <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#2a2622] bg-[#14110e] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#e8b98d]">{eyebrow}</p>
      <h2 className="text-3xl font-bold leading-tight text-white sm:text-4xl">{title}</h2>
      <p className="mx-auto mt-4 max-w-xl text-[15px] leading-7 text-[#b9b1a6]">{description}</p>
    </div>
  );
}

function Artifact({ label, aside, children }: { label: string; aside: string; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-lg border border-[#262320] bg-[#0a0908]">
      <div className="flex items-center gap-2 px-3.5 py-2.5 text-[10px] font-medium uppercase tracking-[0.1em] text-[#736c62]">
        {label}
        <span className="ml-auto normal-case tracking-normal text-[#8c857a]">{aside}</span>
      </div>
      {children}
    </div>
  );
}

function Showcase({ eyebrow, title, copy, points, flip = false, children }: { eyebrow: string; title: string; copy: string; points: string[]; flip?: boolean; children: React.ReactNode }) {
  return (
    <div className="grid gap-8 border-t border-[#262320] py-12 lg:grid-cols-2 lg:items-center lg:gap-16 lg:py-14">
      <div className={flip ? 'lg:order-2' : undefined}>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#e8a05e]">{eyebrow}</p>
        <h3 className="mt-3 text-xl font-semibold tracking-[-0.01em] text-[#f5f1ea] sm:text-2xl">{title}</h3>
        <p className="mt-3 max-w-md text-[14px] leading-7 text-[#b9b1a6]">{copy}</p>
        <ul className="mt-5 space-y-2">
          {points.map(point => (
            <li key={point} className="flex items-start gap-2.5 text-[13px] leading-6 text-[#e8e2d8]">
              <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[#e8a05e]" />
              {point}
            </li>
          ))}
        </ul>
      </div>
      <div className={flip ? 'lg:order-1' : undefined}>{children}</div>
    </div>
  );
}

function MeetingWindow() {
  return (
    <div className="mkt-window overflow-hidden">
      <div className="flex items-center gap-2 border-b border-[#262320] px-3.5 py-2.5">
        <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-[#e8a05e]" />
        <p className="min-w-0 truncate text-[11px] font-medium text-[#e8e2d8]">Product sync</p>
        <span className="hidden text-[11px] text-[#736c62] sm:inline">482 913 7742</span>
        <span className="ml-auto hidden rounded bg-[#16130f] px-1.5 py-0.5 text-[10px] font-medium text-[#b9b1a6] sm:inline">Encrypted</span>
        <span className="flex items-center gap-1.5 text-[10px] font-medium text-rose-300">
          <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />REC 00:12:47
        </span>
      </div>

      <div className="relative bg-[#090807] p-1.5 pb-14">
        <div className="grid grid-cols-2 gap-1.5">
          {[
            { name: 'Alex', person: 'person-1', muted: false },
            { name: 'Lucía', person: 'person-2', muted: true },
          ].map((tile) => (
            <div key={tile.name} className="relative aspect-[4/3] overflow-hidden rounded-md bg-[#0c0a09]">
              <img src={`/images/people/${tile.person}.png`} alt="" aria-hidden="true" className="h-full w-full object-cover" />
              <span className="absolute bottom-1.5 left-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">{tile.name}</span>
              <span className="absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center rounded bg-black/55">
                <MicIcon muted={tile.muted} />
              </span>
            </div>
          ))}
        </div>

        <div className="mt-1.5 flex items-center gap-2 rounded-md border border-[#262320] bg-black/70 px-2.5 py-2">
          <span className="rounded border border-white/25 px-1 text-[9px] font-bold leading-4 text-white/75">CC</span>
          <p className="min-w-0 flex-1 truncate text-[11px] font-medium text-white sm:text-xs">Let’s ship the review deck on Friday and invite the lab team.</p>
          <span className="hidden items-center gap-1 text-[9px] font-semibold text-[#e8a05e] sm:inline-flex">
            <Globe2 className="h-2.5 w-2.5" />EN
          </span>
        </div>

        <div className="absolute inset-x-0 bottom-2 flex justify-center px-2">
          <div className="flex items-center gap-1 rounded-lg border border-[#332e28] bg-[#100e0c]/95 px-1.5 py-1">
            {[Mic, Video, Users, MessageCircle, MonitorPlay, PencilLine].map((Icon, index) => (
              <span key={index} className="grid h-7 w-7 place-items-center rounded text-[#e8e2d8]">
                <Icon className="h-3.5 w-3.5" />
              </span>
            ))}
            <span className="ml-1 rounded bg-rose-600 px-2 py-1 text-[10px] font-semibold text-white">Leave</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function MicIcon({ muted }: { muted: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke={muted ? '#f87171' : '#e4e4e7'} strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
      {muted && <path d="M3 3l18 18" />}
    </svg>
  );
}

function WindowBoard({ stickyCount = 3 }: { stickyCount?: number }) {
  return (
    <div className="border-t border-[#1c1815] p-3">
      <div className="overflow-hidden rounded-sm border border-[#3a342d] bg-[#ffffff]">
        <svg viewBox="0 0 320 160" className="h-32 w-full" aria-hidden="true">
          <rect width="320" height="160" fill="#f7f5f1" />
          <g stroke="#cfd6dd" strokeWidth="1">
            <line x1="0" y1="40" x2="320" y2="40" />
            <line x1="0" y1="80" x2="320" y2="80" />
            <line x1="0" y1="120" x2="320" y2="120" />
          </g>
          <rect x="20" y="110" width="80" height="46" rx="4" fill="#f3c98a" stroke="#b98a58" strokeWidth="1.4" />
          <rect x="120" y="70" width="80" height="46" rx="4" fill="#9aa6b5" stroke="#4d5866" strokeWidth="1.4" />
          <rect x="220" y="20" width="80" height="46" rx="4" fill="#7aa2f7" stroke="#5a7cc0" strokeWidth="1.4" />

          <g fill="none" stroke="#1a1410" strokeWidth="1" strokeLinecap="round">
            <path d="M28 140 L 60 130 L 78 136" />
            <path d="M142 76 L 178 64 L 194 72" />
            <path d="M228 28 L 268 12 L 284 28" />
          </g>
          <g fill="none" stroke="#3a2f25" strokeWidth="2" strokeLinecap="round">
            <path d="M8 30 C 60 20, 100 70, 150 36 S 260 26, 312 65" />
            <path d="M18 55 C 92 42, 140 98, 212 62 S 290 52, 316 101" />
          </g>

          {[
            { id: '1', x: 218, y: 40, color: '#f9a8d4' },
            { id: '2', x: 120, y: 74, color: '#9ece6a' },
          ].map(c => (
            <g key={c.id} transform={`translate(${c.x},${c.y}) scale(0.95)`}>
              <path d="M0 0 L 0 11 L 5 7 L 10 11 L 10 0 Z" fill={c.color} stroke="#ffffff" strokeWidth="1" />
              <path d="M0 0 L 0 -2 L 6 2 L 10 0 Z" fill={c.color} opacity="0.55" />
            </g>
          ))}
        </svg>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <div className="overflow-hidden rounded border border-[#3a342d] bg-[#f7f5f1] px-2 py-1.5 text-[10px] font-medium text-[#2a241d]">Ship Friday</div>
        <div className="overflow-hidden rounded border border-[#3a342d] bg-[#f7f5f1] px-2 py-1.5 text-[10px] font-medium text-[#2a241d]">OK to move</div>
        <div className="overflow-hidden rounded border border-[#3a342d] bg-[#f7f5f1] px-2 py-1.5 text-[10px] font-medium text-[#2a241d]">Ask lab team</div>
      </div>
    </div>
  );
}

function FileList() {
  return (
    <ul className="border-t border-[#1c1815]">
      {[
        ['PPTX', 'Q3 review deck', '4.2 MB', 'Slides'],
        ['MP4', 'Product demo', '38 MB', 'Playing'],
        ['PDF', 'Research brief', '1.1 MB', 'Open'],
        ['PNG', 'Sprint board photo', '2.4 MB', 'Open'],
        ['MP3', 'Interview clip', '6 MB', 'Open'],
      ].map(([type, name, size, action]) => (
        <li key={name} className="flex items-center gap-2.5 border-b border-[#1c1815] px-3 py-2.5 last:border-b-0">
          <span className="grid h-6 w-9 shrink-0 place-items-center rounded border border-[#3a342d] text-[8px] font-bold tracking-wide text-[#b98a58]">{type}</span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12px] font-medium text-[#f5f1ea]">{name}</p>
            <p className="text-[10px] text-[#736c62]">{size}</p>
          </div>
          <span className="shrink-0 text-[10px] font-medium text-[#8c857a]">{action}</span>
        </li>
      ))}
    </ul>
  );
}

function VideoPlaylist() {
  return (
    <ul className="border-t border-[#1c1815]">
      {[
        ['Now playing', 'Design systems in 12 minutes', '12:04'],
        ['Next', 'How we run a weekly review', '8:31'],
        ['Next', 'Prototyping in the browser', '15:47'],
      ].map(([state, title, length], index) => (
        <li key={title} className="flex items-center gap-2.5 border-b border-[#1c1815] px-3 py-2.5 last:border-b-0">
          <span className={index === 0 ? 'grid h-7 w-11 shrink-0 place-items-center rounded bg-[#2a1f14] text-[#e8a05e]' : 'grid h-7 w-11 shrink-0 place-items-center rounded bg-[#15120f] text-[#736c62]'}>
            <Play className="h-2.5 w-2.5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12px] font-medium text-[#f5f1ea]">{title}</p>
            <p className="text-[10px] text-[#736c62]">{state}</p>
          </div>
          <span className="shrink-0 text-[10px] tabular-nums text-[#8c857a]">{length}</span>
        </li>
      ))}
    </ul>
  );
}

function Slide({ label, aside, children }: { label: string; aside: string; children: React.ReactNode }) {
  const labelLines = label.toUpperCase().split(' ');
  return (
    <div className="flex gap-8 border-t border-[#262320] py-12 lg:gap-16 lg:py-14">
      <div className="shrink-0">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#e8a05e]">{label}</p>
        <span className="mt-2 inline-block text-[10px] text-[#8c857a]">{aside}</span>
        <div className="mt-6 h-12 w-px bg-gradient-to-b from-transparent via-[#e8a05e]/20 to-transparent" />
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function SlideStrip({ children }: { children: React.ReactNode }) {
  const gap = 'gap-8 lg:gap-16';
  return (
    <div className="mx-auto max-w-6xl overflow-hidden border-t border-[#262320] px-4 sm:px-6 lg:overflow-visible">
      <div className="mkt-slide-strip w-full animate-[ticker_38s_linear_infinite]">
        <div className="mkt-slide-track w-[200%] px-6 flex flex-wrap-nowrap">
          <div className={`flex flex-nowrap ${gap}`}>
            {children}
          </div>
          <div className={`flex flex-nowrap ${gap}`}>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

export function LandingPage() {
  const { status } = useSession();
  const [joinOpen, setJoinOpen] = useState(false);
  const [cycle, setCycle] = useState<BillingCycle>('monthly');
  const [currency, setCurrency] = useState<DisplayCurrency>('GBP');
  const startHref = status === 'authenticated' ? '/meetings' : '/sign-in';
  const startLabel = status === 'authenticated' ? 'Open my meetings' : 'Start a free meeting';
  const free = BILLING_PLAN_MAP.free;

  return (
    <>
      <div className="mkt-page -mt-[88px] md:-mt-24">
        <section className="mkt-hero relative overflow-hidden px-4 pb-14 pt-28 sm:px-6 sm:pt-32">
          <div className="mkt-orb -left-24 -top-20 h-96 w-96 bg-[radial-gradient(circle,#b06a2a,transparent_65%)]" aria-hidden="true" />
          <div className="mkt-orb -right-24 top-16 h-[26rem] w-[26rem] bg-[radial-gradient(circle,#e8a05e,transparent_65%)] [animation-delay:-6s]" aria-hidden="true" />
          <div className="relative mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#f0e9df] backdrop-blur">
                <Video className="h-3 w-3 text-white" />
                Video meetings · Live captions · AI notes
              </p>
              <h1 className="mt-5 text-4xl font-bold leading-[1.04] tracking-[-0.03em] text-white sm:text-5xl lg:text-[3.6rem]">
                Connect. Converse.
                <span className="mt-1 block bg-gradient-to-r from-[#fffaf4] via-[#f3dcc3] to-[#e8a05e] bg-clip-text text-transparent">Collaborate. Create.</span>
              </h1>
              <p className="mt-5 max-w-xl text-base leading-7 text-[#ece5db] sm:text-lg">
                Video meetings, recordings, and everything in between. Bring your people together with Melanam, right in your browser.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <HoverBorderGradient as={Link} href={startHref} className="w-full !min-h-12 !px-6 !text-sm sm:w-auto">
                  {startLabel}
                  <ArrowRight className="h-4 w-4" />
                </HoverBorderGradient>
                <button type="button" onClick={() => setJoinOpen(true)} className="mkt-btn mkt-btn--light">
                  <Link2 className="h-4 w-4" />
                  Join a meeting
                </button>
              </div>
              <ul className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-[#cfc7bb]">
                <li className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-white" />{free.maxParticipants} people on Free</li>
                <li className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-white" />{free.maxMeetingMinutes / 60}-hour meetings</li>
                <li className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-white" />No downloads</li>
                <li className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-white" />No card required</li>
              </ul>
            </div>

            <MeetingWindow />
          </div>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-b from-transparent to-[#0f0d0b]" aria-hidden="true" />
        </section>

        <section className="border-y border-[#262320] bg-[#0f0d0b]" aria-label="Melanam at a glance">
          <div className="mx-auto grid max-w-6xl grid-cols-2 divide-x divide-white/[0.07] px-4 sm:px-6 lg:grid-cols-4">
            {[
              { value: '600', label: 'people in one meeting' },
              { value: '32', label: 'caption languages' },
              { value: '48 h', label: 'maximum meeting length' },
              { value: '1 link', label: 'for guests to join' },
            ].map((stat, index) => (
              <div key={stat.label} className={`px-4 py-6 ${index > 1 ? 'border-t border-[#262320] lg:border-t-0' : ''}`}>
                <p className="bg-gradient-to-br from-white via-[#f0e0cf] to-[#e8a05e] bg-clip-text text-2xl font-bold text-transparent">{stat.value}</p>
                <p className="mt-1 text-xs text-[#8c857a]">{stat.label}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="features" className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <div className="max-w-2xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#e8a05e]">Inside the room</p>
            <h2 className="mt-3 text-[27px] font-bold leading-[1.12] tracking-[-0.02em] text-[#f5f1ea] sm:text-[2.4rem]">Everything opens in the call.</h2>
            <p className="mt-3 text-[15px] leading-7 text-[#b9b1a6]">No downloads and no “I’ll send it after”. The board, the files and the queue sit on the same screen as the people.</p>
          </div>

          <SlideStrip>
            <Slide label="Whiteboard and polls" aside="3 editing">
              <WindowBoard stickyCount={3} />
              <div className="mt-8 max-w-md space-y-2">
                <ul className="space-y-2">
                  <li className="flex items-start gap-2.5 text-[13px] leading-6 text-[#e8e2d8]"><span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[#e8a05e]"/>Sketch together on a shared board</li>
                  <li className="flex items-start gap-2.5 text-[13px] leading-6 text-[#e8e2d8]"><span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[#e8a05e]"/>Poll results land as people vote</li>
                </ul>
              </div>
            </Slide>
            <Slide label="Shared files" aside="5 in this meeting">
              <FileList />
              <div className="mt-8 max-w-md space-y-2">
                <ul className="space-y-2">
                  <li className="flex items-start gap-2.5 text-[13px] leading-6 text-[#e8e2d8]"><span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[#e8a05e]"/>Video, audio and PDFs preview inline</li>
                  <li className="flex items-start gap-2.5 text-[13px] leading-6 text-[#e8e2d8]"><span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[#e8a05e]"/>Decks open as slides you can page through</li>
                  <li className="flex items-start gap-2.5 text-[13px] leading-6 text-[#e8e2d8]"><span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[#e8a05e]"/>Images and documents stay with the meeting</li>
                </ul>
              </div>
            </Slide>
            <Slide label="Playlist" aside="3 queued">
              <VideoPlaylist />
              <div className="mt-8 max-w-md space-y-2">
                <ul className="space-y-2">
                  <li className="flex items-start gap-2.5 text-[13px] leading-6 text-[#e8e2d8]"><span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[#e8a05e]"/>Add links during the call</li>
                  <li className="flex items-start gap-2.5 text-[13px] leading-6 text-[#e8e2d8]"><span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[#e8a05e]"/>Plays in sync for everyone</li>
                  <li className="flex items-start gap-2.5 text-[13px] leading-6 text-[#e8e2d8]"><span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[#e8a05e]"/>The queue stays with the meeting</li>
                </ul>
              </div>
            </Slide>
          </SlideStrip>
        </section>

        <section id="captions" className="border-y border-[#262320] bg-[#0e0c0a] px-4 py-16 sm:px-6 sm:py-24">
          <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] lg:items-center lg:gap-16">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#e8a05e]">Live captions</p>
              <h2 className="mt-3 text-[27px] font-bold leading-[1.12] tracking-[-0.02em] text-[#f5f1ea] sm:text-[2.3rem]">
                Everyone reads in the language they think in.
              </h2>
              <p className="mt-3 text-[15px] leading-7 text-[#b9b1a6]">
                Turn subtitles on and talk. There is no language to pick: each sentence is recognised as it is spoken and its language is detected on its own.
              </p>
              <ul className="mt-6 space-y-2.5">
                {[
                  '32 languages, detected sentence by sentence',
                  'Lines appear while someone is still speaking',
                  'Captions fade out instead of popping away',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2.5 text-[13px] leading-6 text-[#e8e2d8]">
                    <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[#e8a05e]" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <div className="overflow-hidden rounded-lg border border-[#262320] bg-[#0a0908]">
              <div className="flex items-center gap-2 px-3.5 py-2.5 text-[10px] font-medium uppercase tracking-[0.1em] text-[#736c62]">
                Transcript
                <span className="ml-auto inline-flex items-center gap-1.5 normal-case tracking-normal text-[#8c857a]">
                  <span className="h-1 w-1 rounded-full bg-[#e8a05e]" />Auto-detect on
                </span>
              </div>
              {[
                ['00:04:12', 'Alex', 'Let’s turn that idea into a plan before Friday.', 'EN', false],
                ['00:04:19', 'Lucía', 'Convirtamos esa idea en un plan antes del viernes.', 'ES', true],
                ['00:04:27', 'Kenji', '金曜日までにそのアイデアを計画にしましょう。', 'JA', false],
                ['00:04:33', 'Anna', 'Machen wir daraus bis Freitag einen Plan.', 'DE', false],
              ].map(([time, speaker, line, code, active]) => (
                <div key={String(time)} className={active ? 'grid grid-cols-[2.9rem_3.4rem_1fr_1.2rem] items-start gap-2 border-t border-[#1c1815] bg-[#14110e] px-3 py-3 shadow-[inset_2px_0_0_#e8a05e]' : 'grid grid-cols-[2.9rem_3.4rem_1fr_1.2rem] items-start gap-2 border-t border-[#1c1815] px-3 py-3'}>
                  <span className="pt-0.5 text-[10px] tabular-nums text-[#736c62]">{time}</span>
                  <span className="pt-0.5 text-[11px] font-medium text-[#e8b98d]">{speaker}</span>
                  <p className="text-[12.5px] leading-5 text-[#e8e2d8]">{line}</p>
                  <span className="pt-0.5 text-right text-[9px] font-semibold text-[#736c62]">{code}</span>
                </div>
              ))}
              <div className="border-t border-[#1c1815] px-3 py-2 text-[10px] text-[#736c62]">Summary and action items are written from this transcript.</div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <div className="max-w-2xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#e8a05e]">How it works</p>
            <h2 className="mt-3 text-[27px] font-bold leading-[1.12] tracking-[-0.02em] text-[#f5f1ea] sm:text-[2.4rem]">From one link to a written record.</h2>
            <p className="mt-3 text-[15px] leading-7 text-[#b9b1a6]">Three steps, and the meeting leaves something behind.</p>
          </div>

          <div className="mt-10 grid gap-8 md:grid-cols-3">
            <div>
              <Artifact label="New meeting" aside="Free">
                <div className="space-y-2 border-t border-[#1c1815] p-3">
                  <div className="rounded border border-[#2a2622] bg-[#100e0c] px-2 py-1.5 text-[11px] text-[#f5f1ea]">Product sync</div>
                  <div className="flex gap-2">
                    <span className="rounded border border-[#2a2622] px-2 py-1 text-[10px] text-[#8c857a]">45 min</span>
                    <span className="rounded border border-[#2a2622] px-2 py-1 text-[10px] text-[#8c857a]">Waiting room</span>
                  </div>
                  <div className="rounded bg-[#e8a05e] px-2 py-1.5 text-center text-[11px] font-semibold text-[#1a1510]">Create room</div>
                </div>
              </Artifact>
              <p className="mt-4 text-[11px] font-semibold tabular-nums text-[#e8a05e]">01</p>
              <h3 className="mt-1 text-[15px] font-semibold text-[#f5f1ea]">Create the room</h3>
              <p className="mt-1 text-[13px] leading-6 text-[#b9b1a6]">Name it, pick a length, done.</p>
            </div>

            <div>
              <Artifact label="Invite" aside="Anyone with the link">
                <div className="space-y-2 border-t border-[#1c1815] p-3">
                  <div className="flex items-center gap-2">
                    <span className="flex-1 truncate rounded border border-[#2a2622] bg-[#100e0c] px-2 py-1.5 text-[10px] text-[#b9b1a6]">melanam.app/room/482-913-7742</span>
                    <span className="rounded bg-[#e8a05e] px-2 py-1.5 text-[10px] font-semibold text-[#1a1510]">Copy</span>
                  </div>
                  <div className="flex items-center gap-2 rounded border border-[#262320] px-2 py-1.5">
                    <span className="h-4 w-4 rounded-full bg-[#2a1f14]" />
                    <span className="text-[10px] text-[#b9b1a6]">Guest waiting</span>
                    <span className="ml-auto text-[10px] font-medium text-[#e8a05e]">Admit</span>
                  </div>
                </div>
              </Artifact>
              <p className="mt-4 text-[11px] font-semibold tabular-nums text-[#e8a05e]">02</p>
              <h3 className="mt-1 text-[15px] font-semibold text-[#f5f1ea]">Send one link</h3>
              <p className="mt-1 text-[13px] leading-6 text-[#b9b1a6]">Guests join in the browser, you approve them.</p>
            </div>

            <div>
              <Artifact label="After the meeting" aside="Saved">
                <ul className="border-t border-[#1c1815]">
                  {['Transcript', 'Summary and decisions', 'Action items with owners'].map(item => (
                    <li key={item} className="flex items-center gap-2 border-b border-[#1c1815] px-3 py-2.5 text-[11px] text-[#e8e2d8] last:border-b-0">
                      <span className="h-1 w-1 rounded-full bg-[#e8a05e]" />{item}
                    </li>
                  ))}
                </ul>
              </Artifact>
              <p className="mt-4 text-[11px] font-semibold tabular-nums text-[#e8a05e]">03</p>
              <h3 className="mt-1 text-[15px] font-semibold text-[#f5f1ea]">Keep the outcome</h3>
              <p className="mt-1 text-[13px] leading-6 text-[#b9b1a6]">Recording, transcript and action items wait for you.</p>
            </div>
          </div>
        </section>

        <section id="pricing" className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-24">
          <SectionHeading eyebrow="Pricing" title="Free to start. Room to grow." description="Every plan includes meetings, recording and file sharing. Captions and AI notes arrive with Pro." />
          <div className="mb-9 flex flex-wrap items-center justify-center gap-4">
            <BillingToggle cycle={cycle} onChange={setCycle} />
            <CurrencySelector currency={currency} onChange={setCurrency} />
          </div>
          <PlanCards cycle={cycle} currency={currency} />
          <p className="mt-8 text-center text-sm text-[#b9b1a6]">
            <Link href="/pricing" className="inline-flex items-center gap-2 transition-colors hover:text-white">
              Compare every plan detail <ArrowRight className="h-4 w-4" />
            </Link>
          </p>
        </section>

        <ComparisonTable />

        <section className="mx-auto max-w-3xl px-4 py-20 sm:px-6 sm:py-24" aria-labelledby="faq-title">
          <SectionHeading eyebrow="Questions" title="Answers before you sign up." description="If something is missing here, the help centre covers the rest." />
          <div className="overflow-hidden rounded-xl border border-[#262320] bg-[#121110]">
            {FAQ.map((item) => (
              <details key={item.q} className="group border-b border-[#2a2622] last:border-b-0">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-sm font-medium text-white marker:hidden">
                  {item.q}
                  <ChevronDown className="h-4 w-4 shrink-0 text-[#8c857a] transition-transform group-open:rotate-180" />
                </summary>
                <p className="px-5 pb-4 text-[13px] leading-6 text-[#b9b1a6]">{item.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="px-4 pb-20 sm:px-6">
          <div className="mkt-cta mx-auto max-w-6xl rounded-2xl px-6 py-12 text-center sm:px-12 sm:py-14">
            <h2 className="text-2xl font-bold text-[#f5f1ea] sm:text-3xl">Start a meeting your team can follow.</h2>
            <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-[#b9b1a6]">Create a room in seconds, invite people with one link, and keep the notes.</p>
            <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <HoverBorderGradient as={Link} href={startHref} className="w-full !min-h-12 !px-6 !text-sm sm:w-auto">
                {startLabel}
                <ArrowRight className="h-4 w-4" />
              </HoverBorderGradient>
              <Link href="/pricing" className="mkt-btn mkt-btn--navy w-full sm:w-auto">See plans</Link>
            </div>
            <p className="mt-5 text-xs text-[#8c857a]">No credit card required. Just your email.</p>
          </div>
        </section>
      </div>

      <Footer />
      <JoinModal isOpen={joinOpen} onClose={() => setJoinOpen(false)} />
    </>
  );
}
