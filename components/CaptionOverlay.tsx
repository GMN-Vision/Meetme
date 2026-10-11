'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { resolveMeetingAiHttpUrl, resolveMeetingAiSocketUrl, resolveMeetingAiSocketUrls } from '@/lib/meeting-ai-client';

/**
 * Caption data model matching Google Meet / Zoom
 */
type Caption = {
  id: string;
  speakerId: string;
  speakerName: string;
  text: string;
  isPartial: boolean;
  isFinal: boolean;
  createdAt: number;
  expiresAt?: number;
  opacity?: number;
};

type SummaryAction = {
  description?: string;
  item?: string;
  assignee?: string;
  owner?: string;
};

type CaptionMessage = {
  type?: 'caption' | 'connected' | 'cleared' | 'summary';
  summary?: string | {
    summary?: string;
    text?: string;
    keyNotes?: string[];
    keyDecisions?: string[];
    actionItems?: SummaryAction[];
    actions?: SummaryAction[];
  };
  keyNotes?: string[];
  keyDecisions?: string[];
  actionItems?: SummaryAction[];
  actions?: SummaryAction[];
  text?: string;
  speaker?: string;
  speakerId?: string;
  final?: boolean;
  timestamp?: number;
};

type SummaryCard = {
  text: string;
  keyNotes: string[];
  keyDecisions: string[];
  actions: Array<{ description: string; assignee?: string }>;
  timestamp: number;
};

const PARTIAL_IDLE_MS = 4200;
const FINAL_VISIBLE_MS = 2600;
const FADE_WINDOW_MS = 1200;

interface CaptionOverlayProps {
  meetingId: string;
  className?: string;
  portalTarget?: HTMLElement | null;
  onCaption?: (caption: {
    text: string;
    speaker: string;
    speakerId: string;
    final: boolean;
    timestamp: number;
  }) => void;
  onSummary?: (summary: SummaryCard) => void;
}

/**
 * Caption reducer: implements Google Meet/Zoom behavior exactly
 * 
 * Rules:
 * - Max 2 captions visible (active + 1 previous final)
 * - Partial updates REPLACE same speaker's active caption
 * - New speaker creates new caption
 * - Final captions lock in queue, eventually removed
 */
function captionReducer(state: Caption[], action: any): Caption[] {
  const now = Date.now();

  // Remove expired captions
  let queue = state.filter(c => !c.expiresAt || c.expiresAt > now);

  switch (action.type) {
    case 'RECEIVE_CAPTION': {
      const { speakerId, speakerName, text, isFinal, timestamp } = action.payload;

      // Ignore empty or whitespace-only text
      if (!text || !text.trim()) {
        return queue;
      }

      const lastCaption = queue.length > 0 ? queue[queue.length - 1] : null;
      const textHasRegressed = lastCaption?.speakerId === speakerId && 
                               lastCaption?.text && 
                               text.length < lastCaption.text.length &&
                               !lastCaption.text.startsWith(text);

      // Ignore text regression (unless it's a final update)
      if (textHasRegressed && !isFinal) {
        return queue;
      }

      // Same speaker, same partial: deduplicate
      if (lastCaption && 
          lastCaption.speakerId === speakerId && 
          !lastCaption.isFinal &&
          lastCaption.text === text) {
        return queue.map((c, i) =>
          i === queue.length - 1
            ? {
                ...c,
                expiresAt: now + PARTIAL_IDLE_MS,
                opacity: 1,
              }
            : c
        );
      }

      if (lastCaption && lastCaption.speakerId === speakerId && !lastCaption.isFinal) {
        // Same speaker updating partial → replace text
        return queue.map((c, i) =>
          i === queue.length - 1
            ? {
                ...c,
                text,
                isPartial: !isFinal,
                isFinal: isFinal || c.isFinal,
                expiresAt: now + (isFinal ? FINAL_VISIBLE_MS : PARTIAL_IDLE_MS),
                opacity: 1,
              }
            : c
        );
      } else {
        // New speaker or first caption → enqueue new bubble
        // If we already have 2 non-expired captions, remove oldest
        let newQueue = queue.slice(-(2 - 1)); // Keep max 1 before adding new

        const captionId = `${speakerId}-${timestamp || now}-${Math.random()}`;
        newQueue.push({
          id: captionId,
          speakerId,
          speakerName,
          text,
          isPartial: !isFinal,
          isFinal: isFinal || false,
          createdAt: now,
          expiresAt: now + (isFinal ? FINAL_VISIBLE_MS : PARTIAL_IDLE_MS),
          opacity: 1,
        });

        return newQueue;
      }
    }

    case 'FINALIZE_SPEAKER': {
      // If a different speaker starts talking, finalize previous speaker's partial
      const { speakerId } = action.payload;
      const lastCaption = queue.length > 0 ? queue[queue.length - 1] : null;

      if (lastCaption && lastCaption.speakerId !== speakerId && !lastCaption.isFinal) {
        return queue.map((c, i) =>
          i === queue.length - 1
            ? {
                ...c,
                isFinal: true,
                isPartial: false,
                expiresAt: now + FINAL_VISIBLE_MS,
              }
            : c
        );
      }

      return queue;
    }

    case 'TICK': {
      // Update fade opacity based on time until expiry
      return queue
        .filter(c => !c.expiresAt || c.expiresAt > now)
        .map(c => {
          const remaining = c.expiresAt - now;
          const opacity = Math.max(0, Math.min(1, remaining / FADE_WINDOW_MS));

          return { ...c, opacity };
        });
    }

    case 'CLEAR':
      return [];

    default:
      return queue;
  }
}

export function CaptionOverlay({ meetingId, portalTarget, onCaption, onSummary }: CaptionOverlayProps) {
  const [connected, setConnected] = useState(false);
  const [captions, setCaptions] = useState<Caption[]>([]);
  // opt-in debug mode via URL param ?capdebug=1 or ?captions_debug=1
  const debugMode = typeof window !== 'undefined' && (
    new URLSearchParams(window.location.search).get('capdebug') === '1' ||
    new URLSearchParams(window.location.search).get('captions_debug') === '1'
  );
  const captionsEnabled = true;
  const lastSpeakerIdRef = useRef<string | null>(null);

  const socketUrl = useMemo(() => resolveMeetingAiSocketUrl(meetingId), [meetingId]);
  const socketUrlCandidates = useMemo(() => resolveMeetingAiSocketUrls(meetingId), [meetingId]);
  const [retryTick, setRetryTick] = useState(0);
  const attemptRef = useRef(0);
  const portalElRef = useRef<HTMLElement | null>(null);
  const captionDispatchRef = useRef<{ dispatch: (action: any) => void } | null>(null);
  const lastProcessedIdRef = useRef<string | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const successfulSocketUrlRef = useRef<string | null>(null);
  const lastHistoryTimestampRef = useRef(0);
  const historyPollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Initialize caption dispatcher
  useEffect(() => {
    const dispatcher = {
      dispatch(action: any) {
        setCaptions(prev => captionReducer(prev, action));
      },
    };
    captionDispatchRef.current = dispatcher;
  }, []);

  const processIncomingCaptionMessage = (payload: CaptionMessage) => {
    // Handle summary broadcasts from the server
    if (payload.type === 'summary') {
      try {
        const summaryObj = payload.summary && typeof payload.summary === 'object' ? payload.summary : null;
        const summaryText = typeof payload.summary === 'string'
          ? payload.summary
          : summaryObj?.summary || summaryObj?.text || '';
        const normalizeStringArray = (items: unknown) => Array.isArray(items)
          ? items.map((item) => String(item || '').trim()).filter(Boolean)
          : [];
        const keyNotes = normalizeStringArray(payload.keyNotes || summaryObj?.keyNotes);
        const keyDecisions = normalizeStringArray(payload.keyDecisions || summaryObj?.keyDecisions);
        const rawActions = Array.isArray(payload.actionItems)
          ? payload.actionItems
          : Array.isArray(payload.actions)
            ? payload.actions
            : Array.isArray(summaryObj?.actionItems)
              ? summaryObj.actionItems
              : Array.isArray(summaryObj?.actions)
                ? summaryObj.actions
                : [];
        const actions = rawActions
          .map((item) => ({
            description: String(item?.description || item?.item || '').trim(),
            assignee: item?.assignee || item?.owner ? String(item.assignee || item.owner).trim() : undefined,
          }))
          .filter((item) => item.description.length > 0)
          .slice(0, 4);

        const normalizedText = String(summaryText || '').trim();
        if (normalizedText && typeof window !== 'undefined') {
          const summaryPayload = {
            text: normalizedText,
            keyNotes,
            keyDecisions,
            actions,
            timestamp: Date.now(),
          };

          onSummary?.(summaryPayload);

          window.dispatchEvent(
            new CustomEvent('open-ai-summary', {
              detail: {
                meetingId,
                summary: summaryPayload,
                autoOpen: false,
              },
            })
          );
        }
      } catch (err) {
        console.error('[captions] Error processing summary payload', err);
      }
      return;
    }

    if (payload.type === 'connected') {
      console.log('[captions] ✅ Server confirmed connection for:', meetingId);
      return;
    }

    if (payload.type === 'cleared') {
      console.log('[captions] 🗑️  Captions cleared');
      lastSpeakerIdRef.current = null;
      lastProcessedIdRef.current = null;
      lastHistoryTimestampRef.current = 0;
      captionDispatchRef.current?.dispatch({ type: 'CLEAR' });
      return;
    }

    if (payload.type !== 'caption') {
      console.log('[captions] 🔹 Received message type:', payload.type);
      return;
    }

    if (!payload.text || !String(payload.text).trim()) {
      console.warn('[captions] ⚠️  Invalid caption (missing text):', payload);
      return;
    }

    const speakerId = payload.speakerId || payload.speaker || 'speaker';
    const speakerName = payload.speaker || (speakerId === 'speaker' ? 'Speaker' : `Speaker ${speakerId}`);
    const captionTimestamp = typeof payload.timestamp === 'number' ? payload.timestamp : Date.now();
    const eventId = `${speakerId}-${captionTimestamp}-${payload.text}`;

    if (lastProcessedIdRef.current === eventId) {
      console.log('[captions] ℹ️  Ignoring duplicate caption');
      return;
    }

    lastProcessedIdRef.current = eventId;
    lastHistoryTimestampRef.current = Math.max(lastHistoryTimestampRef.current, captionTimestamp);

    onCaption?.({
      text: String(payload.text || '').trim(),
      speaker: speakerName,
      speakerId,
      final: Boolean(payload.final),
      timestamp: captionTimestamp,
    });

    if (lastSpeakerIdRef.current !== null && lastSpeakerIdRef.current !== speakerId) {
      captionDispatchRef.current?.dispatch({
        type: 'FINALIZE_SPEAKER',
        payload: { speakerId },
      });
    }

    lastSpeakerIdRef.current = speakerId;

    const label = payload.final ? '✅ FINAL' : '🔹 PARTIAL';
    console.log(`[captions] ${label} caption: "${String(payload.text).slice(0, 60)}" from ${speakerName}`);

    captionDispatchRef.current?.dispatch({
      type: 'RECEIVE_CAPTION',
      payload: {
        speakerId,
        speakerName,
        text: payload.text,
        isFinal: payload.final || false,
        timestamp: captionTimestamp,
      },
    });
  };

  // WebSocket connection
  useEffect(() => {
    if (!captionsEnabled) {
      return;
    }

    let disposed = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let candidateIndex = 0;

    const candidates = successfulSocketUrlRef.current
      ? [successfulSocketUrlRef.current, ...socketUrlCandidates.filter((url) => url !== successfulSocketUrlRef.current)]
      : socketUrlCandidates;

    const clearRetryTimer = () => {
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
    };

    const scheduleReconnect = () => {
      if (disposed) {
        return;
      }

      candidateIndex += 1;

      if (candidateIndex >= candidates.length) {
        candidateIndex = 0;
        const attempt = ++attemptRef.current;
        const delay = Math.min(30000, 1000 * 2 ** (attempt - 1));
        retryTimer = setTimeout(() => setRetryTick((tick) => tick + 1), delay);
        return;
      }

      retryTimer = setTimeout(connect, 250);
    };

    const connect = () => {
      if (disposed || candidates.length === 0) {
        return;
      }

      const currentUrl = candidates[Math.min(candidateIndex, candidates.length - 1)];
      if (!currentUrl) {
        return;
      }

      const socket = new WebSocket(currentUrl);
      socketRef.current = socket;

      const markFailureAndRetry = () => {
        if (disposed) {
          return;
        }

        setConnected(false);
        scheduleReconnect();
      };

      socket.addEventListener('open', () => {
        successfulSocketUrlRef.current = currentUrl;
        console.log('[captions] ✅ Connected to:', currentUrl);
        if (disposed) return;

        attemptRef.current = 0;
        setConnected(true);
        socket.send(JSON.stringify({ type: 'join', meetingId }));
        console.log('[captions] 📤 Sent join message for:', meetingId);
      });

      socket.addEventListener('message', (event) => {
        try {
          const payload = JSON.parse(event.data) as CaptionMessage;
          processIncomingCaptionMessage(payload);
        } catch (err) {
          console.error('[captions] Parse error:', err);
        }
      });

      socket.addEventListener('close', () => {
        console.log('[captions] ❌ Disconnected from server');
        markFailureAndRetry();
      });

      socket.addEventListener('error', (e) => {
        console.error('[captions] ❌ WebSocket error:', e);
        markFailureAndRetry();
      });
    };

    connect();

    return () => {
      disposed = true;
      const activeSocket = socketRef.current;
      socketRef.current = null;
      clearRetryTimer();
      try { activeSocket?.close(); } catch (_) {}
    };
  }, [meetingId, socketUrlCandidates, retryTick, captionsEnabled]);

  useEffect(() => {
    if (!captionsEnabled) {
      return;
    }

    let disposed = false;

    const pollHistory = async () => {
      try {
        const baseUrl = resolveMeetingAiHttpUrl();
        if (!baseUrl) {
          return;
        }

        const since = lastHistoryTimestampRef.current > 0 ? `?since=${lastHistoryTimestampRef.current}` : '';
        const response = await fetch(`${baseUrl}/api/rooms/${encodeURIComponent(meetingId)}/captions${since}`, {
          cache: 'no-store',
        });

        if (!response.ok) {
          return;
        }

        const data = await response.json();
        const history = Array.isArray(data?.captions) ? data.captions : [];

        for (const item of history) {
          if (disposed) {
            return;
          }

          processIncomingCaptionMessage(item);
        }
      } catch {
        // polling fallback is best-effort only
      }
    };

    pollHistory();
    const timer = setInterval(pollHistory, 3000);
    historyPollTimerRef.current = timer;

    return () => {
      disposed = true;
      clearInterval(timer);
      if (historyPollTimerRef.current === timer) {
        historyPollTimerRef.current = null;
      }
    };
  }, [captionsEnabled, meetingId]);

  // Auto-fade timer
  useEffect(() => {
    if (!captionsEnabled) return;

    const timer = setInterval(() => {
      captionDispatchRef.current?.dispatch({ type: 'TICK' });
    }, 120);

    return () => clearInterval(timer);
  }, [captionsEnabled]);

  // Portal setup
  useEffect(() => {
    if (portalTarget) {
      portalElRef.current = portalTarget;
      return () => {
        portalElRef.current = null;
      };
    }

    try {
      const id = `captions-portal-${meetingId}`;
      let el = document.getElementById(id) as HTMLElement | null;

      if (!el) {
        el = document.createElement('div');
        el.id = id;
        el.style.position = 'fixed';
        el.style.left = '0';
        el.style.top = '0';
        el.style.width = '100%';
        el.style.height = '100%';
        el.style.pointerEvents = 'none';
        el.style.zIndex = String(2147483647);
        document.body.appendChild(el);
      }

      portalElRef.current = el;

      return () => {
        if (el?.parentElement) {
          try { el.parentElement.removeChild(el); } catch (_) {}
        }
        portalElRef.current = null;
      };
    } catch (_) {
      portalElRef.current = null;
    }
  }, [meetingId, portalTarget]);

  const hasVisibleCaptions = captions.length > 0;

  // Render overlay
  const overlay = (
    <div 
      className={`${portalTarget ? 'absolute' : 'fixed'} inset-x-0 bottom-0 z-40 pointer-events-none flex justify-center px-3 sm:px-6`}
      style={{ 
        paddingBottom: typeof window !== 'undefined' && window.innerWidth < 640
          ? 'calc(env(safe-area-inset-bottom, 0px) + 112px)'
          : 'calc(env(safe-area-inset-bottom, 0px) + 92px)'
      }}
    >
      {debugMode && (
        <div className="fixed left-4 top-20 z-[2147483650] pointer-events-auto">
          <div className="rounded-md bg-black/80 px-3 py-2 text-xs text-white shadow"> 
            <div><strong>Captions Debug</strong></div>
            <div className="mt-1">URL: <span className="font-mono break-all">{socketUrl}</span></div>
            <div>Status: {connected ? 'connected' : 'disconnected'}</div>
          </div>
        </div>
      )}

      <div
        className={`w-full max-w-[min(46rem,calc(100vw-1.5rem))] transition-all duration-200 ease-out ${
          hasVisibleCaptions ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0'
        }`}
        aria-live="polite"
        aria-atomic="false"
      >
        {hasVisibleCaptions && (
          <div className="overflow-hidden rounded-[18px] bg-black/90 px-4 py-3 text-left shadow-xl ring-1 ring-white/10 backdrop-blur-md sm:px-5">
            <div className="flex flex-col gap-2">
              {captions.map((caption) => (
                <div
                  key={caption.id}
                  className="grid grid-cols-1 gap-1 sm:grid-cols-[8.5rem_minmax(0,1fr)] sm:gap-3"
                  style={{
                    opacity: caption.opacity ?? 1,
                    transition: 'opacity 220ms ease, transform 220ms ease',
                  }}
                >
                  <div className="min-w-0 truncate text-[13px] font-semibold leading-6 text-[#8ab4f8] sm:text-right">
                    {caption.speakerName}
                  </div>
                  <p className="line-clamp-2 min-w-0 break-words text-[17px] font-medium leading-6 tracking-[-0.01em] text-white sm:text-[18px]">
                    {caption.text}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  if (portalElRef.current) {
    try {
      return createPortal(overlay, portalElRef.current);
    } catch (_) {
      return overlay;
    }
  }

  return overlay;
}
