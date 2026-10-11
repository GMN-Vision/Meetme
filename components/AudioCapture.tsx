'use client';

import { useEffect, useRef, useState } from 'react';

interface AudioCaptureProps {
  meetingId: string;
  enabled?: boolean;
  className?: string;
  buttonClassName?: string;
  labelClassName?: string;
  speakerName?: string;
  speakerId?: string;
}

type SpeechRecognitionResult = {
  isFinal: boolean;
  [index: number]: {
    transcript: string;
  };
};

type SpeechRecognitionEvent = Event & {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: SpeechRecognitionResult;
  };
};

type SpeechRecognitionErrorEvent = Event & {
  error?: string;
  message?: string;
};

type BrowserSpeechRecognition = EventTarget & {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
};

type BrowserSpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

const RECORDER_MIME_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
  'audio/ogg',
  'audio/mp4',
];
const APPLE_RECORDER_MIME_TYPES = [
  'audio/mp4;codecs=mp4a.40.2',
  'audio/mp4',
  ...RECORDER_MIME_TYPES,
];
const RECORDER_SEGMENT_MS = 3000;

declare global {
  interface Window {
    SpeechRecognition?: BrowserSpeechRecognitionConstructor;
    webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
  }
}

export function AudioCapture({
  meetingId,
  enabled = true,
  className,
  buttonClassName,
  labelClassName = 'hidden sm:inline',
  speakerName,
  speakerId,
}: AudioCaptureProps) {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recorderChunksRef = useRef<Blob[]>([]);
  const recorderSegmentTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const uploadQueueRef = useRef<Promise<void>>(Promise.resolve());
  const speechRecognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const shouldKeepListeningRef = useRef(false);
  const lastCaptionTextRef = useRef('');
  const lastInterimSentAtRef = useRef(0);
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const resolvedSpeakerName = normalizeSpeakerName(speakerName) || 'You';
  const resolvedSpeakerId = normalizeSpeakerId(speakerId || resolvedSpeakerName) || 'local-user';

  const verifyCaptionAccess = async () => {
    const response = await fetch('/api/captions/publish', {
      method: 'GET',
      credentials: 'include',
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || 'Upgrade to Pro or Business to start captions');
    }
  };

  const postLiveCaption = async (text: string, final: boolean) => {
    const normalizedText = text.trim().replace(/\s+/g, ' ');

    if (!normalizedText || normalizedText === lastCaptionTextRef.current) {
      return;
    }

    if (!final && Date.now() - lastInterimSentAtRef.current < 250) {
      return;
    }

    if (!final) {
      lastInterimSentAtRef.current = Date.now();
    }

    lastCaptionTextRef.current = normalizedText;

    try {
      const response = await fetch('/api/captions/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          meetingId,
          text: normalizedText,
          speaker: resolvedSpeakerName,
          speakerId: resolvedSpeakerId,
          final,
          timestamp: Date.now(),
        }),
      });

      if (!response.ok) {
        console.error('[audio] live caption post failed:', response.status, response.statusText);
        if ([401, 402, 403].includes(response.status)) {
          const body = await response.json().catch(() => ({}));
          const message = body.error || 'Upgrade to Pro or Business to continue captions';
          setError(message);
          stopListening();
        }
      }
    } catch (err) {
      console.error('[audio] live caption post error:', err);
    }
  };

  const uploadAudioChunk = async (blob: Blob, recorderMimeType?: string) => {
    if (blob.size === 0) {
      console.log('[audio] Skipping empty audio chunk');
      return;
    }

    uploadQueueRef.current = uploadQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        const mimeType = recorderMimeType || blob.type || 'audio/webm';
        const typedBlob = new Blob([blob], {
          type: mimeType,
        });
        const extension = getAudioExtension(mimeType);

        console.log('[audio] Uploading audio chunk:', typedBlob.size, 'bytes', mimeType);
        const formData = new FormData();
        formData.append('audio', typedBlob, `chunk.${extension}`);
        formData.append('meetingId', meetingId);
        formData.append('speakerName', resolvedSpeakerName);
        formData.append('speakerId', resolvedSpeakerId);
        formData.append('durationSeconds', String(Math.ceil(RECORDER_SEGMENT_MS / 1000)));

        try {
          const response = await fetch('/api/transcribe-audio', {
            method: 'POST',
            body: formData,
          });

          if (!response.ok) {
            console.error('[audio] transcribe failed:', response.status, response.statusText);
            const text = await response.text();
            console.error('[audio] Error response:', text);
          } else {
            const data = await response.json();
            console.log('[audio] Transcription successful:', data);
          }
        } catch (err) {
          console.error('[audio] upload error:', err);
        }
      });
  };

  const clearRecorderSegmentTimer = () => {
    if (recorderSegmentTimerRef.current) {
      clearTimeout(recorderSegmentTimerRef.current);
      recorderSegmentTimerRef.current = null;
    }
  };

  const startSpeechRecognition = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      return false;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event) => {
      let interimText = '';
      let finalText = '';

      for (let resultIndex = event.resultIndex; resultIndex < event.results.length; resultIndex += 1) {
        const result = event.results[resultIndex];
        const transcript = result[0]?.transcript || '';

        if (result.isFinal) {
          finalText += transcript;
        } else {
          interimText += transcript;
        }
      }

      if (finalText.trim()) {
        void postLiveCaption(finalText, true);
      } else if (interimText.trim()) {
        void postLiveCaption(interimText, false);
      }
    };

    recognition.onerror = (event) => {
      const message = event.error || event.message || 'Speech recognition error';
      console.warn('[audio] speech recognition error:', message);

      if (message !== 'no-speech') {
        setError(message);
      }
    };

    recognition.onend = () => {
      if (!shouldKeepListeningRef.current) {
        return;
      }

      try {
        recognition.start();
      } catch {
        setTimeout(() => {
          if (!shouldKeepListeningRef.current) {
            return;
          }

          try {
            recognition.start();
          } catch {
            // Leave the UI running; the user can restart manually if needed.
          }
        }, 300);
      }
    };

    try {
      recognition.start();
      speechRecognitionRef.current = recognition;
      return true;
    } catch (err) {
      console.warn('[audio] speech recognition failed to start:', err);
      speechRecognitionRef.current = null;
      return false;
    }
  };

  const startRecorderFallback = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      throw new Error('Live captions require microphone recording support in this browser');
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    console.log('[audio] Microphone access granted, stream:', stream);
    streamRef.current = stream;

    try {
      startRecorderSegment(stream);
    } catch (error) {
      stream.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      throw error;
    }
    console.log('[audio] MediaRecorder fallback started');
  };

  const startRecorderSegment = (stream: MediaStream) => {
    if (!shouldKeepListeningRef.current || !stream.active) {
      return;
    }

    const mimeType = getSupportedAudioMimeType();
    const mediaRecorder = mimeType
      ? new MediaRecorder(stream, { mimeType })
      : new MediaRecorder(stream);
    const recorderMimeType = mediaRecorder.mimeType || mimeType || 'audio/webm';

    recorderChunksRef.current = [];
    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size === 0) {
        return;
      }

      recorderChunksRef.current.push(event.data);
    };

    mediaRecorder.onstop = () => {
      clearRecorderSegmentTimer();

      const chunks = recorderChunksRef.current;
      recorderChunksRef.current = [];
      mediaRecorderRef.current = null;

      if (chunks.length > 0) {
        const blob = new Blob(chunks, {
          type: recorderMimeType,
        });

        console.log('[audio] Got finalized audio segment:', blob.size, 'bytes');
        uploadAudioChunk(blob, recorderMimeType);
      }

      if (shouldKeepListeningRef.current && streamRef.current?.active) {
        startRecorderSegment(streamRef.current);
      } else if (streamRef.current === stream) {
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    };

    mediaRecorderRef.current = mediaRecorder;
    mediaRecorder.start();

    recorderSegmentTimerRef.current = setTimeout(() => {
      if (mediaRecorderRef.current === mediaRecorder && mediaRecorder.state === 'recording') {
        try {
          mediaRecorder.stop();
        } catch (err) {
          console.warn('[audio] failed to stop recorder segment:', err);
        }
      }
    }, RECORDER_SEGMENT_MS);
  };

  const stopRecorderFallback = () => {
    clearRecorderSegmentTimer();

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch {
        mediaRecorderRef.current = null;
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    } else {
      mediaRecorderRef.current = null;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  };

  const startListening = async () => {
    try {
      console.log('[audio] Starting live captions');
      setError(null);
      await verifyCaptionAccess();
      shouldKeepListeningRef.current = true;
      lastCaptionTextRef.current = '';

      const speechStarted = startSpeechRecognition();
      if (!speechStarted) {
        console.log('[audio] SpeechRecognition unavailable; using recorder fallback');
        await startRecorderFallback();
      }

      setIsListening(true);
      console.log('[audio] Live captions started');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Microphone access denied';
      console.error('[audio] Microphone error:', message);
      setError(message);
      shouldKeepListeningRef.current = false;
      setIsListening(false);
    }
  };

  const stopListening = () => {
    console.log('[audio] Stopping live captions');
    shouldKeepListeningRef.current = false;

    if (speechRecognitionRef.current) {
      try {
        speechRecognitionRef.current.onend = null;
        speechRecognitionRef.current.stop();
        speechRecognitionRef.current.abort();
      } catch {
        // ignore
      }
      speechRecognitionRef.current = null;
    }

    stopRecorderFallback();
    setIsListening(false);
    console.log('[audio] Live captions stopped');
  };

  useEffect(() => {
    if (!enabled) return;

    return () => {
      stopListening();
    };
  }, [enabled]);

  const isEmbedded = Boolean(className);
  const wrapperClassName = className || 'fixed bottom-20 left-4 z-40 flex flex-col gap-2';
  const statusClassName = isEmbedded
    ? 'absolute left-0 top-11 z-50 min-w-max rounded px-3 py-1 text-xs shadow-lg'
    : 'rounded px-3 py-1 text-xs';

  return (
    <div className={wrapperClassName}>
      <button
        onClick={isListening ? stopListening : startListening}
        className={buttonClassName || `flex h-9 items-center gap-2 whitespace-nowrap rounded-xl px-3 text-sm font-semibold text-white shadow-xl transition-all ${ isListening ? 'bg-red-500 hover:bg-red-600' : 'bg-zinc-700 hover:bg-zinc-700' }`}
        aria-label={isListening ? 'Stop captions' : 'Start captions'}
        title={isListening ? 'Stop captions' : 'Start captions'}
      >
        <div
          className={`h-2.5 w-2.5 rounded-full ${ isListening ? 'animate-pulse bg-red-500' : 'bg-zinc-700' }`}
        />
        <span className={labelClassName}>{isListening ? 'Stop captions' : 'Start captions'}</span>
      </button>

      {error && (
        <div className={`${statusClassName} bg-red-900/90 text-red-100`}>
          {error}
        </div>
      )}

      {isListening && (
        <div className={`${statusClassName} bg-zinc-700/90 text-zinc-300`}>
          Listening...
        </div>
      )}
    </div>
  );
}

function getSupportedAudioMimeType() {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
    return '';
  }

  // Safari records AAC in MP4, while Chromium is most reliable with Opus in
  // WebM. Choosing the native container avoids uploads that cannot be decoded
  // by the transcription service.
  const isAppleWebKit = /applewebkit/i.test(navigator.userAgent) && !/android/i.test(navigator.userAgent);
  const mimeTypes = isAppleWebKit ? APPLE_RECORDER_MIME_TYPES : RECORDER_MIME_TYPES;
  return mimeTypes.find((type) => MediaRecorder.isTypeSupported(type)) || '';
}

function getAudioExtension(mimeType: string) {
  const normalizedMimeType = mimeType.toLowerCase();

  if (normalizedMimeType.includes('ogg')) {
    return 'ogg';
  }

  if (normalizedMimeType.includes('mp4')) {
    return 'mp4';
  }

  return 'webm';
}

function normalizeSpeakerName(value?: string) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeSpeakerId(value?: string) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9@._:-]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalized || '';
}
