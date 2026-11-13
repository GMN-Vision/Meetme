'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useSession } from 'next-auth/react';
import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
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
import { FeatureCarousel } from './FeatureCarousel';

const FAQ = [
  { q: 'Do guests need an account?', a: 'No. Anyone with the meeting link can join from the browser. An account is only needed to host, keep recordings, and use the workspace.' },
  { q: 'Which plans include captions and AI notes?', a: 'Captions, transcripts and AI summaries are included from Pro. The Free plan covers meetings, cloud recording, files and whiteboards.' },
  { q: 'How long can a meeting run?', a: 'Free meetings run up to 3 hours. Pro allows 24-hour rooms and Business allows 48 hours.' },
  { q: 'Where do recordings and transcripts live?', a: 'They are processed in the cloud and appear in the Recordings and Notes pages of your workspace, ready to watch, download or share with the meeting group.' },
  { q: 'Can I present a slide deck or a video?', a: 'Yes. Upload a presentation and present it inside the room with speaker notes beside the slides. Shared video playlists and YouTube livestreaming are also available.' },
  { q: 'How is access controlled?', a: 'Each meeting uses signed room tokens, a host approval step for the waiting room, and plan-based feature limits for captions, notes, storage and recording.' },
];

function SectionHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return (
    <div className="mx-auto mb-12 max-w-2xl text-center">
      <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#2a2622] bg-[#14110e] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#e8b98d]">{eyebrow}</p>
      <h2 className="text-3xl font-bold leading-tight text-white sm:text-4xl">{title}</h2>
      <p className="mx-auto mt-4 max-w-xl text-[15px] leading-7 text-[#b9b1a6]">{description}</p>
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

        <FeatureCarousel />

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
