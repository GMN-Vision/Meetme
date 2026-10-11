'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ArrowUpRight, Check, Copy, Video } from 'lucide-react';

interface MeetingCardProps {
  meetingId: string;
  title: string;
  hostEmail: string;
  createdAt: string;
  activityText?: string;
}

export function MeetingCard({ meetingId, title, hostEmail, createdAt, activityText }: MeetingCardProps) {
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'error'>('idle');
  const roomHref = `/room/${encodeURIComponent(meetingId)}`;
  const date = new Date(createdAt);
  const dateLabel = Number.isNaN(date.getTime()) ? 'Date unavailable' : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(new URL(roomHref, window.location.origin).href);
      setCopyStatus('copied');
    } catch {
      setCopyStatus('error');
    }
  };

  return (
    <article className="group flex h-full min-w-0 flex-col rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5 transition hover:border-zinc-600 hover:bg-zinc-900/70">
      <div className="mb-5 flex items-center justify-between gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-950 text-zinc-400"><Video size={18} aria-hidden="true" /></span>
        <time dateTime={Number.isNaN(date.getTime()) ? undefined : date.toISOString()} className="text-xs text-zinc-500">{dateLabel}</time>
      </div>
      <h3 className="line-clamp-2 break-words text-base font-semibold leading-6 text-zinc-100"><Link href={roomHref} className="hover:underline">{title || 'Untitled meeting'}</Link></h3>
      <p className="mt-2 truncate text-xs text-zinc-400" title={hostEmail}>Hosted by {hostEmail}</p>
      {activityText && <p className="mt-3 line-clamp-2 text-sm leading-6 text-zinc-400">{activityText}</p>}
      <div className="mt-auto pt-5">
        <div className="flex items-center justify-between gap-2 border-t border-zinc-800 pt-3">
          <button type="button" onClick={() => void copyInvite()} aria-label={`Copy invite link for ${title || 'meeting'}`} className="inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-xs text-zinc-400 transition hover:bg-zinc-800 hover:text-white">{copyStatus === 'copied' ? <Check size={15} /> : <Copy size={15} />}<span aria-live="polite">{copyStatus === 'copied' ? 'Copied' : 'Copy link'}</span></button>
          <Link href={roomHref} aria-label={`Open ${title || 'meeting'}`} className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-medium text-zinc-100 transition hover:bg-zinc-800">Open room<ArrowUpRight size={16} aria-hidden="true" /></Link>
        </div>
        {copyStatus === 'error' && <p role="alert" className="mt-2 text-xs text-red-300">Could not copy. Open the room to share its address.</p>}
      </div>
    </article>
  );
}
