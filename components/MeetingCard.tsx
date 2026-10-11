'use client';

import Link from 'next/link';

interface MeetingCardProps {
  meetingId: string;
  title: string;
  hostEmail: string;
  createdAt: string;
  activityText?: string;
}

function formatTimeAgo(date: Date): string {
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function MeetingCard({
  meetingId,
  title,
  hostEmail,
  createdAt,
  activityText,
}: MeetingCardProps) {
  const date = new Date(createdAt);
  const timeAgo = formatTimeAgo(date);

  return (
    <Link href={`/room/${meetingId}`}>
      <div className="surface group cursor-pointer rounded-3xl p-4 transition-shadow duration-200 hover:shadow-xl sm:p-5">
        <div className="mb-3 flex items-start justify-between gap-3">
          <h3 className="truncate font-display text-sm font-semibold text-zinc-100 sm:text-base">
            {title}
          </h3>
        </div>
        <p className="mb-3 truncate text-xs text-zinc-400 sm:text-sm">{hostEmail}</p>
        {activityText ? (
          <p className="mb-4 line-clamp-2 text-xs leading-5 text-zinc-400 sm:text-sm">{activityText}</p>
        ) : null}
        <p className="text-xs text-zinc-400">Created {timeAgo}</p>
      </div>
    </Link>
  );
}
