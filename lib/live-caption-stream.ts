import { getMeetingApprovalToken } from '@/lib/meeting-approval-client';

/**
 * Streaming models that transcribe more than one language and accept the
 * `language_detection` flag. Universal-3.6 Pro code-switches natively across
 * its 32 supported languages, so no language has to be picked up front.
 */
const LANGUAGE_DETECTION_MODELS = new Set([
  'universal-3-6-pro',
  'universal-streaming-multilingual',
]);

const DEFAULT_SPEECH_MODEL = 'universal-3-6-pro';

export function resolveCaptionSpeechModel(model?: string | null) {
  return String(model || '').trim() || DEFAULT_SPEECH_MODEL;
}

/** Streams microphone audio without browser language locking or batch uploads. */
export async function startLiveCaptionStream(meetingId: string, signal: AbortSignal, onCaption: (text: string, final: boolean) => void, onError: (message: string) => void) {
  let stream: MediaStream | undefined;
  let context: AudioContext | undefined;
  let socket: WebSocket | undefined;
  let node: AudioWorkletNode | undefined;
  let stopped = false;
  let droppedPackets = 0;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    node?.disconnect();
    stream?.getTracks().forEach(track => track.stop());
    if (context && context.state !== 'closed') void context.close().catch(() => {});
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'Terminate' }));
    socket?.close();
    signal.removeEventListener('abort', stop);
  };
  signal.addEventListener('abort', stop, { once: true });
  const check = () => { if (signal.aborted || stopped) throw new DOMException('Cancelled', 'AbortError'); };
  try {
    check();
    stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true }, video: false });
    if (stopped) stream.getTracks().forEach(track => track.stop());
    check();
    context = new AudioContext({ sampleRate: 16000 });
    await context.resume();
    await context.audioWorklet.addModule('/caption-audio-worklet.js');
    check();
    const response = await fetch('/api/captions/token', { method: 'POST', signal, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getMeetingApprovalToken(meetingId)}` }, body: JSON.stringify({ meetingId }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Could not start captions.');
    check();
    const speechModel = resolveCaptionSpeechModel(data.model);
    const params = new URLSearchParams({ token: data.token, sample_rate: String(context.sampleRate), speech_model: speechModel });
    // The provider picks the spoken language on its own; this flag only asks it
    // to report the language of each turn. English-only models reject it, so it
    // is sent only to models that support it.
    if (LANGUAGE_DETECTION_MODELS.has(speechModel)) params.set('language_detection', 'true');
    socket = new WebSocket(`wss://streaming.assemblyai.com/v3/ws?${params}`);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Caption connection timed out.')), 10000);
      const finish = (error?: Error) => { clearTimeout(timer); error ? reject(error) : resolve(); };
      socket!.onopen = () => finish();
      socket!.onerror = () => finish(new Error('Could not connect to live transcription.'));
      socket!.onclose = () => finish(new Error('Live transcription disconnected.'));
    });
    check();
    const fail = () => { if (!stopped) { stop(); onError('Live transcription disconnected. Turn subtitles on to reconnect.'); } };
    socket.onclose = fail;
    socket.onerror = fail;
    socket.onmessage = event => {
      if (stopped) return;
      try {
        const message = JSON.parse(event.data);
        if (message.error || message.type === 'Termination') { fail(); return; }
        if (message.type === 'Turn' && typeof message.transcript === 'string' && message.transcript.trim()) onCaption(message.transcript, message.end_of_turn === true);
      } catch { /* Ignore non-transcript provider messages. */ }
    };
    node = new AudioWorkletNode(context, 'caption-audio');
    node.port.onmessage = event => {
      if (stopped || socket?.readyState !== WebSocket.OPEN) return;
      // A stalled uplink should drop audio, not end the whole subtitle session.
      if (socket.bufferedAmount > 96000) {
        droppedPackets += 1;
        if (droppedPackets === 1) console.warn('[captions] uplink is backed up, dropping audio packets');
        return;
      }
      socket.send(event.data);
    };
    context.createMediaStreamSource(stream).connect(node);
    const silent = context.createGain();
    silent.gain.value = 0;
    node.connect(silent).connect(context.destination);
    return stop;
  } catch (error) { stop(); throw error; }
}
