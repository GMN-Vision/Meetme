'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';
import { createPortal } from 'react-dom';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Copy, LockKeyhole, PencilLine, Radio, ShieldCheck, Sparkles, Square, Upload, Video } from 'lucide-react';
import FileShare from './FileShare';
import { AudioCapture } from './AudioCapture';
import Whiteboard from './Whiteboard';
import { YouTubeStreamModal } from './YouTubeStreamModal';
import { useRecording } from '@/hooks/useRecording';
import { useLivestream } from '@/hooks/useLivestream';

type MembershipPlan = 'free' | 'pro' | 'business' | 'enterprise';

type Membership = {
  plan: MembershipPlan;
  active: boolean;
};

type UpgradePrompt = {
  feature: string;
  plan: 'Pro' | 'Business';
} | null;

const PLAN_RANK: Record<MembershipPlan, number> = {
  free: 0,
  pro: 1,
  business: 2,
  enterprise: 3,
};

export function Navbar() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isFilesOpen, setIsFilesOpen] = useState(false);
  const [isWhiteboardOpen, setIsWhiteboardOpen] = useState(false);
  const [whiteboardCloseRequestId, setWhiteboardCloseRequestId] = useState(0);
  const [isYouTubeModalOpen, setIsYouTubeModalOpen] = useState(false);
  const [copyStatus, setCopyStatus] = useState('');
  const [guestSpeakerName, setGuestSpeakerName] = useState('');
  const [membership, setMembership] = useState<Membership | null>(null);
  const [membershipResolved, setMembershipResolved] = useState(false);
  const [upgradePrompt, setUpgradePrompt] = useState<UpgradePrompt>(null);
  const filesPopoverRef = useRef<HTMLDivElement | null>(null);
  const roomMatch = pathname?.match(/^\/room\/([^/]+)$/);
  const roomMeetingId = roomMatch?.[1] ? decodeURIComponent(roomMatch[1]) : '';
  const isRoomPage = Boolean(roomMatch);
  const isLmsPage = pathname?.startsWith('/lms');
  const currentUrl = pathname ? `${pathname}${searchParams.toString() ? `?${searchParams.toString()}` : ''}` : '/';
  const signInHref = status === 'authenticated' ? '/lms' : `/sign-in?callbackUrl=${encodeURIComponent(currentUrl)}`;

  // Initialize recording and livestream hooks
  const {
    isRecording,
    canRecord: canUseRecording,
    canStop: canStopRecording,
    unavailableReason: recordingUnavailableReason,
    status: recordingStatus,
    startRecording,
    stopRecording,
    loading: recordingLoading,
    error: recordingError,
    elapsedTime: recordingElapsedTime,
    clearError: clearRecordingError,
  } = useRecording(roomMeetingId);
  const { isStreaming, startLivestream, stopLivestream, loading: livestreamLoading, error: livestreamError, clearError: clearLivestreamError } = useLivestream(roomMeetingId);

  const requestWhiteboardClose = useCallback(() => {
    setWhiteboardCloseRequestId((requestId) => requestId + 1);
  }, []);

  useEffect(() => {
    setIsFilesOpen(false);
    setIsDropdownOpen(false);
    setIsWhiteboardOpen(false);
    setIsYouTubeModalOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!roomMeetingId || status === 'authenticated') {
      return;
    }

    let storedName = '';

    try {
      storedName = localStorage.getItem('username') || '';
    } catch {
      storedName = '';
    }

    if (!storedName.trim()) {
      storedName = `Guest-${Math.floor(Math.random() * 1000)}`;

      try {
        localStorage.setItem('username', storedName);
      } catch {
        // Ignore storage failures; this name is still stable for the current render.
      }
    }

    setGuestSpeakerName(storedName);
  }, [roomMeetingId, status]);

  useEffect(() => {
    if (status !== 'authenticated') {
      setMembership(null);
      setMembershipResolved(status !== 'loading');
      return;
    }

    let cancelled = false;
    setMembershipResolved(false);

    fetch('/api/billing/subscription', { credentials: 'include' })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok || !body.subscription) {
          return null;
        }

        return body.subscription as Membership;
      })
      .then((nextMembership) => {
        if (!cancelled) {
          setMembership(nextMembership);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setMembership(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setMembershipResolved(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [status]);

  useEffect(() => {
    if (!isFilesOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (filesPopoverRef.current && !filesPopoverRef.current.contains(event.target as Node)) {
        setIsFilesOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [isFilesOpen]);

  useEffect(() => {

    if (!isWhiteboardOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        requestWhiteboardClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isWhiteboardOpen, requestWhiteboardClose]);

  const handleLogout = async () => {
    await signOut({ redirect: false });
    router.replace('/');
  };

  const handleCopyInvite = async () => {
    try {
      if (typeof window !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(window.location.href);
      } else if (typeof window !== 'undefined') {
        const tempInput = document.createElement('input');
        tempInput.value = window.location.href;
        document.body.appendChild(tempInput);
        tempInput.select();
        document.execCommand('copy');
        document.body.removeChild(tempInput);
      }
      setCopyStatus('Invite link copied');
      setTimeout(() => setCopyStatus(''), 2000);
    } catch {
      setCopyStatus('Copy failed');
      setTimeout(() => setCopyStatus(''), 2000);
    }
  };

  const handleLeave = () => {
    router.push(isLoggedIn ? '/lms' : '/');
  };

  const userEmail = session?.user?.email || '';
  const userInitial = userEmail?.[0]?.toUpperCase() || 'U';
  const isLoggedIn = status === 'authenticated';
  const captionSpeakerName = userEmail || guestSpeakerName || 'Guest';
  const captionSpeakerId = userEmail
    ? `user:${userEmail}`
    : `guest:${guestSpeakerName || 'guest'}`;

  const requestPaidFeature = (feature: string, minimumPlan: 'pro' | 'business') => {
    if (!isLoggedIn) {
      router.push(`/sign-in?callbackUrl=${encodeURIComponent(currentUrl)}`);
      return false;
    }

    const allowed = membership?.active && PLAN_RANK[membership.plan] >= PLAN_RANK[minimumPlan];
    if (allowed) {
      return true;
    }

    // If the subscription request has not returned yet, the server remains the
    // authority. Once resolved, show the upgrade action instead of letting a
    // free user start a request that will be rejected.
    if (membershipResolved) {
      setUpgradePrompt({ feature, plan: minimumPlan === 'pro' ? 'Pro' : 'Business' });
      return false;
    }

    return false;
  };

  const currentPlanRank = membership?.active ? PLAN_RANK[membership.plan] : -1;
  const canUseCaptions = currentPlanRank >= PLAN_RANK.pro;

  const canUseFiles = Boolean(membership?.active);
  const canUseLivestream = currentPlanRank >= PLAN_RANK.business;

  const productLinks = [
    {
      name: 'Meetings',
      href: '/lms',
      tag: 'Live',
      description: 'Create rooms and start calls fast.',
      hoverClass: 'hover:-translate-y-0.5 hover:border-cyan-300 hover:bg-cyan-100 hover:shadow-[0_14px_30px_rgba(6,182,212,0.2)]',
      tagClass: 'bg-cyan-500/15 text-cyan-800 ring-cyan-500/20',
    },
    {
      name: 'Live Captions',
      href: '/lms',
      tag: 'AI',
      description: 'Stream captions in real time.',
      hoverClass: 'hover:-translate-y-0.5 hover:border-violet-300 hover:bg-violet-100 hover:shadow-[0_14px_30px_rgba(139,92,246,0.2)]',
      tagClass: 'bg-violet-500/15 text-violet-800 ring-violet-500/20',
    },
    {
      name: 'File Share',
      href: '/lms',
      tag: 'Now',
      description: 'Keep room uploads in one place.',
      hoverClass: 'hover:-translate-y-0.5 hover:border-emerald-300 hover:bg-emerald-100 hover:shadow-[0_14px_30px_rgba(16,185,129,0.2)]',
      tagClass: 'bg-emerald-500/15 text-emerald-800 ring-emerald-500/20',
    },
  ];

  const navActionButtonClass =
    'inline-flex h-10 w-10 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md border border-[#2a3039] bg-[#181c22] px-0 text-base font-semibold text-[#f4f7fa] transition-colors hover:bg-[#20252d] lg:w-auto lg:px-4';
  const copyInviteHoverClass =
    'hover:border-[#37d7ff] hover:text-[#37d7ff]';
  const uploadMediaHoverClass =
    'hover:border-[#49d17d] hover:text-[#49d17d]';
  const whiteboardHoverClass =
    'hover:border-[#f2b84b] hover:text-[#f2b84b]';
  const recordingHoverClass =
    'hover:border-[#ef6b73] hover:text-[#ef6b73]';
  const livestreamHoverClass =
    'hover:border-[#ef6b73] hover:text-[#ef6b73]';

  return (
    <nav className="fixed inset-x-0 top-0 z-[1000] px-3 pt-3 sm:px-5 sm:pt-5">
      <div className={`app-navbar-shell mx-auto max-w-[80rem] rounded-2xl border border-white/10 bg-black/70 shadow-[0_18px_60px_rgba(0,0,0,0.35)] backdrop-blur-xl ${pathname === '/' ? 'app-navbar-shell--landing' : ''} ${isRoomPage ? 'app-navbar-shell--room' : ''}`}>
        <div className="flex h-14 items-center justify-between gap-3">
          <div className="flex items-center gap-3 sm:gap-4">
            <Link href="/" className="app-navbar-brand flex items-center gap-2.5" aria-label="Melanam home">
              <span className="app-brand-mark" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              <span className="hidden font-display text-xl font-semibold tracking-[-0.055em] text-[#f8f8f8] sm:inline">
                melan<span>am</span>
              </span>
            </Link>

            {pathname === '/' && (
              <div className="app-navbar-links hidden items-center gap-1 md:flex">
                <Link href="#features">Features</Link>
                <Link href="/pricing">Pricing</Link>
                <Link href="/about">About</Link>
              </div>
            )}

            {pathname?.startsWith('/room/') && (
              <div className="flex flex-nowrap items-center gap-2">
                <button
                  onClick={handleCopyInvite}
                  className={`${navActionButtonClass} ${copyInviteHoverClass}`}
                  aria-label="Copy invite link"
                  title="Copy invite link"
                >
                  <Copy className="h-4 w-4" />
                  <span className="hidden lg:inline">Copy link</span>
                </button>
                {canUseCaptions ? (
                  <AudioCapture
                    meetingId={roomMeetingId}
                    className="relative flex flex-col gap-2"
                    buttonClassName={`${navActionButtonClass} border-slate-200 bg-slate-100/80 text-slate-950 hover:-translate-y-0.5 hover:border-blue-300 hover:bg-blue-100 hover:text-blue-950 hover:shadow-[0_14px_30px_rgba(59,130,246,0.2)]`}
                    labelClassName="hidden lg:inline"
                    speakerName={captionSpeakerName}
                    speakerId={captionSpeakerId}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => requestPaidFeature('Live captions', 'pro')}
                    className={`${navActionButtonClass} border-slate-200 bg-slate-100/80 text-slate-950 hover:border-blue-300 hover:bg-blue-100 hover:text-blue-950`}
                    aria-label="Live captions require Pro"
                    title="Live captions require Pro"
                  >
                    <LockKeyhole className="h-4 w-4" />
                    <span className="hidden lg:inline">Captions</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    if (isRecording) {
                      void stopRecording(roomMeetingId);
                    } else if (canUseRecording) {
                      void startRecording(roomMeetingId);
                    }
                  }}
                  disabled={recordingLoading || (isRecording ? !canStopRecording : !canUseRecording)}
                  className={`${navActionButtonClass} ${
                    isRecording
                      ? 'border-red-200 bg-red-50/85 text-red-950 shadow-[0_10px_24px_rgba(239,68,68,0.12)]'
                      : `border-slate-200 bg-slate-100/80 text-slate-950 ${recordingHoverClass}`
                  } disabled:opacity-50`}
                  aria-label={isRecording ? 'Stop server recording' : 'Start server recording'}
                  title={isRecording ? 'Stop server recording' : recordingUnavailableReason || (canUseRecording ? 'Start server recording' : 'Only the host can record')}
                >
                  {isRecording ? <Square className="h-4 w-4 fill-current" /> : canUseRecording ? <Radio className="h-4 w-4" /> : <LockKeyhole className="h-4 w-4" />}
                  <span className="hidden lg:inline">
                    {recordingLoading ? (recordingStatus === 'processing' ? 'Processing...' : 'Starting...') : isRecording ? 'Stop Recording' : 'Record'}
                  </span>
                </button>
                {(isRecording || recordingStatus === 'starting') && (
                  <div
                    className="inline-flex h-9 items-center gap-2 rounded-xl border border-red-200 bg-red-50/90 px-3 text-xs font-bold text-red-700 shadow-[0_10px_24px_rgba(239,68,68,0.12)] lg:inline-flex"
                    aria-live="polite"
                  >
                    <span className="h-2.5 w-2.5 rounded-full bg-red-600 animate-pulse" />
                    <span className="hidden sm:inline">{isRecording ? 'Recording' : 'Starting recording'}</span>
                    <span className="font-mono text-red-900">{recordingElapsedTime}</span>
                  </div>
                )}
                {/* Livestream is temporarily hidden until the server-side streaming setup is ready.
                <button
                  onClick={() => {
                    if (isStreaming) {
                      stopLivestream(roomMeetingId);
                    } else if (requestPaidFeature('Livestreaming', 'business')) {
                      setIsYouTubeModalOpen(true);
                    }
                  }}
                  disabled={livestreamLoading}
                  className={`${navActionButtonClass} ${
                    isStreaming
                      ? 'border-rose-200 bg-rose-50/85 text-rose-950 shadow-[0_10px_24px_rgba(244,63,94,0.12)]'
                      : livestreamHoverClass
                  } disabled:opacity-50`}
                  aria-label={isStreaming ? 'Stop livestream' : 'Start livestream'}
                  title={isStreaming ? 'Stop livestream' : canUseLivestream ? 'Start livestream' : 'Livestreaming requires Business'}
                >
                  {canUseLivestream || isStreaming ? <Video className="h-4 w-4" /> : <LockKeyhole className="h-4 w-4" />}
                  <span className="hidden lg:inline">{isStreaming ? 'Stop Live' : 'Go Live'}</span>
                </button> */}
                <button
                  onClick={() => {
                    if (isWhiteboardOpen) {
                      requestWhiteboardClose();
                    } else {
                      setIsWhiteboardOpen(true);
                    }
                  }}
                  className={`${navActionButtonClass} ${
                    isWhiteboardOpen
                      ? 'border-amber-200 bg-amber-50/85 text-amber-950 shadow-[0_10px_24px_rgba(245,158,11,0.12)]'
                      : whiteboardHoverClass
                  }`}
                  aria-label={isWhiteboardOpen ? 'Close whiteboard' : 'Open whiteboard'}
                  title={isWhiteboardOpen ? 'Close whiteboard' : 'Open whiteboard'}
                >
                  <PencilLine className="h-4 w-4" />
                  <span className="hidden lg:inline">Whiteboard</span>
                </button>
                <div ref={filesPopoverRef} className="relative">
                  <button
                    onClick={() => {
                      if (isFilesOpen) {
                        setIsFilesOpen(false);
                      } else if (canUseFiles) {
                        setIsFilesOpen(true);
                      }
                    }}
                    className={`${navActionButtonClass} ${
                      isFilesOpen
                        ? 'border-emerald-200 bg-emerald-50/85 text-emerald-950 shadow-[0_10px_24px_rgba(16,185,129,0.12)]'
                        : uploadMediaHoverClass
                    }`}
                    aria-label={isFilesOpen ? 'Close upload media' : 'Open upload media'}
                    title={isFilesOpen ? 'Close upload media' : canUseFiles ? 'Open upload media' : 'Select an active plan to share files'}
                  >
                    {canUseFiles ? <Upload className="h-4 w-4" /> : <LockKeyhole className="h-4 w-4" />}
                    <span className="hidden lg:inline">Files</span>
                  </button>
                  {isFilesOpen && (
                    <div className="fixed left-1/2 top-20 z-[1010] w-[calc(100vw-1.5rem)] max-w-[520px] -translate-x-1/2 overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white p-3 shadow-[0_24px_80px_rgba(15,23,42,0.22)] sm:absolute sm:left-0 sm:top-auto sm:mt-3 sm:w-[520px] sm:max-w-[calc(100vw-2rem)] sm:translate-x-0">
                      <FileShare
                        meetingId={roomMeetingId}
                        scopeType="meeting"
                        title="Shared Files"
                        className="border-0 bg-transparent p-0"
                      />
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 sm:gap-2.5">
            {isLoggedIn ? (
              <div className="flex items-center gap-2 sm:gap-2.5">
                {!isRoomPage && (
                  <Link href="/pricing" className="font-display inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-zinc-200 transition hover:border-[#ef233c]/60 hover:bg-white/10 hover:text-white">
                    Pricing
                  </Link>
                )}
                {!isRoomPage && !isLmsPage && (
                  <Link href="/lms" className="noir-shimmer-button font-display inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-white transition-all hover:-translate-y-0.5 active:scale-[0.97]">
                    <span>Continue</span>
                  </Link>
                )}
                <button
                  type="button"
                  onClick={handleLogout}
                  className="font-display inline-flex items-center gap-2 rounded-full border border-[#ef233c]/35 bg-[#ef233c]/10 px-4 py-2 text-sm font-semibold text-[#fda4af] transition hover:border-[#ef233c]/60 hover:bg-[#ef233c]/18 hover:text-white"
                >
                  Logout
                </button>
                <span className="hidden h-8 items-center whitespace-nowrap px-1 text-sm leading-none text-slate-500 lg:inline-flex">
                  {userEmail}
                </span>
                <div className="relative">
                  <button
                    onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-950 text-sm font-semibold leading-none text-white shadow-sm"
                  >
                    {userInitial}
                  </button>

                  {isDropdownOpen && (
                    <div className="absolute right-0 z-[1010] mt-3 w-48 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl sm:w-52">
                      <Link
                        href="/studio"
                        className="flex items-center gap-2 px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-cyan-50 hover:text-cyan-800"
                      >
                        <Sparkles className="h-4 w-4 text-cyan-600" />
                        Course Builder
                      </Link>
                      <Link
                        href="/lms"
                        className="block px-4 py-3 text-sm text-slate-700 hover:bg-slate-50 transition"
                      >
                        LMS Dashboard
                      </Link>
                      {!isRoomPage && (
                        <Link
                          href="/pricing"
                          className="block px-4 py-3 text-sm text-slate-700 hover:bg-slate-50 transition"
                        >
                          Membership & credits
                        </Link>
                      )}
                      {(session?.user as any)?.role === 'admin' && (
                        <Link
                          href="/lms/admin"
                          className="block px-4 py-3 text-sm text-cyan-700 hover:bg-slate-50 transition font-medium"
                        >
                          System Console
                        </Link>
                      )}
                      <button
                        onClick={handleLogout}
                        className="w-full text-left px-4 py-3 text-sm text-slate-700 hover:bg-slate-50 transition border-t border-slate-100"
                      >
                        Logout
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                {pathname === '/' && (
                  <Link
                    href="/admin/login"
                    className="font-display inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-zinc-300 transition hover:border-[#ef233c]/60 hover:bg-white/10 hover:text-white"
                  >
                    <ShieldCheck className="h-4 w-4" />
                    <span className="hidden sm:inline">Admin Login</span>
                  </Link>
                )}
                <Link
                  href={signInHref}
                  className="font-display inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-zinc-200 transition hover:border-[#ef233c]/60 hover:bg-white/10 hover:text-white"
                >
                  Sign In
                </Link>
                {!isRoomPage && (
                  <Link href="/pricing" className="noir-shimmer-button font-display group inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-white transition-all hover:-translate-y-0.5 active:scale-[0.97]">
                    <span>Pricing</span>
                  </Link>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
      {copyStatus && (
        <div className="fixed top-20 right-4 z-[60] rounded-lg bg-emerald-500/90 px-4 py-2 text-white shadow-lg">
          {copyStatus}
        </div>
      )}
      {isRoomPage && recordingUnavailableReason && !recordingError && (
        <p role="status" className="mx-3 my-2 rounded-lg border border-amber-300/40 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          {recordingUnavailableReason}
        </p>
      )}
      {recordingError && (
        <div className="fixed top-20 right-4 z-[60] rounded-lg bg-red-500/90 px-4 py-2 text-white shadow-lg flex items-center justify-between gap-3">
          <span>{recordingError}</span>
          <button
            onClick={clearRecordingError}
            className="text-white hover:text-red-100 transition"
          >
            ✕
          </button>
        </div>
      )}
      {livestreamError && (
        <div className="fixed top-20 right-4 z-[60] rounded-lg bg-red-500/90 px-4 py-2 text-white shadow-lg flex items-center justify-between gap-3">
          <span>{livestreamError}</span>
          <button
            onClick={clearLivestreamError}
            className="text-white hover:text-red-100 transition"
          >
            ✕
          </button>
        </div>
      )}
      {upgradePrompt && (
        <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="upgrade-title">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#161b22] p-6 text-white shadow-2xl">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-400/15 text-cyan-200">
              <LockKeyhole className="h-5 w-5" />
            </div>
            <h2 id="upgrade-title" className="mt-4 text-xl font-semibold">Upgrade to {upgradePrompt.plan}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              {upgradePrompt.feature} is available on the {upgradePrompt.plan} plan. Upgrade your membership to use this feature.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setUpgradePrompt(null)}
                className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-300 transition hover:bg-white/10 hover:text-white"
              >
                Not now
              </button>
              <Link
                href="/pricing"
                onClick={() => setUpgradePrompt(null)}
                className="rounded-lg bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
              >
                View plans
              </Link>
            </div>
          </div>
        </div>
      )}
      {isWhiteboardOpen && roomMeetingId && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[70]">
          <button
            aria-label="Close whiteboard backdrop"
            onClick={requestWhiteboardClose}
            className="absolute inset-0 h-full w-full cursor-default bg-slate-950/40 backdrop-blur-sm"
          />
          <div className="absolute right-0 top-0 flex h-full w-full max-w-[72rem] flex-col border-l border-white/10 bg-slate-950 shadow-[0_28px_100px_rgba(2,6,23,0.45)] sm:w-[92vw]">
            <Whiteboard
              meetingId={roomMeetingId}
              closeRequestId={whiteboardCloseRequestId}
              onClose={() => setIsWhiteboardOpen(false)}
            />
          </div>
        </div>,
        document.body
      )}
      <YouTubeStreamModal
        isOpen={isYouTubeModalOpen}
        onClose={() => setIsYouTubeModalOpen(false)}
        onSubmit={(streamUrl) => startLivestream(roomMeetingId, streamUrl)}
        loading={livestreamLoading}
      />
    </nav>
  );
}

