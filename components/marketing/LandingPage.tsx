'use client';

import { HoverBorderGradient } from '@/components/ui/hover-border-gradient';

import Link from 'next/link';
import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { motion, useReducedMotion } from 'motion/react';
import { ArrowRight, Captions, Check, FileText, Files, Mic, MonitorUp, PencilLine, Play, ShieldCheck, Sparkles, Video } from 'lucide-react';
import { JoinModal } from '@/components/JoinModal';
import { Footer } from '@/components/ui/footer';
import { BILLING_PLAN_MAP, type BillingCycle } from '@/lib/billing-plans';
import { BillingToggle, PlanCards } from './PlanCards';
import { ComparisonTable } from './ComparisonTable';

function Reveal({ children, className = '', delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const reduce = useReducedMotion();
  return <motion.div initial={reduce ? false : { opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: .1 }} transition={{ duration: .6, delay }} className={className}>{children}</motion.div>;
}

export function LandingPage() {
  const { status } = useSession();
  const [joinOpen, setJoinOpen] = useState(false);
  const [cycle, setCycle] = useState<BillingCycle>('monthly');
  const startHref = status === 'authenticated' ? '/meetings' : '/sign-in';
  const free = BILLING_PLAN_MAP.free;
  const tools = [Video, MonitorUp, Captions, Files, PencilLine, Sparkles];
  const labels = ['Video meetings', 'Screen sharing', 'Live captions', 'Shared files', 'Whiteboards', 'AI meeting notes'];

  return <>
    <section className="template-hero relative flex flex-col items-center justify-center overflow-hidden px-4 pb-20 pt-12 sm:pt-16">
      <div className="hero-glow pointer-events-none absolute left-1/2 top-1/4 h-[500px] w-[min(800px,100%)] -translate-x-1/2 rounded-full bg-zinc-800/20 blur-3xl" aria-hidden="true" />
      <div className="relative mx-auto max-w-5xl text-center">
        <Reveal><span className="rotating-light mb-8 inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900 px-4 py-2 text-sm text-zinc-400"><span className="pulse-glow h-2 w-2 rounded-full bg-emerald-500 text-emerald-500" />Your next conversation starts here</span></Reveal>
        <Reveal delay={.1}><h1 className="design-blue mb-6 text-5xl font-bold leading-[1.1] tracking-[-.045em] text-white sm:text-6xl lg:text-7xl">Connect. Converse.<br /><span className="text-zinc-500">Collaborate. Create.</span></h1></Reveal>
        <Reveal delay={.2}><p className="mx-auto mb-10 max-w-2xl text-lg leading-relaxed text-zinc-400 sm:text-xl">Video meetings, recordings, and everything in between. Bring your people together with Melanam, right in your browser.</p></Reveal>
        <Reveal delay={.3} className="mb-14 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <HoverBorderGradient as={Link} href={startHref} className="button-primary shimmer-btn h-12 w-full !px-8 !text-base sm:w-auto">{status === 'authenticated' ? 'Open my meetings' : 'Start meeting free'}<ArrowRight className="h-4 w-4" /></HoverBorderGradient>
          <button onClick={() => setJoinOpen(true)} className="button-secondary h-12 w-full !px-8 !text-base sm:w-auto">Join a meeting</button>
        </Reveal>
        <Reveal delay={.4} className="flex flex-col items-center gap-4">
          <div className="flex -space-x-3" aria-hidden="true">{[1, 2, 3, 4, 5].map(index => <img key={index} src={`/images/people/person-${index}.png`} alt="" width={40} height={40} className="h-10 w-10 rounded-full border-2 border-zinc-950 object-cover" />)}</div>
          <p className="text-sm text-zinc-400">One link. Your people. <span className="text-zinc-300">Up to {free.maxParticipants} participants, free.</span></p>
        </Reveal>
      </div>
    </section>

    <section className="meeting-essentials border-y border-zinc-800/70 py-10" aria-label="Melanam meeting tools">
      <div className="mb-7 text-center"><p className="rotating-light essentials-label inline-flex text-xs uppercase tracking-[.18em] text-zinc-500">Your meeting essentials. All together.</p></div>
      <div className="feature-marquee mx-auto max-w-6xl overflow-hidden"><div className="animate-marquee flex w-max">{[0, 1].map(copy => <div key={copy} className="flex shrink-0 items-center gap-12 px-6 sm:gap-16" aria-hidden={copy === 1}>{tools.map((Icon, index) => <span key={index} className="flex items-center gap-3 whitespace-nowrap text-base font-semibold text-zinc-400"><Icon className="h-5 w-5" strokeWidth={1.5} />{labels[index]}</span>)}</div>)}</div></div>
    </section>

    <section id="features" className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
      <Reveal className="mb-16 text-center"><h2 className="design-blue text-3xl font-bold tracking-tight text-white sm:text-4xl">Everything you need to connect.</h2><p className="mx-auto mt-4 max-w-2xl text-zinc-400">From the first hello to the next step. A simpler space for conversations, collaboration, and the moments worth keeping.</p></Reveal>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Reveal className="template-feature template-card overflow-hidden md:col-span-2">
          <div className="mb-6 flex items-start justify-between"><div><span className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-800"><Video className="h-5 w-5 text-zinc-400" /></span><h3 className="text-xl font-semibold text-white">More room for conversation.</h3><p className="mt-2 max-w-lg text-sm text-zinc-400">Meet face to face, share your screen, and keep everyone in the loop. Send an invite link and you’re ready.</p></div><span className="hidden gap-1.5 sm:flex" aria-hidden="true">{[1,2,3,4,5].map(i => <span key={i} className="h-2 w-2 rounded-full bg-emerald-500/80" />)}</span></div>
          <div className="grid grid-cols-3 gap-3 rounded-xl border border-zinc-800 bg-zinc-950 p-5 text-center"><div><strong className="text-2xl text-white">{free.maxParticipants}</strong><p className="mt-1 text-xs text-zinc-500">Free participants</p></div><div><strong className="text-2xl text-white">{free.maxMeetingMinutes / 60} hrs</strong><p className="mt-1 text-xs text-zinc-500">Per free meeting</p></div><div><strong className="text-2xl text-white">1 link</strong><p className="mt-1 text-xs text-zinc-500">To bring people in</p></div></div>
        </Reveal>
        <Reveal delay={.05} className="template-feature template-card"><FeatureIcon icon={Captions} /><h3 className="text-lg font-semibold text-white">Follow every word.</h3><p className="mb-6 mt-2 text-sm text-zinc-400">Live captions help everyone stay with the conversation. Available on Pro and above.</p><div className="rounded-lg border border-zinc-700 bg-zinc-800 p-3 text-xs text-zinc-300"><span className="mr-2 inline-block rounded border border-zinc-600 px-1 font-bold">CC</span>Let’s turn that idea into a plan.</div></Reveal>
        <Reveal className="template-feature template-card"><FeatureIcon icon={Play} /><h3 className="text-lg font-semibold text-white">Keep the important moments.</h3><p className="mt-2 text-sm text-zinc-400">Record on every plan. Watch, download, and share with your meeting group when you’re ready.</p><div className="mt-6 flex items-center gap-3 rounded-xl bg-zinc-950 p-3"><Play className="h-8 w-8 rounded-full border border-zinc-700 p-2 text-white" /><div className="h-1 flex-1 rounded bg-zinc-800"><div className="h-1 w-2/3 rounded bg-zinc-400" /></div><span className="text-xs text-zinc-500">Recording</span></div></Reveal>
        <Reveal delay={.05} className="template-feature template-card"><FeatureIcon icon={Sparkles} /><h3 className="text-lg font-semibold text-white">Be present. Catch up later.</h3><p className="mt-2 text-sm text-zinc-400">AI summaries, decisions, and action items turn the conversation into clear next steps on paid plans.</p><div className="mt-6 space-y-3" aria-hidden="true">{['w-full','w-4/5','w-3/5'].map(width => <div key={width} className="flex items-center gap-2"><Check className="h-3 w-3 text-emerald-500" /><div className={`h-1.5 rounded bg-zinc-700 ${width}`} /></div>)}</div></Reveal>
        <Reveal delay={.1} className="template-feature template-card"><FeatureIcon icon={Files} /><h3 className="text-lg font-semibold text-white">Ideas belong together.</h3><p className="mt-2 text-sm text-zinc-400">Share files, sketch on a whiteboard, and gather feedback with polls without leaving your meeting.</p><div className="mt-6 flex gap-2">{[FileText, PencilLine, Mic].map((Icon,index) => <span key={index} className="rounded-lg border border-zinc-700 bg-zinc-800 p-3"><Icon className="h-4 w-4 text-zinc-400" /></span>)}</div></Reveal>
      </div>
    </section>

    <section id="pricing" className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
      <Reveal className="mb-12 text-center"><h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">Simple, transparent pricing.</h2><p className="mb-8 mt-4 text-zinc-400">Start free. Find more room to grow when you need it.</p><BillingToggle cycle={cycle} onChange={setCycle} /></Reveal>
      <Reveal><PlanCards cycle={cycle} /></Reveal>
      <p className="mt-8 text-center text-sm text-zinc-400"><Link href="/pricing" className="inline-flex items-center gap-2 hover:text-white">Explore all plan details <ArrowRight className="h-4 w-4" /></Link></p>
    </section>
    <ComparisonTable />
    <section className="landing-cta px-4 py-24 sm:py-32"><Reveal className="mx-auto max-w-4xl text-center"><h2 className="design-blue text-4xl font-bold tracking-tight text-white sm:text-5xl lg:text-6xl">Ready for a better meeting?</h2><p className="mx-auto mb-10 mt-6 max-w-xl text-lg text-zinc-400">Your people. Your ideas. One place to connect.<br />Start with Melanam for free.</p><div className="flex flex-col items-center justify-center gap-4 sm:flex-row"><HoverBorderGradient as={Link} href={startHref} className="button-primary shimmer-btn h-14 !px-8">Get started for free <ArrowRight className="h-5 w-5" /></HoverBorderGradient><Link href="/pricing" className="button-secondary h-14 !px-8">Explore plans</Link></div><p className="mt-8 inline-flex items-center gap-2 text-sm text-zinc-500"><ShieldCheck className="h-4 w-4" />No credit card required. Just your email.</p></Reveal></section>
    <Footer />
    <JoinModal isOpen={joinOpen} onClose={() => setJoinOpen(false)} />
  </>;
}

function FeatureIcon({ icon: Icon }: { icon: typeof Video }) {
  return <span className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-800"><Icon className="h-5 w-5 text-zinc-400" strokeWidth={1.5} /></span>;
}
