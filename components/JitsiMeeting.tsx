'use client';

import { resolveMeetingAiHttpUrl } from '@/lib/meeting-ai-client';
import { useEffect, useRef, useState } from 'react';

const DEFAULT_TOOLBAR_BUTTONS = [
  'microphone',
  'camera',
  'desktop',
  'fullscreen',
  'hangup',
  'chat',
  'recording',
  'settings',
  'raisehand',
  'participants-pane',
  'videoquality',
  'tileview',
  'stats',
  'shortcuts',
  'download',
  'security',
];

const LOW_CONNECTION_QUALITY_THRESHOLD = 35;
const DEFAULT_VIDEO_QUALITY = 1080;
const IDEAL_CAPTURE_HEIGHT = 1080;
const IDEAL_CAPTURE_WIDTH = 1920;
const VIDEO_QUALITY_LEVELS = [
  1080,
  720,
  540,
  360,
  180,
];
const REJOIN_BASE_DELAY_MS = 1500;
const REJOIN_MAX_DELAY_MS = 12000;
const MOBILE_VIDEO_QUALITY = 720;
const MOBILE_CAPTURE_WIDTH = 1280;
const MOBILE_CAPTURE_HEIGHT = 720;

function isMobileBrowser() {
  if (typeof navigator === 'undefined') {
    return false;
  }

  const userAgentData = (navigator as Navigator & { userAgentData?: { mobile?: boolean } }).userAgentData;
  if (userAgentData?.mobile) {
    return true;
  }

  return /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent);
}

function isCameraPermissionDenied(error: unknown) {
  const name = String((error as { name?: string } | null)?.name || '');
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return true;
  }

  let text = '';
  try {
    text = JSON.stringify(error || {}).toLowerCase();
  } catch {
    text = String(error || '').toLowerCase();
  }

  return /notallowederror|permissiondeniederror|gum\.permission|(?:camera|microphone) permission|permission.*(?:denied|blocked)|(?:denied|blocked).*permission/.test(text);
}

declare global {
  interface Window {
    JitsiMeetExternalAPI: any;
  }
}

export interface JitsiMeetingProps {
  /** Meeting room identifier */
  roomName: string;
  /** User display name - defaults to "Guest" */
  displayName?: string;
  /** User email address - optional */
  userEmail?: string;
  /** Custom domain for self-hosted Jitsi - defaults to NEXT_PUBLIC_JITSI_DOMAIN env var */
  domain?: string;
  /** Callback when meeting is ready */
  onReady?: () => void;
  /** Callback when user leaves the meeting */
  onReadyToClose?: () => void;
  /** Start audio muted - defaults to false */
  startWithAudioMuted?: boolean;
  /** Start video muted - defaults to false */
  startWithVideoMuted?: boolean;
  /** Show prejoin page - defaults to false */
  prejoinPageEnabled?: boolean;
  /** Custom toolbar buttons to display */
  toolbarButtons?: string[];
  /** Optional JWT for private rooms */
  jwt?: string;
  /** Caption service room id, when it differs from the normalized Jitsi room name */
  captionMeetingId?: string;
  /** Callback when the Jitsi API instance is ready */
  onApiReady?: (api: any) => void;
  /** Enable custom styling */
  showLogo?: boolean;
  /** Container height - defaults to 100% */
  height?: string;
  /** Custom CSS class for container */
  className?: string;
}

/**
 * JitsiMeeting Component
 * 
 * Embeds a Jitsi Meet video conference in your React/Next.js application.
 * Supports both public (meet.jit.si) and self-hosted Jitsi servers.
 * 
 * @example
 * ```tsx
 * <JitsiMeeting
 *   roomName="my-meeting-room"
 *   displayName="John Doe"
 *   userEmail="john@example.com"
 *   domain="meet.melanam.com"
 *   onReadyToClose={() => router.push('/lms')}
 * />
 * ```
 */
export function JitsiMeeting({
  roomName,
  displayName = 'Guest',
  userEmail,
  domain,
  onReady,
  onReadyToClose,
  startWithAudioMuted = false,
  startWithVideoMuted = false,
  prejoinPageEnabled = false,
  toolbarButtons = DEFAULT_TOOLBAR_BUTTONS,
  jwt,
  captionMeetingId,
  onApiReady,
  showLogo = false,
  height = '100%',
  className = '',
}: JitsiMeetingProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const jitsiRef = useRef<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scriptLoading, setScriptLoading] = useState(true);
  const [cameraPermissionChecked, setCameraPermissionChecked] = useState(false);
  const [cameraPermissionBlocked, setCameraPermissionBlocked] = useState(false);
  const [cameraPermissionRetry, setCameraPermissionRetry] = useState(0);
  const [recoveryMessage, setRecoveryMessage] = useState<string | null>(null);
  const [apiGeneration, setApiGeneration] = useState(0);
  const scriptTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const joinTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const recoveryTimerRef = useRef<NodeJS.Timeout | null>(null);
  const recoveryAttemptRef = useRef(0);
  const joinedOnceRef = useRef(false);
  const intentionalHangupRef = useRef(false);
  const closeNotifiedRef = useRef(false);
  const disposingForRecoveryRef = useRef(false);
  const lowBandwidthModeRef = useRef(false);
  const videoQualityLevelRef = useRef(0);
  const onReadyRef = useRef(onReady);
  const onReadyToCloseRef = useRef(onReadyToClose);
  const onApiReadyRef = useRef(onApiReady);
  const displayNameRef = useRef(displayName);
  const userEmailRef = useRef(userEmail);
  const captionMeetingIdRef = useRef(captionMeetingId);
  const toolbarButtonsRef = useRef(toolbarButtons);

  const clearJoinTimeout = () => {
    if (joinTimeoutRef.current) {
      clearTimeout(joinTimeoutRef.current);
      joinTimeoutRef.current = null;
    }
  };

  const clearRecoveryTimer = () => {
    if (recoveryTimerRef.current) {
      clearTimeout(recoveryTimerRef.current);
      recoveryTimerRef.current = null;
    }
  };

  const setMeetingVideoQuality = (height: number) => {
    jitsiRef.current?.executeCommand?.('setVideoQuality', height);
    jitsiRef.current?.executeCommand?.('setReceiverVideoConstraint', height);
  };

  const improveVideoQuality = (reason: string) => {
    if (videoQualityLevelRef.current <= 0) {
      lowBandwidthModeRef.current = false;
      return;
    }

    videoQualityLevelRef.current -= 1;
    const nextQuality = VIDEO_QUALITY_LEVELS[videoQualityLevelRef.current];
    lowBandwidthModeRef.current = videoQualityLevelRef.current > 0;
    console.info(`[Jitsi] Raising video quality to ${nextQuality}p: ${reason}`);

    try {
      setMeetingVideoQuality(nextQuality);
    } catch (err) {
      console.warn('[Jitsi] Unable to raise video quality', err);
    }
  };

  const applyLowBandwidthFallback = (reason: string) => {
    if (videoQualityLevelRef.current >= VIDEO_QUALITY_LEVELS.length - 1) {
      return;
    }

    lowBandwidthModeRef.current = true;
    videoQualityLevelRef.current += 1;
    const nextQuality = VIDEO_QUALITY_LEVELS[videoQualityLevelRef.current];
    console.warn(`[Jitsi] Lowering video quality to ${nextQuality}p: ${reason}`);

    try {
      setMeetingVideoQuality(nextQuality);
    } catch (err) {
      console.warn('[Jitsi] Unable to lower video quality', err);
    }
  };

  const isRecoverableJitsiError = (event: unknown) => {
    let text = '';

    try {
      text = JSON.stringify(event || {}).toLowerCase();
    } catch {
      text = String(event || '').toLowerCase();
    }

    if (/gum|permission|notallowed|notfound|device|capture/.test(text)) {
      return false;
    }

    return /connection|disconnect|reconnect|ice|network|jvb|bridge|xmpp|timeout|transport|websocket/.test(text);
  };

  const scheduleHardRejoin = (reason: string) => {
    if (
      closeNotifiedRef.current ||
      intentionalHangupRef.current ||
      !joinedOnceRef.current ||
      recoveryTimerRef.current
    ) {
      return;
    }

    const nextAttempt = recoveryAttemptRef.current + 1;
    recoveryAttemptRef.current = nextAttempt;
    const delay = Math.min(REJOIN_MAX_DELAY_MS, REJOIN_BASE_DELAY_MS * nextAttempt);

    console.warn(`[Jitsi] Scheduling meeting recovery in ${delay}ms: ${reason}`);
    clearJoinTimeout();
    setRecoveryMessage('Reconnecting to the meeting...');
    setLoading(true);

    recoveryTimerRef.current = setTimeout(() => {
      recoveryTimerRef.current = null;
      disposingForRecoveryRef.current = true;
      setApiGeneration((current) => current + 1);
    }, delay);
  };

  const finishMeetingLeave = (reason: string) => {
    if (closeNotifiedRef.current) {
      return;
    }

    console.log(`JitsiMeeting: leaving meeting (${reason})`);
    closeNotifiedRef.current = true;
    intentionalHangupRef.current = true;
    clearJoinTimeout();
    clearRecoveryTimer();
    setRecoveryMessage(null);
    onReadyToCloseRef.current?.();
  };

  useEffect(() => {
    return () => {
      clearJoinTimeout();
      clearRecoveryTimer();
    };
  }, []);

  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);

  useEffect(() => {
    onReadyToCloseRef.current = onReadyToClose;
  }, [onReadyToClose]);

  useEffect(() => {
    onApiReadyRef.current = onApiReady;
  }, [onApiReady]);

  useEffect(() => {
    displayNameRef.current = displayName;
    jitsiRef.current?.executeCommand?.('displayName', displayName);
  }, [displayName]);

  useEffect(() => {
    userEmailRef.current = userEmail;
  }, [userEmail]);

  useEffect(() => {
    captionMeetingIdRef.current = captionMeetingId;
  }, [captionMeetingId]);

  useEffect(() => {
    toolbarButtonsRef.current = toolbarButtons;
  }, [toolbarButtons]);

  // Get domain from prop or environment variable
  const cleanDomain = (() => {
    const domainInput =
      domain ||
      process.env.NEXT_PUBLIC_JITSI_DOMAIN ||
      'meet.jit.si';

    const normalized = domainInput.trim();
    return normalized.replace(/^https?:\/\//, '').trim();
  })();

  const activeProtocol = 'https';

  useEffect(() => {
    setScriptLoading(true);
  }, [cleanDomain]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    setRecoveryMessage(null);
    setCameraPermissionChecked(false);
    setCameraPermissionBlocked(false);
    joinedOnceRef.current = false;
    intentionalHangupRef.current = false;
    closeNotifiedRef.current = false;
    disposingForRecoveryRef.current = false;
    lowBandwidthModeRef.current = false;
    recoveryAttemptRef.current = 0;
    clearRecoveryTimer();
  }, [cleanDomain, roomName]);

  // iOS can persist a previous “Don't Allow” choice and reject future media
  // requests without displaying the browser prompt. Check before creating the
  // Jitsi iframe so that we can show clear recovery instructions instead of
  // Jitsi's generic camera-permission error.
  useEffect(() => {
    let cancelled = false;

    const checkCameraPermission = async () => {
      if (!isMobileBrowser() || !navigator.mediaDevices?.getUserMedia) {
        if (!cancelled) setCameraPermissionChecked(true);
        return;
      }

      if (!cancelled) {
        setCameraPermissionChecked(false);
        setCameraPermissionBlocked(false);
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        stream.getTracks().forEach((track) => track.stop());
      } catch (permissionError) {
        if (!cancelled && isCameraPermissionDenied(permissionError)) {
          setCameraPermissionBlocked(true);
        }
      } finally {
        if (!cancelled) setCameraPermissionChecked(true);
      }
    };

    void checkCameraPermission();
    return () => {
      cancelled = true;
    };
  }, [cleanDomain, roomName, cameraPermissionRetry]);

  // Load Jitsi external API script
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Check if script is already loaded
    if (window.JitsiMeetExternalAPI) {
      console.log('[Jitsi] API already loaded');
      setScriptLoading(false);
      return;
    }

    const script = document.createElement('script');
    script.src = `${activeProtocol}://${cleanDomain}/external_api.js`;
    script.async = true;

    console.log(`[Jitsi] Loading from ${activeProtocol}://${cleanDomain}/external_api.js`);
    setScriptLoading(true);

    // Set timeout for script loading (15 seconds)
    scriptTimeoutRef.current = setTimeout(() => {
      console.error(`[Jitsi] Load timeout from ${activeProtocol}://${cleanDomain}/external_api.js`);

      setScriptLoading(false);
      setError(
        `Cannot load from https://${cleanDomain}. Domain may be unreachable or incorrect.`
      );
    }, 15000);

    const handleLoad = () => {
      console.log(`[Jitsi] Successfully loaded from ${activeProtocol}://${cleanDomain}/external_api.js`);
      if (scriptTimeoutRef.current) clearTimeout(scriptTimeoutRef.current);
      setScriptLoading(false);
    };

    const handleError = () => {
      console.error(`[Jitsi] Load error from ${activeProtocol}://${cleanDomain}/external_api.js`);
      if (scriptTimeoutRef.current) clearTimeout(scriptTimeoutRef.current);

      setScriptLoading(false);
      setError(
        `Cannot reach https://${cleanDomain}. Verify domain and network connectivity.`
      );
    };

    script.addEventListener('load', handleLoad);
    script.addEventListener('error', handleError);
    document.head.appendChild(script);

    return () => {
      script.removeEventListener('load', handleLoad);
      script.removeEventListener('error', handleError);
      if (scriptTimeoutRef.current) clearTimeout(scriptTimeoutRef.current);
      if (document.head.contains(script)) {
        document.head.removeChild(script);
      }
    };
  }, [activeProtocol, cleanDomain]);

  // Initialize Jitsi meeting
  useEffect(() => {
    if (scriptLoading || !cameraPermissionChecked || cameraPermissionBlocked || !containerRef.current || error) {
      console.log('JitsiMeeting: Waiting or error state', { scriptLoading, cameraPermissionChecked, cameraPermissionBlocked, containerRef: !!containerRef.current, error });
      return;
    }

    if (!window.JitsiMeetExternalAPI) {
      console.error('JitsiMeeting: JitsiMeetExternalAPI not available on window');
      setError('Jitsi Meet API not available. The script may not have loaded properly.');
      return;
    }

    const handleBrowserOffline = () => {
      applyLowBandwidthFallback('browser offline event');
    };

    const handleBrowserOnline = () => {
      if (joinedOnceRef.current && !intentionalHangupRef.current) {
        scheduleHardRejoin('browser came back online');
      }
    };

    try {
      console.log('JitsiMeeting: Initializing with config', { 
        roomName, 
        displayName, 
        domain: cleanDomain,
        protocol: activeProtocol,
        containerExists: !!containerRef.current 
      });
      setLoading(true);

      // Do not make phones encode a desktop 1080p stream. Keep VP8 first for
      // every participant: it is the most consistently interoperable Jitsi
      // WebRTC codec across Chrome, Firefox, and Safari.
      const mobileBrowser = isMobileBrowser();
      const captureWidth = mobileBrowser ? MOBILE_CAPTURE_WIDTH : IDEAL_CAPTURE_WIDTH;
      const captureHeight = mobileBrowser ? MOBILE_CAPTURE_HEIGHT : IDEAL_CAPTURE_HEIGHT;
      const preferredResolution = mobileBrowser ? MOBILE_VIDEO_QUALITY : DEFAULT_VIDEO_QUALITY;
      const codecOrder = ['VP8', 'H264', 'VP9', 'AV1'];
      const effectivePrejoinPageEnabled = prejoinPageEnabled && !joinedOnceRef.current;
      // Mobile browsers, especially in-app Safari views, can deny automatic
      // camera or microphone requests before a participant has interacted with
      // the meeting. Join muted, then let them enable each device deliberately
      // from Jitsi's toolbar when they are ready.
      const startWithAudioMutedOnJoin = startWithAudioMuted || mobileBrowser;
      const startWithVideoMutedOnJoin = startWithVideoMuted || mobileBrowser;
      const options = {
        roomName: roomName,
        parentNode: containerRef.current,
        width: '100%',
        height: height,
        ...(jwt ? { jwt } : {}),
        userInfo: {
          displayName: displayName,
          ...(userEmail && { email: userEmail }),
        },
        configOverwrite: {
          toolbarButtons: toolbarButtonsRef.current,
          startWithAudioMuted: startWithAudioMutedOnJoin,
          startWithVideoMuted: startWithVideoMutedOnJoin,
          disableDeepLinking: true,
          disableSimulcast: mobileBrowser,
          resolution: preferredResolution,
          startBitrate: mobileBrowser ? 800 : 1500,
          constraints: {
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            },
            video: {
              height: {
                ideal: captureHeight,
                max: captureHeight,
              },
              width: {
                ideal: captureWidth,
                max: captureWidth,
              },
              frameRate: {
                ideal: mobileBrowser ? 24 : 30,
                max: 30,
              },
            },
          },
          channelLastN: -1,
          flags: {
            sourceNameSignaling: true,
            sendMultipleVideoStreams: !mobileBrowser,
            receiveMultipleVideoStreams: !mobileBrowser,
          },
          videoQuality: {
            preferredCodec: 'VP8',
            codecPreferenceOrder: codecOrder,
            mobileCodecPreferenceOrder: codecOrder,
            enableAdaptiveMode: true,
          },
          p2p: {
            // Keep Jitsi's direct WebRTC path available for two participants.
            // Disabling this forced every call through the videobridge, so an
            // unavailable bridge media port resulted in both users joining but
            // receiving no remote audio or video.
            enabled: true,
            codecPreferenceOrder: codecOrder,
            mobileCodecPreferenceOrder: codecOrder,
          },
          enableNoisyMicDetection: true,
          prejoinPageEnabled: effectivePrejoinPageEnabled,
          prejoinConfig: { enabled: effectivePrejoinPageEnabled },
          chromeExtensionBanner: null,
          disableAudioLevels: false,
          disableSuspendVideo: true,
          enableLayerSuspension: false,
          enableIceRestart: true,
          enableForcedReload: false,
          enableFeaturesBasedOnToken: Boolean(jwt),
          localRecording: {
            enabled: true,
            notifyAllParticipants: false,
            disable: false,
          },
          recordingService: {
            enabled: true,
            sharingEnabled: true,
          },
          // Self-hosted Jitsi configuration
          enableWelcomePage: false,
          enableClosePage: false,
          enableUserRolesBasedOnToken: Boolean(jwt),
        },
        interfaceConfigOverwrite: {
          LANG_DETECTION: true,
          SHOW_CHROME_EXTENSION_BANNER: false,
          MOBILE_APP_PROMO: false,
          SHOW_POWERED_BY: showLogo,
          SHOW_JITSI_WATERMARK: false,
          SHOW_BRAND_WATERMARK: false,
          SHOW_WATERMARK_FOR_GUESTS: false,
          DEFAULT_REMOTE_DISPLAY_NAME: 'Fellow Jitsian',
          APP_NAME: 'Melanam',
        },
      };

      jitsiRef.current = new window.JitsiMeetExternalAPI(cleanDomain, options);

// =====================================================
// Remove Jitsi watermark (all devices)
// =====================================================

const removeJitsiWatermark = () => {
  document
    .querySelectorAll(
      "a.watermark.leftwatermark, div.watermark.leftwatermark"
    )
    .forEach((el) => {
      el.remove();
    });
};

// Remove if already present
removeJitsiWatermark();

// Watch the DOM continuously
const watermarkObserver = new MutationObserver(() => {
  removeJitsiWatermark();
});

watermarkObserver.observe(document.body, {
  childList: true,
  subtree: true,
});

const originalDispose = jitsiRef.current.dispose.bind(jitsiRef.current);

jitsiRef.current.dispose = () => {
  watermarkObserver.disconnect();
  originalDispose();
};

      disposingForRecoveryRef.current = false;
      onApiReadyRef.current?.(jitsiRef.current);

      console.log('JitsiMeeting: API instance created successfully');
      // Unblock UI as soon as iframe API is mounted.
      setLoading(false);
      clearJoinTimeout();

      joinTimeoutRef.current = setTimeout(() => {
        console.warn('JitsiMeeting: join timeout exceeded');
        if (joinedOnceRef.current && !intentionalHangupRef.current) {
          applyLowBandwidthFallback('join timeout during recovery');
          scheduleHardRejoin('join timeout during recovery');
          return;
        }

        setLoading(false);
      }, 30000);

      const postParticipantMapping = (participantId: unknown, participantName: unknown) => {
        const id = String(participantId || '').trim();
        const name = String(participantName || '').trim();
        const base = resolveMeetingAiHttpUrl();
        const captionRoomId = captionMeetingIdRef.current || roomName;

        if (!base || !id) {
          return;
        }

        fetch(`${base}/api/rooms/${encodeURIComponent(captionRoomId)}/participants`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            participantId: id,
            displayName: name,
            email: userEmailRef.current || '',
          }),
        }).catch((e) => console.warn('[Jitsi] participant mapping failed', e));
      };

      jitsiRef.current.addEventListener('videoConferenceJoined', (event: any) => {
        console.log('JitsiMeeting: Video conference joined');
        joinedOnceRef.current = true;
        intentionalHangupRef.current = false;
        recoveryAttemptRef.current = 0;
        setRecoveryMessage(null);
        clearRecoveryTimer();
        if (lowBandwidthModeRef.current) {
          improveVideoQuality('recovered meeting rejoined');
        } else {
          setMeetingVideoQuality(DEFAULT_VIDEO_QUALITY);
        }
        const localParticipantId =
          event?.id ||
          event?.participantId ||
          event?.jid ||
          jitsiRef.current?.getCurrentUserID?.() ||
          userEmailRef.current ||
          displayNameRef.current;
        postParticipantMapping(localParticipantId, displayNameRef.current || userEmailRef.current || 'Guest');
        setLoading(false);
        clearJoinTimeout();
        onReadyRef.current?.();
      });

      jitsiRef.current.addEventListener('readyToClose', () => {
        console.log('Meeting ended');
        clearJoinTimeout();
        if (disposingForRecoveryRef.current) {
          return;
        }

        if (intentionalHangupRef.current || !joinedOnceRef.current) {
          finishMeetingLeave('readyToClose');
          return;
        }

        scheduleHardRejoin('Jitsi closed unexpectedly');
      });

      jitsiRef.current.addEventListener('toolbarButtonClicked', (event: any) => {
        const button = String(event?.key || event?.button || event?.id || event || '').toLowerCase();
        if (button === 'hangup') {
          intentionalHangupRef.current = true;
        }
      });

      jitsiRef.current.addEventListener('videoConferenceLeft', (event: any) => {
        console.log('JitsiMeeting: Video conference left', event);
        finishMeetingLeave('videoConferenceLeft');
      });

      jitsiRef.current.addEventListener('connectionQualityChanged', (event: any) => {
        const quality = Number(event?.connectionQuality ?? event?.quality);
        if (Number.isFinite(quality) && quality <= LOW_CONNECTION_QUALITY_THRESHOLD) {
          applyLowBandwidthFallback(`connection quality ${quality}`);
        }
      });

      jitsiRef.current.addEventListener('errorOccurred', (event: any) => {
        console.warn('JitsiMeeting: Jitsi error event', event);
        if (isCameraPermissionDenied(event)) {
          setCameraPermissionBlocked(true);
          setLoading(false);
          return;
        }
        if (isRecoverableJitsiError(event)) {
          applyLowBandwidthFallback('recoverable Jitsi error');
          scheduleHardRejoin('recoverable Jitsi error');
        }
      });

      jitsiRef.current.addEventListener('videoConferenceFailed', (event: any) => {
        console.warn('JitsiMeeting: Video conference failed', event);
        if (isCameraPermissionDenied(event)) {
          setCameraPermissionBlocked(true);
          setLoading(false);
          return;
        }
        if (isRecoverableJitsiError(event)) {
          applyLowBandwidthFallback('video conference failed');
          scheduleHardRejoin('video conference failed');
        }
      });

      jitsiRef.current.addEventListener('participantJoined', (participant: any) => {
        try {
          const name = participant.getDisplayName ? participant.getDisplayName() : participant.displayName || participant.name || '';
          const id = participant.getId ? participant.getId() : participant.id || participant.participantId || participant.jid;
          console.log('Participant joined:', name, id);
          postParticipantMapping(id, name);
        } catch (err) {
          console.log('Participant joined event error', err);
        }
      });

      jitsiRef.current.addEventListener('participantLeft', (participant: any) => {
        try {
          const id = participant.getId ? participant.getId() : participant.id || participant.participantId || participant.jid;
          console.log('Participant left:', id);
          postParticipantMapping(id, '');
        } catch (err) {
          console.log('Participant left event error', err);
        }
      });

      jitsiRef.current.addEventListener('conferenceError', (error: any) => {
        console.error('Conference error:', error);
        setLoading(false);
        if (isCameraPermissionDenied(error)) {
          setCameraPermissionBlocked(true);
          return;
        }
        if (isRecoverableJitsiError(error)) {
          applyLowBandwidthFallback('conference error');
          scheduleHardRejoin('conference error');
        }
      });

      window.addEventListener('offline', handleBrowserOffline);
      window.addEventListener('online', handleBrowserOnline);
    } catch (err) {
      console.error('Error initializing Jitsi Meeting:', err);
      setError('Failed to initialize video conference');
      setLoading(false);
    }

    return () => {
      window.removeEventListener('offline', handleBrowserOffline);
      window.removeEventListener('online', handleBrowserOnline);
      clearJoinTimeout();
      if (jitsiRef.current) {
        try {
          disposingForRecoveryRef.current = true;
          jitsiRef.current.dispose();
        } catch (err) {
          console.error('Error disposing Jitsi:', err);
        }
        jitsiRef.current = null;
      }
    };
  }, [
    scriptLoading,
    cameraPermissionChecked,
    cameraPermissionBlocked,
    roomName,
    cleanDomain,
    startWithAudioMuted,
    startWithVideoMuted,
    prejoinPageEnabled,
    showLogo,
    activeProtocol,
    jwt,
    apiGeneration,
  ]);

  if (error) {
    return (
      <div
        className={`w-full flex items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800 ${className}`}
        style={{ height }}
      >
        <div className="text-center px-4">
          <h3 className="text-lg font-semibold text-red-400 mb-2">Unable to Load Video Call</h3>
          <p className="text-gray-400 text-sm mb-4">{error}</p>
          <details className="text-left text-xs text-gray-500 bg-slate-800 rounded p-3 inline-block">
            <summary className="cursor-pointer font-semibold mb-2">Technical Details</summary>
            <p className="mb-1"><span className="text-gray-400">Domain:</span> {cleanDomain}</p>
            <p className="mb-1"><span className="text-gray-400">Protocol:</span> https://</p>
            <p className="mb-1"><span className="text-gray-400">Room:</span> {roomName}</p>
            <p className="mt-2 text-gray-600">Attempting: https://{cleanDomain}/external_api.js</p>
          </details>
        </div>
      </div>
    );
  }

  if (cameraPermissionBlocked) {
    return (
      <div
        className={`w-full flex items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800 ${className}`}
        style={{ height }}
      >
        <div className="max-w-md px-6 text-center">
          <div className="mb-3 text-3xl" aria-hidden="true">📷</div>
          <h3 className="mb-2 text-lg font-semibold text-white">Camera access is blocked</h3>
          <p className="mb-4 text-sm text-gray-300">
            Camera or microphone access was previously denied for Melanam.
          </p>
          <p className="mb-5 text-sm text-gray-400">
            Open your browser menu or Website Settings, set Camera to Allow, then reload the meeting.
          </p>
          <button
            type="button"
            onClick={() => setCameraPermissionRetry((attempt) => attempt + 1)}
            className="rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`relative ${className}`} style={{ height, width: '100%' }}>
      <div
        ref={containerRef}
        style={{ height: '100%', width: '100%' }}
      />

      {(scriptLoading || loading) && (
        <div className="absolute inset-0 z-20 w-full flex items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800">
          <div className="text-center">
            <div className="inline-block">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mb-4"></div>
            </div>
            <p className="text-gray-300">
              {scriptLoading ? 'Loading video service...' : !cameraPermissionChecked ? 'Checking camera access...' : recoveryMessage || 'Joining meeting...'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

