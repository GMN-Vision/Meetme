'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, FileText, FolderOpen, Globe2, ListVideo, Pause, PencilLine, Play, Subtitles, Video } from 'lucide-react';

const FEATURES = [
  { name: 'Whiteboard & polls', icon: PencilLine, title: 'Turn ideas into a shared plan.', description: 'Sketch together, collect quick votes and make the next step clear to everyone.', points: ['Draw and write on the same board', 'See poll results as people vote'], badge: 'Create together' },
  { name: 'Files & presentations', icon: FolderOpen, title: 'Share it. Show it. Discuss it.', description: 'Bring your slides, documents and media into the meeting so everyone has the same context.', points: ['Preview PDFs, images, video and audio', 'Present your deck, one slide at a time'], badge: 'Keep everyone on the same page' },
  { name: 'Video playlists', icon: ListVideo, title: 'Watch together, in sync.', description: 'Queue up videos and keep the conversation going while everyone watches the same moment.', points: ['Add videos to a shared queue', 'Keep playback in sync across the room'], badge: 'One queue for the whole room' },
  { name: 'Live captions', icon: Subtitles, title: 'Follow every word as it happens.', description: 'Read the conversation while people speak, with automatic language detection built in.', points: ['Recognises speech in 32 languages', 'Creates a transcript for your meeting notes'], badge: 'Included with Pro and Business' },
  { name: 'Recordings & notes', icon: Video, title: 'Keep the conversation useful.', description: 'Replay the meeting and revisit the decisions when you need them.', points: ['Save recordings to watch or share later', 'Get AI summaries and action items on Pro'], badge: 'Recording on every plan. AI notes from Pro.' },
];

function Preview({ index }: { index: number }) {
  if (index === 0) return <div className="feature-demo feature-board">
    <div className="feature-demo__bar"><span>Team whiteboard</span><span className="feature-live">3 editing</span></div>
    <div className="feature-board__canvas">
      <span className="feature-sticky">The idea<br /><strong>A simpler welcome</strong></span>
      <span className="feature-sticky">The next step<br /><strong>Build a prototype</strong></span>
      <div className="feature-board__connector">Idea <span>→</span> Plan <span>→</span> Action</div>
    </div>
    <div className="feature-poll"><strong>Ready to move forward?</strong><div><span>Yes</span><span>8 votes</span></div><div className="feature-poll__track"><span /></div></div>
  </div>;
  if (index === 1) return <div className="feature-demo">
    <div className="feature-demo__bar"><span>Meeting files</span><span>Shared with the room</span></div>
    <div className="feature-deck"><span>PRODUCT REVIEW · 01 / 12</span><strong>Good ideas deserve<br />a clear presentation.</strong><div className="feature-deck__bars"><i /><i /><i /><i /></div></div>
    <div className="feature-file"><FileText /><div><strong>Research brief.pdf</strong><span>Ready to preview</span></div><span>PDF</span></div>
    <div className="feature-file"><FolderOpen /><div><strong>Review deck.pptx</strong><span>Presenting to everyone</span></div><span>12 slides</span></div>
  </div>;
  if (index === 2) return <div className="feature-demo">
    <div className="feature-demo__bar"><span>Shared playlist</span><span className="feature-live">Playing in sync</span></div>
    <div className="feature-video"><span className="feature-video__play"><Play fill="currentColor" /></span><strong>Product walkthrough</strong><span>02:18 / 05:40</span><div className="feature-video__progress"><span /></div></div>
    <div className="feature-file"><ListVideo /><div><strong>Design review</strong><span>Up next · 8 min</span></div><span>02</span></div>
    <div className="feature-file"><ListVideo /><div><strong>Team demo</strong><span>In the queue · 4 min</span></div><span>03</span></div>
  </div>;
  if (index === 4) return <div className="feature-demo">
    <div className="feature-demo__bar"><span>After the meeting</span><span>Product sync</span></div>
    <div className="feature-video"><span className="feature-video__play"><Play fill="currentColor" /></span><strong>Your meeting, saved</strong><span>Recording ready to replay</span></div>
    <div className="feature-caption"><span>SUMMARY</span><p>The team agreed to test the new welcome flow before Friday.</p></div>
    <div className="feature-file"><Check /><div><strong>Share the first prototype</strong><span>Alex ? Next action</span></div></div>
  </div>;
  return <div className="feature-demo feature-captions">
    <div className="feature-demo__bar"><span><Subtitles size={18} /> Live transcript</span><span className="feature-live">Listening</span></div>
    <div className="feature-caption"><span>Alex <small>ENGLISH</small></span><p>Let’s turn that idea into a plan before Friday.</p></div>
    <div className="feature-caption"><span>Lucía <small>SPANISH</small></span><p>Perfecto, comparto el primer borrador mañana.</p></div>
    <div className="feature-caption feature-caption--active"><span>Alex <small>ENGLISH</small></span><p>Great. We can review it together.<i /></p></div>
    <div className="feature-caption__footer"><Globe2 size={18} /> Language detected automatically</div>
  </div>;
}

export function FeatureCarousel() {
  const viewportRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef(0);
  const pointerStart = useRef<number | null>(null);
  const [active, setActive] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [visible, setVisible] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [interacting, setInteracting] = useState(false);

  const goTo = useCallback((index: number) => {
    const next = (index + FEATURES.length) % FEATURES.length;
    activeRef.current = next;
    setActive(next);
  }, []);

  useEffect(() => {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updateMotion = () => { setReducedMotion(motion.matches); };
    updateMotion();
    motion.addEventListener('change', updateMotion);
    const viewport = viewportRef.current!;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0.05 });
    observer.observe(viewport);
    return () => { motion.removeEventListener('change', updateMotion); observer.disconnect(); };
  }, []);

  useEffect(() => {
    if (!playing || !visible || interacting) return;
    const timer = window.setInterval(() => { if (!document.hidden) goTo(activeRef.current + 1); }, 6000);
    return () => window.clearInterval(timer);
  }, [active, playing, visible, interacting, goTo]);

  return <section id="features" className="feature-section mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20" aria-labelledby="features-title">
    <p className="feature-eyebrow">Everything your meeting needs</p>
    <h2 id="features-title">More than a video call.</h2>
    <p className="feature-intro">Create, share, watch and follow along. All in the same room.</p>
    <div className="feature-tabs" aria-label="Choose a feature">
      {FEATURES.map((feature, index) => <button key={feature.name} type="button" onClick={() => goTo(index)} aria-current={active === index ? 'true' : undefined} aria-controls="feature-slides"><feature.icon size={20} /><span>{feature.name}</span></button>)}
    </div>
    <div className="feature-carousel" role="region" aria-roledescription="carousel" aria-label="Meeting features">
      <div ref={viewportRef} id="feature-slides" className="feature-viewport" tabIndex={0} aria-label="Feature slides. Use left and right arrow keys to browse." onPointerDown={event => {
        pointerStart.current = event.clientX;
        event.currentTarget.setPointerCapture(event.pointerId);
        setInteracting(true);
      }} onPointerUp={event => {
        const distance = event.clientX - (pointerStart.current ?? event.clientX);
        if (Math.abs(distance) > 50) goTo(active + (distance < 0 ? 1 : -1));
        pointerStart.current = null;
        setInteracting(false);
      }} onPointerCancel={() => { pointerStart.current = null; setInteracting(false); }} onKeyDown={event => {
        if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') { event.preventDefault(); goTo(active + (event.key === 'ArrowRight' ? 1 : -1)); }
      }}>
        <div className="feature-track" data-reduced-motion={reducedMotion} style={{ transform: `translateX(-${active * 100}%)` }}>
        {FEATURES.map((feature, index) => <article key={feature.name} id={index === 3 ? 'captions' : undefined} className="feature-slide" role="group" aria-hidden={active !== index} aria-roledescription="slide" aria-label={`${index + 1} of ${FEATURES.length}: ${feature.name}`}>
          <div className="feature-copy"><span className="feature-icon"><feature.icon size={28} /></span><p className="feature-eyebrow">{feature.name}</p><h3>{feature.title}</h3><p className="feature-description">{feature.description}</p><ul>{feature.points.map(point => <li key={point}><Check size={19} /><span>{point}</span></li>)}</ul><span className="feature-badge">{feature.badge}</span></div>
          <Preview index={index} />
        </article>)}
        </div>
      </div>
      <div className="feature-controls">
        <button type="button" className="feature-playback" onClick={() => setPlaying(value => !value)} aria-label={playing ? 'Pause automatic sliding' : 'Start automatic sliding'}>{playing ? <Pause size={17} /> : <Play size={17} />}<span>{playing ? 'Auto sliding' : 'Paused'}</span></button>
        <span className="feature-counter" aria-live={playing ? 'off' : 'polite'}>{String(active + 1).padStart(2, '0')} <span>/ {String(FEATURES.length).padStart(2, '0')}</span></span>
        <div className="feature-arrows"><button type="button" onClick={() => goTo(active - 1)} aria-label="Previous feature"><ChevronLeft size={22} /></button><button type="button" onClick={() => goTo(active + 1)} aria-label="Next feature"><ChevronRight size={22} /></button></div>
      </div>
    </div>
  </section>;
}
