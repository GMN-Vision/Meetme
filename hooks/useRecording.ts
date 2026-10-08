'use client';
import { useCallback, useEffect, useState } from 'react';

type ServerRecording = { recordingId?: string; status: string; startedAt?: string; maxDurationSeconds?: number };
export function useRecording(roomName: string) {
  const [recording, setRecording] = useState<ServerRecording | null>(null);
  const [canRecord, setCanRecord] = useState(false);
  const [canStop, setCanStop] = useState(false);
  const [unavailableReason, setUnavailableReason] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const refresh = useCallback(async (signal?: AbortSignal) => {
    if (!roomName) return;
    const response = await fetch('/api/recording/status?roomName=' + encodeURIComponent(roomName), { cache: 'no-store', signal });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || 'Unable to load recording status.');
    if (signal?.aborted) return;
    setRecording(body.recording || null);
    setCanRecord(Boolean(body.canRecord));
    setCanStop(Boolean(body.canStop));
    setUnavailableReason(body.unavailableReason || null);
  }, [roomName]);
  useEffect(() => {
    setRecording(null); setCanRecord(false); setCanStop(false); setUnavailableReason(null); setError(null);
    if (!roomName) return;
    const controller = new AbortController();
    const poll = () => { void refresh(controller.signal).catch((err) => { if (!controller.signal.aborted) setError(err.message); }); };
    poll();
    const interval = setInterval(poll, 5000);
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => { controller.abort(); clearInterval(interval); clearInterval(timer); };
  }, [roomName, refresh]);
  const command = useCallback(async (action: 'start' | 'stop', room = roomName) => {
    if (action === 'start' && !canRecord) {
      setError(unavailableReason || 'Only the meeting host can start recording.');
      return;
    }
    setLoading(true); setError(null);
    try {
      const response = await fetch('/api/recording/' + action, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ roomName: room }),
      });
      const body = await response.json();
      if (body.code === 'RECORDING_NOT_CONFIGURED') {
        setCanRecord(false);
        setUnavailableReason(body.error);
      }
      if (!response.ok) throw new Error(body.error || 'Recording request failed.');
      setRecording(body.recording || null);
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  }, [roomName, canRecord, unavailableReason]);
  const elapsedSeconds = recording?.startedAt ? Math.max(0, Math.floor((now - Date.parse(recording.startedAt)) / 1000)) : 0;
  const isRecording = recording?.status === 'recording';
  return {
    isRecording, canRecord, canStop, unavailableReason, recordingId: recording?.recordingId || null,
    status: recording?.status || 'idle',
    loading: loading || recording?.status === 'starting' || recording?.status === 'processing',
    error, elapsedSeconds,
    elapsedTime: [Math.floor(elapsedSeconds / 3600), Math.floor(elapsedSeconds / 60) % 60, elapsedSeconds % 60].map(n => String(n).padStart(2, '0')).join(':'),
    startRecording: (room: string) => command('start', room),
    stopRecording: (room?: string) => command('stop', room),
    clearError: () => setError(null),
  };
}
