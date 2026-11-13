'use client';

import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CaptionOverlay } from '../../../components/CaptionOverlay';
import AIResultsDisplay from '../../../components/AIResultsDisplay';
import TaskList from '../../../components/TaskList';
import Polls from '../../../components/Polls';
import { Loader } from '../../../components/Loader';
import { JitsiMeeting } from '../../../components/JitsiMeeting';
import { useSession } from 'next-auth/react';
import { normalizeJitsiRoomName } from '../../../lib/jitsi-room';
import { startMeetingAccessHeartbeat } from '../../../lib/meeting-access-client';
import { getJitsiToolbarButtons, JITSI_SCREEN_REQUEST_EVENT } from '@/lib/jitsi-features';
import { consumeClientApproval, requestMeetingApproval, waitForMeetingApproval } from '@/lib/meeting-approval-client';
import JitsiPresentationControls from '@/components/JitsiPresentationControls';
import VideoPlaylistPanel from '@/components/VideoPlaylistPanel';
import FileShare from '@/components/FileShare';
import SharedFileNotifications from '@/components/SharedFileNotifications';
import PresenterNotes, { SPEECH_NOTE_PATH } from '@/components/PresenterNotes';
import PresentationWorkspace from '@/components/PresentationWorkspace';
import PresentationPages from '@/components/PresentationPages';
import { getPresentationKind } from '@/lib/shared-file-types';
import { Files, ListVideo, Upload } from 'lucide-react';
import { useRecording } from '@/hooks/useRecording';
import Link from 'next/link';
import { isPlanUpgradeError } from '@/components/UpgradeCallout';

interface MeetingDetails {
  _id: string;
  meetingId: string;
  title: string;
  description?: string;
  hostEmail: string;
  isPrivate: boolean;
  chatEnabled: boolean;
  recordingEnabled: boolean;
  lastSessionAt?: string | null;
  summary?: string;
  keyNotes?: string[];
  keyDecisions?: string[];
  actionItems?: Array<{ item: string; owner?: string }>;
  transcript?: Array<{ text: string; timestamp: number; speakerId: string; speaker: string }>;
  speakerLabels?: Array<{ speakerId: string; name: string; color: string }>;
}

const speakerColors = [
  '#FF6B6B',
  '#4ECDC4',
  '#45B7D1',
  '#FFA502',
  '#95E1D3',
  '#F38181',
  '#AA96DA',
  '#FCBAD3',
];

export default function RoomPage() {
  const params = useParams();
  const router = useRouter();
  const { data: session, status } = useSession();
  const [guestName, setGuestName] = useState('');
  const [nameReady, setNameReady] = useState(false);
  const [participantKey, setParticipantKey] = useState('');
  const [meetingError, setMeetingError] = useState('');
  const [meeting, setMeeting] = useState<MeetingDetails | null>(null);
  const [jwt, setJwt] = useState<string | null>(null);
  const [tokenResolved, setTokenResolved] = useState(false);
  const [sessionEndsAt, setSessionEndsAt] = useState<string | null>(null);
  const [accessGranted, setAccessGranted] = useState(false);
  const [durationNotice, setDurationNotice] = useState('');
  const [showAiResults, setShowAiResults] = useState(false);
  const [aiResults, setAiResults] = useState<any | null>(null);
  const [captionPortalTarget, setCaptionPortalTarget] = useState<HTMLElement | null>(null);
  const [isPlaylistOpen, setIsPlaylistOpen] = useState(false);
  const [isFilesOpen, setIsFilesOpen] = useState(false);
  const [unreadFiles, setUnreadFiles] = useState(0);
  const [sharedPresentation, setSharedPresentation] = useState<{ path: string; name: string; page: number; isPresenter: boolean; updatedAt: string } | null>(null);
  const [presentationError, setPresentationError] = useState('');
  const [showExitOptions, setShowExitOptions] = useState(false);
  const [endingForAll, setEndingForAll] = useState(false);
  const [exitError, setExitError] = useState('');
  const endForAllRef = useRef(false);
  const apiRef = useRef<any>(null);
  const [jitsiApi, setJitsiApi] = useState<any>(null);
  const videoStageRef = useRef<HTMLDivElement | null>(null);
  const presentationPanelRef = useRef<HTMLElement | null>(null);
  const transcriptEntriesRef = useRef<Array<{ text: string; timestamp: number; speakerId: string; speaker: string }>>([]);
  const partialTranscriptRef = useRef<Map<string, { text: string; timestamp: number; speakerId: string; speaker: string }>>(new Map());
  const speakerLabelsRef = useRef<Map<string, { speakerId: string; name: string; color: string }>>(new Map());
  const latestSummaryRef = useRef<any | null>(null);
  const livePersistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const rawMeetingId = params.id as string;
  const meetingId = decodeURIComponent(rawMeetingId || '').trim();
  const jitsiRoomName = normalizeJitsiRoomName(meetingId);
  const displayRoomName = meeting?.title?.trim() || meetingId;
  const userDisplayName = session?.user?.email || guestName || 'Guest';
  const userEmail = session?.user?.email || undefined;
  const fallbackRoute = session?.user?.email ? '/meetings' : '/';
  const isMeetingHost = Boolean(userEmail && meeting?.hostEmail?.toLowerCase() === userEmail.toLowerCase());

  const endMeetingForHost = useCallback(async () => {
    if (!isMeetingHost) throw new Error('Only the host can end the meeting for everyone.');
    const response = await fetch('/api/meeting-end', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ meetingId }),
    });
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      throw new Error(result.error || 'Could not end the meeting. Please try again.');
    }
  }, [isMeetingHost, meetingId]);

  const {
    isRecording,
    canStop,
    status: recordingStatus,
    startRecording,
    stopRecording,
    loading: recordingLoading,
    error: recordingError,
    elapsedTime: recordingElapsedTime,
    clearError: clearRecordingError,
  } = useRecording(meetingId);

  useEffect(() => {
    // Each tab owns its presence. Shared display names/accounts must not let
    // one participant's leave request remove another participant's heartbeat.
    setParticipantKey(`participant:${crypto.randomUUID()}`);
  }, [meetingId]);

  useEffect(() => {
    if (status === 'loading') {
      return;
    }

    if (session?.user?.email) {
      setNameReady(true);
      return;
    }

    let storedName = '';

    try {
      storedName = localStorage.getItem('username') || '';
    } catch {
      storedName = '';
    }

    if (!storedName.trim()) {
      const fallbackName = `Guest-${Math.floor(Math.random() * 1000)}`;
      storedName = fallbackName;

      try {
        localStorage.setItem('username', storedName);
      } catch {
        // Ignore storage failures.
      }
    }

    setGuestName(storedName);
    setNameReady(true);
  }, [session?.user?.email, status]);

  // Verify meeting exists on component mount
  useEffect(() => {
    if (!nameReady || !participantKey) {
      return;
    }

    const verifyMeeting = async () => {
      setTokenResolved(false);
      setAccessGranted(false);
      setSessionEndsAt(null);
      try {
        const controller = new AbortController();
        const requestTimeout = setTimeout(() => controller.abort(), 10000);

        const meetingResponse = await fetch(
          `/api/get-meeting?id=${encodeURIComponent(meetingId)}`,
          {
            signal: controller.signal,
          }
        );
        clearTimeout(requestTimeout);

        if (!meetingResponse.ok) {
          setMeetingError('Meeting not found');
          setTimeout(() => router.push(fallbackRoute), 2000);
          return;
        }

        const meetingData = await meetingResponse.json();
        const loadedMeeting = meetingData.meeting;
        setMeeting(loadedMeeting);

        const accessResponse = await fetch('/api/meeting-access', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ meetingId, participantKey, action: 'join' }),
        });
        const accessData = await accessResponse.json().catch(() => ({}));
        if (!accessResponse.ok) {
          setMeetingError(accessData.error || 'Unable to join this meeting.');
          return;
        }
        if (typeof accessData.documentAccessToken === 'string' && accessData.documentAccessToken) {
          try {
            localStorage.setItem(
              `melanam:meeting-document-access:${meetingId}:${participantKey}`,
              accessData.documentAccessToken,
            );
          } catch {
            // Meeting access still works if browser storage is unavailable.
          }
        }
        if (typeof accessData.approvalToken === 'string' && accessData.approvalToken) {
          try { localStorage.setItem(`melanam:meeting-approval:${meetingId}`, accessData.approvalToken); }
          catch { /* The approval request will explain if browser storage is unavailable. */ }
        } else {
          try { localStorage.removeItem(`melanam:meeting-approval:${meetingId}`); }
          catch { /* Browser storage is optional. */ }
        }
        setSessionEndsAt(accessData.sessionEndsAt || null);
        setAccessGranted(true);

        transcriptEntriesRef.current = Array.isArray(loadedMeeting?.transcript)
          ? loadedMeeting.transcript
              .map((entry: any) => ({
                text: String(entry?.text || '').trim(),
                timestamp: Number(entry?.timestamp || 0),
                speakerId: String(entry?.speakerId || entry?.speaker || 'speaker').trim(),
                speaker: String(entry?.speaker || entry?.speakerId || 'Speaker').trim(),
              }))
              .filter((entry: any) => entry.text.length > 0)
          : [];

        speakerLabelsRef.current = new Map(
          (Array.isArray(loadedMeeting?.speakerLabels) ? loadedMeeting.speakerLabels : [])
            .map((speaker: any, index: number) => {
              const speakerId = String(speaker?.speakerId || speaker?.label || speaker?.id || '').trim();
              const name = String(speaker?.name || speaker?.speaker || speaker?.displayName || speakerId).trim();
              if (!speakerId || !name) {
                return null;
              }

              return [
                speakerId,
                {
                  speakerId,
                  name,
                  color: String(speaker?.color || speakerColors[index % speakerColors.length]),
                },
              ] as const;
            })
            .filter(Boolean) as Array<readonly [string, { speakerId: string; name: string; color: string }]>
        );

        if (loadedMeeting?.summary || loadedMeeting?.transcript?.length) {
          setAiResults(loadedMeeting);
        }

        if (loadedMeeting) {
          const tokenResponse = await fetch(`/api/meeting-token?meetingId=${encodeURIComponent(meetingId)}&name=${encodeURIComponent(userDisplayName)}`);

          if (tokenResponse.ok) {
            const tokenData = await tokenResponse.json();
            setJwt(tokenData.token || null);
          } else {
            setMeetingError('Unable to get secure meeting token');
            return;
          }
        } else {
          setJwt(null);
        }
      } catch (err: any) {
        console.error('Error verifying meeting:', err);
        setMeetingError(err?.name === 'AbortError'
          ? 'The meeting service took too long to respond. Please try joining again.'
          : 'Failed to verify meeting');
      } finally {
        setTokenResolved(true);
      }
    };

    verifyMeeting();
  }, [fallbackRoute, nameReady, meetingId, participantKey, router, userDisplayName]);

  useEffect(() => {
    if (!accessGranted || !meetingId || !participantKey) {
      return;
    }

    const monitor = startMeetingAccessHeartbeat({
      meetingId,
      participantKey,
      onSession: setSessionEndsAt,
      onDenied: (message) => {
        setDurationNotice(message);
        apiRef.current?.executeCommand?.('hangup');
      },
    });
    const checkAccess = () => { void monitor.check(); };
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') checkAccess();
    };
    const leave = () => {
      try {
        localStorage.removeItem(
          `melanam:meeting-document-access:${meetingId}:${participantKey}`,
        );
      } catch {
        // The server-side participant expiry remains authoritative.
      }
      void fetch('/api/meeting-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ meetingId, participantKey, action: 'leave' }),
        keepalive: true,
      }).catch(() => undefined);
    };

    window.addEventListener('online', checkAccess);
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('pagehide', leave);
    return () => {
      monitor.stop();
      window.removeEventListener('online', checkAccess);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('pagehide', leave);
      leave();
    };
  }, [accessGranted, meetingId, participantKey]);

  useEffect(() => {
    if (!sessionEndsAt) return;
    const waitMs = new Date(sessionEndsAt).getTime() - Date.now();
    if (!Number.isFinite(waitMs)) return;

    // Warn ahead of the cutoff; only the server heartbeat may enforce expiry.
    // An incorrect local clock must never disconnect a valid meeting.
    const timer = window.setTimeout(() => {
      setDurationNotice('This room is approaching its plan time limit.');
    }, Math.max(0, waitMs - 10 * 60_000));

    return () => window.clearTimeout(timer);
  }, [sessionEndsAt]);

  const getTranscriptSnapshot = useCallback(() => {
    const finalEntries = transcriptEntriesRef.current;
    if (finalEntries.length > 0) {
      return [...finalEntries].sort((left, right) => left.timestamp - right.timestamp);
    }

    return Array.from(partialTranscriptRef.current.values()).sort(
      (left, right) => left.timestamp - right.timestamp
    );
  }, []);

  const persistAIResults = useCallback(
    async (summaryPayload?: any, options?: { generateSummary?: boolean }) => {
      const transcript = getTranscriptSnapshot();
      const summary = summaryPayload || latestSummaryRef.current;
      const speakerLabels = Array.from(speakerLabelsRef.current.values());

      if (
        !summary?.text &&
        transcript.length === 0 &&
        speakerLabels.length === 0
      ) {
        return null;
      }

      try {
        const response = await fetch('/api/ai/save-results', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            meetingId,
            summary: summary?.text || '',
            keyNotes: summary?.keyNotes || [],
            keyDecisions: summary?.keyDecisions || [],
            actionItems: (summary?.actions || []).map((action: any) => ({
              item: String(action?.description || action?.item || '').trim(),
              owner: action?.assignee || action?.owner,
            })),
            transcript,
            speakerLabels,
            generateSummary: Boolean(options?.generateSummary),
          }),
        });

        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          console.warn('[AI persist] save skipped:', body.error || response.status);
          return null;
        }

        const body = await response.json();
        const savedMeeting = body.meeting || null;
        if (savedMeeting) {
          setMeeting((current) => current ? { ...current, ...savedMeeting } : current);
          setAiResults((current: any) => ({
            ...(current || {}),
            ...savedMeeting,
          }));
        }

        return savedMeeting;
      } catch (error) {
        console.warn('[AI persist] failed to save AI results', error);
        return null;
      }
    },
    [getTranscriptSnapshot, meetingId]
  );

  const scheduleLivePersist = useCallback(
    (delay = 2500) => {
      if (livePersistTimerRef.current) {
        clearTimeout(livePersistTimerRef.current);
      }

      livePersistTimerRef.current = setTimeout(() => {
        livePersistTimerRef.current = null;
        void persistAIResults();
      }, delay);
    },
    [persistAIResults]
  );

  useEffect(() => {
    return () => {
      if (livePersistTimerRef.current) {
        clearTimeout(livePersistTimerRef.current);
        livePersistTimerRef.current = null;
      }
    };
  }, []);

  const handleCaptionPersist = useCallback(
    (caption: { text: string; speaker: string; speakerId: string; final: boolean; timestamp: number }) => {
      const speakerId = caption.speakerId || caption.speaker || 'speaker';
      const speakerName = caption.speaker || speakerId;
      const existingSpeaker = speakerLabelsRef.current.get(speakerId);
      const hasGenericName = !existingSpeaker?.name ||
        existingSpeaker.name === speakerId ||
        /^speaker(?:\s+\S+)?$/i.test(existingSpeaker.name);

      if (!existingSpeaker || (speakerName && hasGenericName)) {
        speakerLabelsRef.current.set(speakerId, {
          speakerId,
          name: speakerName,
          color: existingSpeaker?.color || speakerColors[speakerLabelsRef.current.size % speakerColors.length],
        });
      }

      const entry = {
        text: caption.text,
        timestamp: caption.timestamp,
        speakerId,
        speaker: speakerName,
      };

      partialTranscriptRef.current.set(speakerId, entry);

      if (!caption.final) {
        return;
      }

      const key = `${Math.round(caption.timestamp)}|${speakerId}|${caption.text.toLowerCase()}`;
      const exists = transcriptEntriesRef.current.some((item) => (
        `${Math.round(item.timestamp)}|${item.speakerId}|${item.text.toLowerCase()}` === key
      ));

      if (!exists) {
        transcriptEntriesRef.current.push(entry);
        setAiResults((current: any) => ({
          ...(current || {}),
          meetingId,
          transcript: getTranscriptSnapshot(),
          speakerLabels: Array.from(speakerLabelsRef.current.values()),
        }));
        scheduleLivePersist();
      }
    },
    [getTranscriptSnapshot, meetingId, scheduleLivePersist]
  );

  const handleSummaryPersist = useCallback(
    (summary: any) => {
      latestSummaryRef.current = summary;
      setAiResults((current: any) => ({
        ...(current || {}),
        meetingId,
        summary: summary?.text || current?.summary || '',
        keyNotes: summary?.keyNotes || current?.keyNotes || [],
        keyDecisions: summary?.keyDecisions || current?.keyDecisions || [],
        actionItems: Array.isArray(summary?.actions)
          ? summary.actions.map((action: any) => ({
              item: String(action?.description || action?.item || '').trim(),
              owner: action?.assignee || action?.owner,
            })).filter((action: any) => action.item.length > 0)
          : current?.actionItems || [],
        transcript: getTranscriptSnapshot(),
        speakerLabels: Array.from(speakerLabelsRef.current.values()),
      }));
      void persistAIResults(summary);
    },
    [getTranscriptSnapshot, meetingId, persistAIResults]
  );

  const handleMeetingReadyToClose = useCallback(async () => {
    if (!endForAllRef.current) {
      router.push(fallbackRoute);
      return;
    }
    try {
      const { resolveMeetingAiHttpUrl } = await import('../../../lib/meeting-ai-client');
      const baseUrl = resolveMeetingAiHttpUrl();
      if (baseUrl) {
        const response = await fetch(`${baseUrl}/api/rooms/${encodeURIComponent(meetingId)}/flush`, {
          method: 'POST',
        });
        const body = await response.json().catch(() => ({}));
        const summary = body?.summary;
        if (summary?.summary) {
          const summaryPayload = {
            text: summary.summary,
            keyNotes: summary.keyNotes || [],
            keyDecisions: summary.keyDecisions || [],
            actions: summary.actionItems || summary.actions || [],
            timestamp: summary.timestamp || Date.now(),
            generateSummary: true,
          };
          latestSummaryRef.current = summaryPayload;
        }
      }
    } catch (error) {
      console.warn('[AI persist] summary flush failed', error);
    } finally {
      if (livePersistTimerRef.current) {
        clearTimeout(livePersistTimerRef.current);
        livePersistTimerRef.current = null;
      }
      await persistAIResults(undefined, { generateSummary: true });
      router.push(fallbackRoute);
    }
  }, [fallbackRoute, meetingId, persistAIResults, router]);

  // Open AI results panel when caption overlay dispatches event
  useEffect(() => {
    const handler = async (e: any) => {
      try {
        const detailMeetingId = e?.detail?.meetingId || meetingId;
        if (!detailMeetingId) return;

        const shouldAutoOpen = Boolean(e?.detail?.autoOpen);
        const liveSummary = e?.detail?.summary || null;
        const liveActionItems = Array.isArray(liveSummary?.actions)
          ? liveSummary.actions.map((action: any) => ({
              item: String(action?.description || action?.item || '').trim(),
              owner: action?.assignee || action?.owner ? String(action.assignee || action.owner).trim() : undefined,
            })).filter((action: any) => action.item.length > 0)
          : [];

        // Fetch meeting details (includes summary, keyDecisions, actionItems, transcript)
        const resp = await fetch(`/api/get-meeting?id=${encodeURIComponent(detailMeetingId)}`);
        let m = null;
        if (!resp.ok) {
          console.warn('[AI panel] failed to fetch meeting data');
        } else {
          const body = await resp.json();
          m = body.meeting || null;
        }

        setAiResults((current: any) => ({
          ...(m || current || {}),
          meetingId: detailMeetingId,
          summary: liveSummary?.text || m?.summary || current?.summary || '',
          keyNotes: Array.isArray(liveSummary?.keyNotes)
            ? liveSummary.keyNotes
            : m?.keyNotes || current?.keyNotes || [],
          keyDecisions: Array.isArray(liveSummary?.keyDecisions)
            ? liveSummary.keyDecisions
            : m?.keyDecisions || current?.keyDecisions || [],
          actionItems: liveActionItems.length > 0
            ? liveActionItems
            : m?.actionItems || current?.actionItems || [],
          transcript: m?.transcript || current?.transcript || [],
          speakerLabels: m?.speakerLabels || current?.speakerLabels || [],
        }));

        if (shouldAutoOpen) {
          setShowAiResults(true);
        }
      } catch (err) {
        console.error('[AI panel] error opening AI results', err);
      }
    };

    window.addEventListener('open-ai-summary', handler as EventListener);
    return () => window.removeEventListener('open-ai-summary', handler as EventListener);
  }, [meetingId]);

  const handleApiReady = useCallback((api: any) => {
    apiRef.current = api;
    setJitsiApi(api);

    if (displayRoomName) {
      api.executeCommand?.('subject', displayRoomName);
    }

    api.addEventListener('videoConferenceJoined', () => {
      console.log('[meeting] video conference joined');
    });
  }, [displayRoomName]);

  useEffect(() => {
    if (!apiRef.current || !displayRoomName) {
      return;
    }

    apiRef.current.executeCommand?.('subject', displayRoomName);
  }, [displayRoomName]);

  const handleVideoStageRef = useCallback((node: HTMLDivElement | null) => {
    videoStageRef.current = node;
    setCaptionPortalTarget(node);
  }, []);

  const handlePlaylistRequested = useCallback(() => {
    setIsPlaylistOpen(true);
    setIsFilesOpen(false);
  }, []);

  useEffect(() => {
    if (!isPlaylistOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsPlaylistOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [isPlaylistOpen]);

  const handleRecordingRequested = useCallback(() => {
    if (recordingLoading) return;
    if (recordingStatus === 'recording' && canStop) {
      void stopRecording(meetingId);
    } else if (recordingStatus === 'idle' || recordingStatus === 'ready' || recordingStatus === 'failed') {
      void startRecording(meetingId);
    }
  }, [canStop, meetingId, recordingLoading, recordingStatus, startRecording, stopRecording]);

  const handleHangupRequested = useCallback(() => {
    if (isMeetingHost) {
      setExitError('');
      setShowExitOptions(true);
    } else {
      apiRef.current?.executeCommand?.('hangup');
    }
  }, [isMeetingHost]);

  const handleEndForAll = useCallback(async () => {
    if (endingForAll) return;
    setEndingForAll(true);
    setExitError('');
    try {
      await endMeetingForHost();
      endForAllRef.current = true;
      setShowExitOptions(false);
      apiRef.current?.executeCommand?.('hangup');
    } catch (error) {
      setExitError(error instanceof Error ? error.message : 'Could not end the meeting. Please try again.');
    } finally {
      setEndingForAll(false);
    }
  }, [endMeetingForHost, endingForAll]);

  const handleScreenRequested = useCallback(async () => {
    try {
      if (!isMeetingHost) {
        setPresentationError('Waiting for the host to approve screen sharing.');
        const approvalId = await requestMeetingApproval(meetingId, 'screen', {}, userEmail || guestName);
        await waitForMeetingApproval(meetingId, approvalId);
        await consumeClientApproval(meetingId, approvalId, 'screen');
      }
      setPresentationError('');
      apiRef.current?.executeCommand?.('setTileView', false);
      apiRef.current?.executeCommand?.('toggleShareScreen', { enable: true });
    } catch (error: any) { setPresentationError(error?.message || 'Could not request screen sharing.'); }
  }, [guestName, isMeetingHost, meetingId, userEmail]);

  useEffect(() => {
    const request = (event: Event) => {
      if ((event as CustomEvent).detail?.meetingId !== meetingId) return;
      event.preventDefault();
      void handleScreenRequested();
    };
    window.addEventListener(JITSI_SCREEN_REQUEST_EVENT, request);
    return () => window.removeEventListener(JITSI_SCREEN_REQUEST_EVENT, request);
  }, [handleScreenRequested, meetingId]);

  const updatePresentation = useCallback(async (path: string | null, approvalId?: string) => {
    const token = localStorage.getItem(`melanam:meeting-document-access:${meetingId}:${participantKey}`);
    if (!token) throw new Error('Your meeting document access has expired. Rejoin and try again.');
    const response = await fetch('/api/meeting-presentation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ meetingId, path, approvalId }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not update the presentation.');
    setSharedPresentation(result.presentation);
    setPresentationError('');
  }, [meetingId, participantKey]);

  const handleDocumentRequested = useCallback(async (path: string, approvalId?: string) => {
    try {
      await updatePresentation(path, approvalId);
    } catch (error) {
      setPresentationError(error instanceof Error ? error.message : 'Could not present the document.');
    }
  }, [updatePresentation]);

  const changePresentationPage = useCallback(async (page: number) => {
    if (!sharedPresentation?.isPresenter) throw new Error('Only the presenter can change pages.');
    const token = localStorage.getItem(`melanam:meeting-document-access:${meetingId}:${participantKey}`);
    if (!token) throw new Error('Your meeting document access has expired.');
    const response = await fetch('/api/meeting-presentation', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ meetingId, path: sharedPresentation.path, page }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not change pages.');
    setSharedPresentation(result.presentation);
  }, [meetingId, participantKey, sharedPresentation?.path, sharedPresentation?.isPresenter]);

  useEffect(() => {
    if (!accessGranted || !participantKey) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const refresh = async () => {
      try {
        const token = localStorage.getItem(`melanam:meeting-document-access:${meetingId}:${participantKey}`);
        if (!token) return;
        const response = await fetch(`/api/meeting-presentation?meetingId=${encodeURIComponent(meetingId)}`, {
          headers: { Authorization: `Bearer ${token}` }, cache: 'no-store',
        });
        if (!response.ok) return;
        const result = await response.json();
        if (!stopped) setSharedPresentation(current =>
          current?.path === result.presentation?.path && current?.updatedAt === result.presentation?.updatedAt && current?.page === result.presentation?.page
            ? current : result.presentation || null);
      } catch { /* Keep the current viewer during a temporary connection loss. */ }
      finally { if (!stopped) timer = setTimeout(refresh, 3000); }
    };
    void refresh();
    return () => { stopped = true; clearTimeout(timer); };
  }, [accessGranted, meetingId, participantKey]);

  const presentationUrl = sharedPresentation ? `/present?${new URLSearchParams({
    path: sharedPresentation.path,
    name: sharedPresentation.name,
    meetingId,
    participantKey,
    embedded: '1',
  })}` : '';

  useEffect(() => {
    if (sharedPresentation) presentationPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [sharedPresentation?.updatedAt]);

  const recordingEnabled = meeting?.recordingEnabled !== false;

  const roomToolbarButtons = useMemo(
    () => [...getJitsiToolbarButtons(meeting?.chatEnabled !== false, recordingEnabled && isMeetingHost).filter(button => isMeetingHost || button !== 'security'), 'videoquality'],
    [meeting?.chatEnabled, recordingEnabled, isMeetingHost]
  );
  const canMountJitsi = Boolean(
    meeting &&
    tokenResolved &&
    accessGranted &&
    (!meeting.isPrivate || jwt)
  );

  if ((status === 'loading' && !meeting) || !nameReady) {
    return <Loader />;
  }

  if (meetingError) {
    return (
      <div className="meeting-room min-h-screen flex items-center justify-center bg-[var(--app-bg)]">
        <div className="text-center">
          <p className="text-red-400 text-lg mb-2">{meetingError}</p>
          <p className="text-zinc-400 text-sm mb-4">
            Meeting ID: {meetingId}
          </p>
          <button
            onClick={() => router.push(fallbackRoute)}
            className="px-4 py-2 bg-zinc-700 text-white rounded-lg hover:bg-zinc-700 transition"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="meeting-room mx-auto w-full max-w-[110rem] px-3 pt-6 text-zinc-100 sm:px-5">
      {!userEmail && <p className="mb-3 text-sm text-zinc-300">To receive shared recordings in your recordings, <a className="text-zinc-300 underline" href={`/sign-in?callbackUrl=${encodeURIComponent(`/room/${meetingId}`)}`}>sign in and rejoin</a> before the host ends the meeting.</p>}
      <JitsiPresentationControls
        key={meetingId}
        api={jitsiApi}
        meetingId={meetingId}
        participantKey={participantKey}
        onDocumentRequested={handleDocumentRequested}
        onPlaylistRequested={handlePlaylistRequested}
        onRecordingRequested={handleRecordingRequested}
        onHangupRequested={handleHangupRequested}
        onScreenRequested={handleScreenRequested}
      />
      <SharedFileNotifications meetingId={meetingId} onUnreadChange={setUnreadFiles} />
      <div className="mb-3 flex justify-end">
        <button type="button" onClick={() => { setIsFilesOpen(true); setIsPlaylistOpen(false); window.dispatchEvent(new Event('room:open-files')); window.dispatchEvent(new Event('room:upload-file')); }} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-500"><Upload className="h-4 w-4" />Upload File</button>
      </div>
      {showExitOptions && isMeetingHost && <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/70 p-4" onMouseDown={event => { if (event.target === event.currentTarget && !endingForAll) setShowExitOptions(false); }}>
        <div role="dialog" aria-modal="true" aria-labelledby="meeting-exit-title" className="w-full max-w-sm rounded-2xl border border-zinc-700 bg-zinc-950 p-5 shadow-2xl">
          <h2 id="meeting-exit-title" className="text-lg font-semibold text-white">Leave this meeting?</h2>
          <p className="mt-2 text-sm text-zinc-400">You can leave while everyone else stays, or end the meeting for all participants.</p>
          {isRecording && <p className="mt-2 text-xs text-amber-300">The active recording continues if you leave the meeting open.</p>}
          {exitError && <p role="alert" className="mt-3 text-sm text-rose-300">{exitError}</p>}
          <div className="mt-5 grid gap-2">
            <button type="button" autoFocus disabled={endingForAll} onClick={() => { setShowExitOptions(false); apiRef.current?.executeCommand?.('hangup'); }} className="rounded-lg border border-zinc-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-50">Leave meeting</button>
            <button type="button" disabled={endingForAll} onClick={() => void handleEndForAll()} className="rounded-lg bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-500 disabled:opacity-50">{endingForAll ? 'Ending meeting…' : 'End meeting for all'}</button>
            <button type="button" disabled={endingForAll} onClick={() => setShowExitOptions(false)} className="rounded-lg px-4 py-2 text-sm text-zinc-400 hover:text-white disabled:opacity-50">Cancel</button>
          </div>
        </div>
      </div>}
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,19rem)_minmax(0,1fr)_minmax(0,19rem)]">
        <aside id="room-video-playlist" aria-label="Video playlist sidebar" className={`${isPlaylistOpen ? 'block' : 'hidden'} order-3 min-w-0 xl:order-none xl:block`}>
          <VideoPlaylistPanel meetingId={meetingId} addedBy={userEmail || guestName} isHost={isMeetingHost} className="room-glass-panel room-side-scroll" onClose={() => setIsPlaylistOpen(false)} />
        </aside>
      <div className="meeting-stage relative order-1 h-[clamp(24rem,68dvh,40rem)] min-w-0 w-full overflow-hidden rounded-2xl border border-white/10 bg-zinc-950 shadow-[0_24px_70px_rgba(0,0,0,.35)] xl:order-none">
        <div
          ref={handleVideoStageRef}
          className="relative h-full w-full overflow-hidden bg-zinc-950"
        >
          {canMountJitsi ? (
            <>
              <JitsiMeeting
                roomName={jitsiRoomName}
                displayName={userDisplayName}
                userEmail={userEmail}
                captionMeetingId={meetingId}
                jwt={jwt || undefined}
                height="100%"
                prejoinPageEnabled
                // A bare boolean JSX prop is `true`. Passing these without a
                // value made every participant join with both microphone and
                // camera off, which looked exactly like a broken call.
                startWithAudioMuted={false}
                startWithVideoMuted={false}
                onApiReady={handleApiReady}
                onReadyToClose={handleMeetingReadyToClose}
                toolbarButtons={roomToolbarButtons}
                sharedVideoPlaylist
                recordingEnabled={recordingEnabled}
                controlledHangup
                controlledScreenShare
                isHost={isMeetingHost}
              />
              <CaptionOverlay
                meetingId={meetingId}
                portalTarget={captionPortalTarget}
                onCaption={handleCaptionPersist}
                onSummary={handleSummaryPersist}
              />
            </>
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-zinc-950 text-sm font-semibold text-zinc-300">
              Preparing meeting...
            </div>
          )}
        </div>
        {durationNotice && (
          <div className="absolute inset-x-3 top-3 z-50 flex flex-wrap items-center justify-center gap-2 rounded-lg border border-amber-300/50 bg-amber-100/95 px-3 py-2 text-center text-sm font-semibold text-amber-950 shadow-lg">
            <span>{durationNotice}</span><Link href="/pricing" className="rounded bg-amber-900 px-2 py-1 text-white hover:bg-amber-800">View higher plans</Link>
          </div>
        )}
        {!durationNotice && (isRecording || recordingStatus === 'starting' || recordingStatus === 'processing') && (
          <div className="absolute left-3 top-3 z-50 flex items-center gap-2 rounded-full border border-rose-500/40 bg-zinc-950/90 px-3 py-1.5 text-xs font-semibold text-rose-200 shadow-lg">
            <span className={`h-2 w-2 rounded-full ${isRecording ? 'animate-pulse bg-rose-500' : 'bg-amber-400'}`} />
            {recordingStatus === 'starting'
              ? 'Starting recording…'
              : recordingStatus === 'processing'
                ? 'Processing recording…'
                : `Recording ${recordingElapsedTime}`}
          </div>
        )}
        {recordingError && (
          <div role="alert" className="absolute inset-x-3 bottom-3 z-50 flex items-center justify-between gap-3 rounded-lg border border-rose-500/40 bg-rose-950/95 px-3 py-2 text-sm text-rose-100 shadow-lg">
            <span>{recordingError}{isPlanUpgradeError(recordingError) && <> <Link href="/pricing" className="font-semibold underline underline-offset-2">View higher plans</Link></>}</span>
            <button type="button" onClick={clearRecordingError} className="text-rose-200 transition hover:text-white" aria-label="Dismiss recording error">
              ✕
            </button>
          </div>
        )}
        {showAiResults && aiResults && (
          <div className="fixed right-0 top-16 z-60 h-[calc(100vh-4rem)] w-full max-w-lg overflow-auto border-l border-zinc-800 bg-zinc-900/95 shadow-2xl dark:border-zinc-600 dark:bg-zinc-900/95">
            <div className="flex items-center justify-between border-b border-zinc-800 p-4 dark:border-zinc-600">
              <h3 className="text-lg font-semibold">AI Meeting Results</h3>
              <div className="flex items-center gap-2">
                <button onClick={() => setShowAiResults(false)} className="text-sm text-zinc-400 dark:text-zinc-300">Close</button>
              </div>
            </div>
            <div className="p-4">
              <AIResultsDisplay
                meetingId={meetingId}
                summary={aiResults?.summary}
                keyNotes={aiResults?.keyNotes || []}
                keyDecisions={aiResults?.keyDecisions || []}
                actionItems={aiResults?.actionItems || []}
                transcript={aiResults?.transcript || []}
                speakerLabels={aiResults?.speakerLabels || []}
              />
              <div className="mt-6">
                <h4 className="mb-2 text-sm font-medium">Tasks from this meeting</h4>
                <TaskList meetingId={meetingId} />
              </div>
              <div className="mt-6">
                <h4 className="mb-2 text-sm font-medium">Live Polls</h4>
                <Polls meetingId={meetingId} />
              </div>
            </div>
          </div>
        )}
      </div>
        <div className="order-2 grid grid-cols-2 gap-2 xl:hidden">
          <button type="button" onClick={() => { setIsPlaylistOpen(open => !open); setIsFilesOpen(false); }} aria-expanded={isPlaylistOpen} aria-controls="room-video-playlist" className={`button-secondary min-w-0 gap-2 px-2 text-xs ${isPlaylistOpen ? 'border-zinc-500 bg-zinc-800 text-white' : 'border-zinc-700 bg-zinc-900/75'}`}><ListVideo className="h-4 w-4 shrink-0" /> Video playlist</button>
          <button type="button" onClick={() => { if (!isFilesOpen) window.dispatchEvent(new Event('room:open-files')); setIsFilesOpen(open => !open); setIsPlaylistOpen(false); }} aria-expanded={isFilesOpen} aria-controls="room-shared-files" className={`button-secondary relative min-w-0 gap-2 px-2 text-xs ${isFilesOpen ? 'border-zinc-500 bg-zinc-800 text-white' : 'border-zinc-700 bg-zinc-900/75'}`}><Files className="h-4 w-4 shrink-0" /> Shared files{unreadFiles > 0 && !isFilesOpen && <span aria-label={`${unreadFiles} unread shared files`} className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-rose-400" />}</button>
        </div>
        <aside id="room-shared-files" aria-label="Shared files sidebar" className={`${isFilesOpen ? 'block' : 'hidden'} order-4 min-w-0 xl:order-none xl:block`}>
          <FileShare meetingId={meetingId} presentationEnabled participantKey={participantKey} noteOwner={userEmail || guestName} isHost={isMeetingHost} title="Shared files" showHeader={false} className="room-glass-panel room-side-scroll" />
        </aside>
      </div>
      {presentationError && <p role="alert" className="mx-auto mb-3 max-w-5xl rounded-lg border border-rose-500/40 bg-rose-950 px-4 py-2 text-sm text-rose-100">{presentationError}</p>}
      {sharedPresentation && (
        <section ref={presentationPanelRef} aria-label="Shared presentation" className="mx-auto mb-6 mt-6 flex w-full max-w-6xl flex-col overflow-hidden rounded-lg border border-zinc-700 bg-zinc-950">
          <div className="flex items-center justify-between gap-3 border-b border-zinc-800 px-4 py-2 text-sm">
            <span className="min-w-0 truncate font-medium">Presenting: {sharedPresentation.name}</span>
            {isMeetingHost && <div className="flex shrink-0 items-center gap-2">
              {getPresentationKind(sharedPresentation.name) === 'slides' && <a href={presentationUrl.replace('embedded=1', 'embedded=0')} target="_blank" rel="noreferrer" className="rounded-lg bg-sky-900 px-3 py-1.5 hover:bg-sky-800">Open in OmniEdit</a>}
              <button type="button" onClick={() => { void updatePresentation(null).catch(error => setPresentationError(error.message)); }} className="rounded-lg bg-zinc-800 px-3 py-1.5 hover:bg-zinc-700">Stop presenting</button>
            </div>}
          </div>
          <PresentationWorkspace notes={sharedPresentation.isPresenter ? <PresenterNotes meetingId={meetingId} filePath={SPEECH_NOTE_PATH} owner={userEmail || guestName} sidePanel /> : undefined}>
            {['pdf', 'slides'].includes(getPresentationKind(sharedPresentation.name) || '') ?
              <PresentationPages meetingId={meetingId} path={sharedPresentation.path} participantKey={participantKey} page={sharedPresentation.page || 1} isPresenter={sharedPresentation.isPresenter} onPageChange={changePresentationPage} /> :
              <iframe key={`${sharedPresentation.path}:${sharedPresentation.updatedAt}`} title={`Shared presentation: ${sharedPresentation.name}`} src={presentationUrl} className="h-full w-full border-0 bg-white" />}
          </PresentationWorkspace>
        </section>
      )}
    </div>
  );
}
