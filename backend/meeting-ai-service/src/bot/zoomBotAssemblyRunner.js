'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { spawn, execFileSync } = require('child_process');
const { chromium } = require('playwright');
const dotenv = require('dotenv');
const WebSocketModule = require('ws');
const { createJitsiBotToken } = require('./jitsiJwt');
const { getRealtimeSpeakerLabel } = require('./assemblyAiSpeaker');

dotenv.config({ path: path.resolve(process.cwd(), '../../.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const CAPTION_BACKEND_URL = (process.env.CAPTION_BACKEND_URL || `http://localhost:${process.env.MEETING_AI_PORT || 4010}`).replace(/\/$/, '');
const ASSEMBLYAI_API_KEY = process.env.ASSEMBLYAI_API_KEY || process.env.AAI_API_KEY || '';
const ASSEMBLYAI_WS_URL = process.env.ASSEMBLYAI_WS_BASE_URL || 'wss://streaming.assemblyai.com/v3/ws';
const ASSEMBLYAI_SPEECH_MODEL = process.env.ASSEMBLYAI_SPEECH_MODEL || 'u3-rt-pro';
const ASSEMBLYAI_TRANSCRIBE_LANGUAGE = process.env.ASSEMBLYAI_TRANSCRIBE_LANGUAGE || process.env.AAI_TRANSCRIBE_LANGUAGE || '';
const BOT_NAME = process.env.BOT_DISPLAY_NAME || 'Melanam Note Bot';
const BOT_JOIN_WITHOUT_AUDIO = process.env.BOT_JOIN_WITHOUT_AUDIO !== '0';
const BOT_CAPTURE_LOOPBACK = process.env.BOT_CAPTURE_LOOPBACK !== '0';
const AAI_AUDIO_SEND_MODE = (process.env.AAI_AUDIO_SEND_MODE || 'binary').toLowerCase();
const BOT_AUDIO_CAPTURE_MODE = (process.env.BOT_AUDIO_CAPTURE_MODE || '').toLowerCase();
const BOT_MEETING_PLATFORM = (process.env.BOT_MEETING_PLATFORM || '').toLowerCase();
const BOT_JITSI_TOKEN = process.env.BOT_JITSI_TOKEN || '';
const JITSI_CONFIG_CACHE = new Map();

function buildAssemblyAiWsUrl() {
  const url = new URL(ASSEMBLYAI_WS_URL);
  url.searchParams.set('token', ASSEMBLYAI_API_KEY);
  url.searchParams.set('sample_rate', String(Number(process.env.ASSEMBLYAI_SAMPLE_RATE || 16000)));
  url.searchParams.set('speech_model', ASSEMBLYAI_SPEECH_MODEL);
  url.searchParams.set('speaker_labels', 'true');
  return url.toString();
}

function listDshowAudioDevices(ffmpegBin) {
  try {
    execFileSync(ffmpegBin, ['-hide_banner', '-list_devices', 'true', '-f', 'dshow', '-i', 'dummy'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return [];
  } catch (error) {
    const output = `${error.stdout || ''}\n${error.stderr || ''}`;
    const audioDevices = [];
    const seen = new Set();

    for (const match of output.matchAll(/"([^"]+)"\s+\(audio\)/g)) {
      const device = match[1];
      if (!seen.has(device)) {
        seen.add(device);
        audioDevices.push(device);
      }
    }

    for (const match of output.matchAll(/Alternative name "([^"]+)"/g)) {
      const device = match[1];
      if (!seen.has(device)) {
        seen.add(device);
        audioDevices.push(device);
      }
    }

    if (audioDevices.length > 0) {
      return audioDevices;
    }

    console.log('[audio-stream] Could not enumerate dshow devices:', error.message);
    return [];
  }
}

function normalizeDeviceName(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function getWindowsDshowCandidates(ffmpegBin, preferredDevice) {
  const discovered = listDshowAudioDevices(ffmpegBin);
  const preferred = String(preferredDevice || '').trim();
  const candidates = [];

  if (preferred) {
    candidates.push(preferred);
  }

  const preferredNorm = normalizeDeviceName(preferred);
  if (preferredNorm && discovered.length > 0) {
    const match = discovered.find((device) => {
      const normalized = normalizeDeviceName(device);
      return normalized.includes(preferredNorm) || preferredNorm.includes(normalized);
    });

    if (match && !candidates.includes(match)) {
      candidates.push(match);
    }
  }

  for (const device of discovered) {
    if (!candidates.includes(device)) {
      candidates.push(device);
    }
  }

  return candidates;
}

function resolveFfmpegAudioDevice(platform, format) {
  if (platform === 'linux') {
    return process.env.BOT_PULSE_SOURCE || 'default';
  }

  if (platform === 'win32') {
    if (process.env.BOT_AUDIO_DEVICE) {
      return process.env.BOT_AUDIO_DEVICE;
    }

    if (format === 'dshow' && BOT_CAPTURE_LOOPBACK) {
      return 'Stereo Mix';
    }

    if (format === 'wasapi') {
      return process.env.BOT_WASAPI_DEVICE || 'default';
    }

    const ffmpegBin = resolveFfmpegBinary();
    const devices = listDshowAudioDevices(ffmpegBin);

    if (devices.length > 0) {
      const preferred = devices.find((device) => !/stereo mix/i.test(device)) || devices[0];
      console.log('[audio-stream] Found dshow audio devices:', devices);
      return preferred;
    }

    return 'default';
  }

  if (platform === 'darwin') {
    return ':0';
  }

  return 'default';
}

function resolveFfmpegFormat(platform) {
  if (platform === 'linux') {
    return 'pulse';
  }
  if (platform === 'win32') {
    return process.env.BOT_USE_DSHOW === '1' ? 'dshow' : 'wasapi';
  }
  if (platform === 'darwin') {
    return 'avfoundation';
  }
  return 'pulse';
}

function getWindowsRealtimeDshowCandidates(ffmpegBin) {
  const discovered = listDshowAudioDevices(ffmpegBin);
  const loopbackPattern = /(stereo mix|what u hear|what-u-hear|wave out mix|waveout mix|loopback|cable output|vb-audio|virtual audio|monitor)/i;
  const fallbackCandidates = [
    'Stereo Mix (Realtek(R) Audio)',
    'Stereo Mix',
    'Microphone Array (Realtek(R) Audio)',
    'Microphone Array',
    'default',
  ];
  const envCandidates = String(process.env.BOT_DSHOW_AUDIO_DEVICES || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  if (process.env.BOT_AUDIO_DEVICE) {
    return [process.env.BOT_AUDIO_DEVICE];
  }

  if (envCandidates.length > 0) {
    return envCandidates;
  }

  if (BOT_CAPTURE_LOOPBACK) {
    const loopbackCandidates = discovered.filter((device) => loopbackPattern.test(device));
    if (loopbackCandidates.length > 0) {
      return [...loopbackCandidates, ...fallbackCandidates.filter((device) => !loopbackCandidates.includes(device))];
    }

    if (discovered.length > 0) {
      console.warn(
        '[audio-stream] No loopback-style DirectShow device found; trying available audio devices. Set BOT_AUDIO_DEVICE to override.'
      );
    }
  }

  return [...new Set([...discovered, ...fallbackCandidates])].filter(Boolean);
}

function supportsWindowsWasapi(ffmpegBin) {
  try {
    const devices = execFileSync(ffmpegBin, ['-hide_banner', '-devices'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    return /\bwasapi\b/i.test(devices);
  } catch (error) {
    console.warn('[audio-stream] Could not inspect ffmpeg devices for WASAPI support:', error.message);
    return false;
  }
}

function normalizeTranscriptText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

async function publishCaption(meetingId, payload) {
  console.log('[PUBLISH CAPTION]', payload);
  const response = await fetch(`${CAPTION_BACKEND_URL}/api/rooms/${encodeURIComponent(meetingId)}/captions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Caption publish failed: ${response.status} ${body}`);
  }
}

function createAssemblyAiTranscriptHandler(meetingId) {
  const lastBySpeaker = new Map();

  return async (rawMessage) => {
    let message;

    try {
      message = JSON.parse(rawMessage.toString());
      console.log('[AAI PARSED]', JSON.stringify(message, null, 2));
    } catch {
      return;
    }

    if (message?.error) {
      const errorMessage = typeof message.error === 'string' ? message.error : JSON.stringify(message.error);
      throw new Error(`AssemblyAI error: ${errorMessage}`);
    }

    const messageType = String(message?.type || message?.message_type || '').trim();
    const normalizedType = messageType.toLowerCase();

    const isFinal = Boolean(
      message?.final ||
      message?.is_final ||
      normalizedType === 'turn' && Boolean(message?.end_of_turn) ||
      normalizedType === 'finaltranscript' ||
      normalizedType === 'final'
    );

    if (normalizedType === 'begin') {
      console.log('[aai] session began:', message?.id || message?.session_id || 'unknown');
      return;
    }

    if (normalizedType === 'termination') {
      console.log(
        '[aai] session terminated:',
        `audio=${message?.audio_duration_seconds ?? 'unknown'}s`,
        `session=${message?.session_duration_seconds ?? 'unknown'}s`
      );
      return;
    }

    const text = normalizeTranscriptText(message?.transcript || message?.text || message?.utterance || '');
    console.log('[AAI TEXT]', {
      transcript: message?.transcript,
      text: message?.text,
      utterance: message?.utterance,
      normalized: text,
      final: isFinal,
      type: message.type || message.message_type,
    });

    if (!text) {
      return;
    }

    const isPartial = !isFinal;
    const { speakerId, speakerName } = getRealtimeSpeakerLabel(message);
    const lastText = lastBySpeaker.get(speakerId);

    if (!isFinal && lastText === text) {
      return;
    }

    if (isFinal || lastText !== text) {
      lastBySpeaker.set(speakerId, text);
      await publishCaption(meetingId, {
        text,
        speaker: speakerName,
        speakerId,
        final: isFinal,
        partial: isPartial,
        timestamp: typeof message?.timestamp === 'number' ? message.timestamp : Date.now(),
      });
    }
  };
}

function buildAudioCaptureArgs(platform) {
  const ffmpegBin = resolveFfmpegBinary();
  let format = resolveFfmpegFormat(platform);

  if (platform === 'win32' && format === 'wasapi' && !supportsWindowsWasapi(ffmpegBin)) {
    console.warn('[audio-stream] WASAPI is not available in this ffmpeg build; falling back to DirectShow');
    format = 'dshow';
  }

  const device = resolveFfmpegAudioDevice(platform, format);
  const args = ['-hide_banner', '-loglevel', 'error'];

  if (format === 'wasapi') {
    args.push('-f', 'wasapi', '-i', device);
  } else if (format === 'dshow') {
    args.push('-f', 'dshow', '-i', `audio=${device}`);
  } else {
    args.push('-f', format, '-i', device);
  }

  args.push('-ac', '1', '-ar', '16000', '-f', 's16le', '-');

  return { args, device, format, ffmpegBin };
}

async function startWindowsRealtimeDshowStream(aaiWebSocket, ffmpegBin) {
  const candidates = getWindowsRealtimeDshowCandidates(ffmpegBin);

  if (candidates.length === 0) {
    throw new Error('No Windows dshow audio devices found for realtime capture. Set BOT_AUDIO_DEVICE or BOT_DSHOW_AUDIO_DEVICES to an available device.');
  }

  console.log(`[audio-stream] Windows dshow candidates: ${candidates.join(', ')}`);

  for (const deviceName of candidates) {
    const ffmpegCmd = [
      '-hide_banner',
      '-loglevel', 'error',
      '-f', 'dshow',
      '-i', `audio=${deviceName}`,
      '-ac', '1',
      '-ar', '16000',
      '-f', 's16le',
      '-',
    ];

    console.log(`[audio-stream] trying Windows dshow device "${deviceName}"`);
    const ffmpeg = spawn(ffmpegBin, ffmpegCmd, { stdio: ['pipe', 'pipe', 'pipe'], shell: false });
    let receivedAudio = false;
    let settled = false;

    const fail = (error) => {
      if (settled) {
        return;
      }

      settled = true;

      if (!ffmpeg.killed) {
        try {
          ffmpeg.kill('SIGKILL');
        } catch {
          // ignore
        }
      }

      throw error;
    };

    ffmpeg.stderr.on('data', (chunk) => {
      const line = chunk.toString().trim();
      if (line) {
        console.error(`[ffmpeg] ${line}`);
      }
    });

    const readyPromise = new Promise((resolve, reject) => {
      ffmpeg.stdout.on('data', (chunk) => {
        receivedAudio = true;

        if (aaiWebSocket.readyState === WebSocketModule.OPEN) {
          try {
            sendAudioChunkToAssemblyAI(aaiWebSocket, chunk);
          } catch (error) {
            console.error('[audio-stream] Failed to send audio to AssemblyAI:', error.message);
          }
        }

        if (!settled) {
          settled = true;
          resolve(ffmpeg);
        }
      });

      ffmpeg.on('exit', (code) => {
        console.log(`[audio-stream] ffmpeg exited with code ${code}`);

        if (!receivedAudio && !settled) {
          settled = true;
          reject(new Error(`Windows dshow device "${deviceName}" could not start (code ${code})`));
        }
      });

      ffmpeg.on('error', (error) => {
        if (!settled) {
          settled = true;
          reject(error);
        }
      });

      setTimeout(() => {
        if (!settled && !receivedAudio) {
          reject(new Error(`Windows dshow device "${deviceName}" produced no audio data`));
        }
      }, Number(process.env.BOT_AUDIO_STARTUP_TIMEOUT_MS || 8000));
    });

    try {
      return await readyPromise;
    } catch (error) {
      console.error(`[audio-stream] device "${deviceName}" failed: ${error.message}`);
      if (candidates[candidates.length - 1] === deviceName) {
        throw new Error(`All Windows dshow audio devices failed: ${candidates.join(', ')}`);
      }
    }
  }

  throw new Error(`All Windows dshow audio devices failed: ${candidates.join(', ')}`);
}

function resolveFfmpegBinary() {
  if (process.env.BOT_FFMPEG_PATH) {
    return process.env.BOT_FFMPEG_PATH;
  }

  if (os.platform() === 'win32') {
    const localAppData = process.env.LOCALAPPDATA;
    if (localAppData) {
      const wingetPackages = path.join(localAppData, 'Microsoft', 'WinGet', 'Packages');
      if (fs.existsSync(wingetPackages)) {
        const stack = [wingetPackages];

        while (stack.length > 0) {
          const currentDir = stack.pop();
          const entries = fs.readdirSync(currentDir, { withFileTypes: true });

          for (const entry of entries) {
            const fullPath = path.join(currentDir, entry.name);
            if (entry.isDirectory()) {
              stack.push(fullPath);
              continue;
            }

            if (entry.isFile() && entry.name.toLowerCase() === 'ffmpeg.exe') {
              return fullPath;
            }
          }
        }
      }
    }
  }

  if (os.platform() === 'win32') {
    const localAppData = process.env.LOCALAPPDATA;
    if (localAppData) {
      const base = path.join(localAppData, 'ms-playwright');
      if (fs.existsSync(base)) {
        const entries = fs
          .readdirSync(base)
          .filter((name) => name.startsWith('ffmpeg-'))
          .sort()
          .reverse();

        for (const entry of entries) {
          const candidate = path.join(base, entry, 'ffmpeg-win64.exe');
          if (fs.existsSync(candidate)) {
            return candidate;
          }
        }
      }
    }
  }

  return 'ffmpeg';
}

function parseArgs() {
  const meetingId = process.argv[2];
  const meetingUrl = process.argv[3];
  const botNameArg = process.argv[4];

  if (!meetingId || !meetingUrl) {
    console.error('Usage: node src/bot/zoomBotAssemblyRunner.js <meetingId> <zoomMeetingUrl> [botName]');
    process.exit(1);
  }

  if (!ASSEMBLYAI_API_KEY) {
    console.error('ASSEMBLYAI_API_KEY (or AAI_API_KEY) is required.');
    process.exit(1);
  }

  return {
    meetingId,
    meetingUrl,
    botName: botNameArg || BOT_NAME,
    headless: (process.env.BOT_HEADLESS ?? process.env.HEADLESS ?? '1') !== '0',
    platform: BOT_MEETING_PLATFORM,
    jitsiToken: BOT_JITSI_TOKEN,
  };
}

function extractZoomMeetingId(url) {
  const match = url.match(/zoom\.us\/(?:j|wc\/join)\/(\d+)/i);
  return match ? match[1] : 'unknown';
}

function extractZoomPassword(url) {
  const match = url.match(/[?&]pwd=([^&]+)/);
  return match ? match[1] : '';
}

function extractZoomDomain(url) {
  const match = url.match(/https?:\/\/([^/]+)\//);
  return match ? match[1] : 'zoom.us';
}

function constructWebClientUrl(url) {
  const meetingId = extractZoomMeetingId(url);
  const password = extractZoomPassword(url);
  const domain = extractZoomDomain(url);
  let webUrl = `https://${domain}/wc/join/${meetingId}`;
  if (password) {
    webUrl += `?pwd=${password}`;
  }
  return webUrl;
}

function resolveJoinUrl(url) {
  if (/zoom\.us/i.test(url)) {
    return constructWebClientUrl(url);
  }

  return url;
}

function sanitizeForPath(value) {
  return String(value || 'meeting').replace(/[^a-z0-9_-]/gi, '_');
}

async function closeZoomAppDialog(page) {
  const selectors = [
    'button:has-text("Close this popover")',
    'button[aria-label="Close this popover"]',
    'button[title="Close this popover"]',
    'button:has-text("Close")',
  ];

  for (const selector of selectors) {
    try {
      const button = page.locator(selector).first();
      if (await button.isVisible({ timeout: 1500 })) {
        await button.click();
        await page.waitForTimeout(800);
        return;
      }
    } catch {
      // ignore and continue
    }
  }
}

async function clickJoinFromBrowser(page) {
  try {
    const button = page.locator('button:has-text("Join from browser")');
    if (await button.isVisible({ timeout: 4000 })) {
      await button.click();
      await page.waitForTimeout(2000);
    }
  } catch {
    // not present for many meeting types
  }
}

async function clickJoinWithoutAudio(page) {
  try {
    const button = page.locator('button:has-text("Join without audio")');
    if (await button.isVisible({ timeout: 4000 })) {
      await button.click({ force: true });
      await page.waitForTimeout(2000);
    }
  } catch {
    // not present in some flows
  }
}

async function fillName(page, botName) {
  const selectors = [
    'input[placeholder*="name"]',
    'input[placeholder*="Name"]',
    'input[placeholder*="Enter your name"]',
    'input[placeholder*="Your name"]',
    'input[aria-label*="name"]',
    'input[aria-label*="Name"]',
    'input[name="displayName"]',
    'input[name*="displayName"]',
    'input[type="text"]',
    'input[name*="name"]',
    'input[data-testid*="name"]',
    'input[data-testid*="display-name"]',
    '#input-for-name',
  ];

  for (const selector of selectors) {
    try {
      const input = page.locator(selector).first();
      if (await input.isVisible({ timeout: 1500 })) {
        await input.fill(botName);
        return;
      }
    } catch {
      // ignore and continue
    }
  }
}

async function clickJoin(page) {
  const selectors = [
    'button:has-text("Join meeting")',
    'button:has-text("Join now")',
    'button:has-text("Join")',
    'button[aria-label*="Join meeting"]',
    'button[aria-label*="Join now"]',
    'button[aria-label*="Join"]',
    'button:has-text("Ask to Join")',
    'button:has-text("Ask to join")',
  ];

  for (const selector of selectors) {
    try {
      const button = page.locator(selector).first();
      if (await button.isVisible({ timeout: 2000 })) {
        await button.click({ force: true });
        return;
      }
    } catch {
      // ignore and continue
    }
  }
}

async function hasVisibleSelector(page, selectors) {
  for (const selector of selectors) {
    try {
      const locator = page.locator(selector).first();
      if (await locator.isVisible({ timeout: 1000 })) {
        return true;
      }
    } catch {
      // ignore and continue
    }
  }

  return false;
}

async function getZoomPageStatus(page) {
  const joinSelectors = [
    'button:has-text("Join meeting")',
    'button:has-text("Join now")',
    'button:has-text("Join")',
    'button:has-text("Join without audio")',
    'button:has-text("Ask to Join")',
    'button:has-text("Ask to join")',
    'input[placeholder*="name"]',
    'input[placeholder*="Name"]',
    'input[placeholder*="Enter your name"]',
    'input[placeholder*="Your name"]',
    'input[aria-label*="name"]',
    'input[aria-label*="Name"]',
    'input[name="displayName"]',
    'input[name*="displayName"]',
    'input[type="text"]',
    'input[name*="name"]',
    'input[data-testid*="name"]',
    'input[data-testid*="display-name"]',
    '#input-for-name',
  ];

  const meetingSelectors = [
    'button:has-text("Leave the meeting")',
    'button:has-text("Leave meeting")',
    'button:has-text("Invite people")',
    'button:has-text("Open chat")',
    'button:has-text("Open participants panel")',
    'button:has-text("Mute")',
    'button:has-text("Unmute")',
    'button[aria-label*="Leave meeting"]',
    'button[aria-label*="Leave"]',
    'button[aria-label*="Mute"]',
    'button[aria-label*="Unmute"]',
    'button[aria-label*="Chat"]',
    'button[aria-label*="Participants"]',
  ];

  const [hasJoinControls, hasMeetingControls] = await Promise.all([
    hasVisibleSelector(page, joinSelectors),
    hasVisibleSelector(page, meetingSelectors),
  ]);

  return { hasJoinControls, hasMeetingControls };
}

async function waitUntilInsideMeeting(page) {
  for (let i = 0; i < 60; i += 1) {
    const status = await getZoomPageStatus(page);

    if (status.hasMeetingControls && !status.hasJoinControls) {
      console.log('[bot] ✅ confirmed inside meeting after', i * 2, 'seconds');
      return true;
    }

    await page.waitForTimeout(2000);
  }

  console.warn('[bot] ⚠️ could not confirm meeting state after 120 seconds, but continuing...');
  return false;
}

async function joinZoomMeeting(page, meetingUrl, botName) {
  const webClientUrl = resolveJoinUrl(meetingUrl);
  const joinWithoutAudio = BOT_JOIN_WITHOUT_AUDIO;
  console.log(`[bot] opening ${webClientUrl}`);

  await page.goto(webClientUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);

  await closeZoomAppDialog(page);

  const currentUrl = page.url();
  if (currentUrl.includes('zoom.us/login') || currentUrl.includes('/signin')) {
    throw new Error('ZOOM_LOGIN_REQUIRED');
  }

  await fillName(page, botName);
  console.log('[bot] filled bot display name');
  if (joinWithoutAudio) {
    await clickJoinWithoutAudio(page);
    console.log('[bot] selected join without audio if available');
  } else {
    console.log('[bot] joining with audio path enabled (BOT_JOIN_WITHOUT_AUDIO!=1)');
  }
  await page.waitForTimeout(1000);
  await clickJoin(page);
  console.log('[bot] clicked join button');

  // Jitsi often needs a short beat after the join click before audio can be captured.
  await page.waitForTimeout(7000);

  // Wait to confirm we're actually in the meeting
  const confirmed = await waitUntilInsideMeeting(page);
  if (!confirmed) {
    console.warn('[bot] ⚠️ Meeting join not confirmed, but continuing with audio capture...');
  }

  return true;
}

function ensureFfmpegCaptureSupport(ffmpegBin, platform) {
  let formats = '';
  try {
    formats = execFileSync(ffmpegBin, ['-hide_banner', '-formats'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    throw new Error(`Unable to query ffmpeg formats from ${ffmpegBin}: ${error.message}`);
  }

  if (platform === 'win32') {
    const hasDshow = /\bdshow\b/i.test(formats);
    const hasWasapi = /\bwasapi\b/i.test(formats);
    if (!hasDshow && !hasWasapi) {
      throw new Error(
        'Your ffmpeg build does not support Windows audio capture devices (dshow/wasapi). Install full ffmpeg and set BOT_FFMPEG_PATH.'
      );
    }
  }

  if (platform === 'linux' && !/\bpulse\b/i.test(formats)) {
    throw new Error('Your ffmpeg build does not support PulseAudio capture. Install full ffmpeg with pulse input support.');
  }

  if (platform === 'darwin' && !/\bavfoundation\b/i.test(formats)) {
    throw new Error('Your ffmpeg build does not support AVFoundation capture. Install full ffmpeg with avfoundation input support.');
  }
}

function bufferToBase64(buffer) {
  return Buffer.from(buffer).toString('base64');
}

function calculateRmsFromBuffer(buffer) {
  // buffer should be s16le (2 bytes per sample, little-endian)
  if (buffer.length < 2) return 0;
  
  let sum = 0;
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const samples = buffer.length / 2;
  
  for (let i = 0; i < samples; i++) {
    const sample = view.getInt16(i * 2, true) / 32768; // normalize to -1..1
    sum += sample * sample;
  }
  
  return Math.sqrt(sum / samples);
}

function isAudioSilent(rms) {
  // RMS < 0.001 is near-silence; > 0.01 is likely speech
  return rms < 0.001;
}

async function validateAudioFile(filePath) {
  const stats = fs.statSync(filePath);
  const fileSize = stats.size;
  
  // Read entire file as buffer
  const buffer = fs.readFileSync(filePath);
  
  // PCM s16le: 16kHz, 1 channel, 16-bit = 32000 bytes per second
  // For 10 seconds: ~320KB (some WAV header overhead, ~44 bytes)
  const expectedMinSize = 16000 * 2 * 10 - 100; // conservative minimum
  const expectedMaxSize = 16000 * 2 * 10 + 500; // with WAV header + margin
  
  const rms = calculateRmsFromBuffer(buffer.slice(-Math.min(160000, buffer.length))); // last 5 seconds of audio data
  const isSilent = isAudioSilent(rms);
  
  // Estimate duration (rough, doesn't account for WAV header perfectly)
  // WAV header is typically 44 bytes for simple mono PCM
  const audioDataSize = Math.max(0, buffer.length - 100);
  const estimatedDurationSeconds = audioDataSize / (16000 * 2);
  
  return {
    fileSize,
    rms,
    isSilent,
    estimatedDurationSeconds,
    isValid: !isSilent && estimatedDurationSeconds >= 9, // at least 9 seconds of actual audio
  };
}

function recordAudioToFile(filePath, recordDurationSeconds = 10) {
  const platform = os.platform();
  const customDevice = process.env.BOT_AUDIO_DEVICE;

  if (platform === 'win32') {
    const ffmpegBin = resolveFfmpegBinary();
    const candidates = getWindowsDshowCandidates(ffmpegBin, customDevice || 'Stereo Mix');

    if (candidates.length === 0) {
      throw new Error('No Windows dshow audio devices found. Set BOT_AUDIO_DEVICE or enable a recording device.');
    }

    console.log('[audio-record] Windows dshow candidate list:', candidates);
    return recordAudioWithWindowsDshow(ffmpegBin, filePath, recordDurationSeconds, candidates);
  } else if (platform === 'linux') {
    // Linux: PulseAudio - capture loopback (monitor)
    const pulseDevice = customDevice || 'alsa_output.pci-0000_00_1f.3.analog-stereo.monitor';
    ffmpegCmd = [
      '-hide_banner',
      '-loglevel', 'warning',
      '-f', 'pulse',
      '-i', pulseDevice,
      '-ac', '1',
      '-ar', '16000',
      '-t', String(recordDurationSeconds),
      '-y',
      filePath,
    ];
    console.log(`[audio-record] Linux PulseAudio: using device "${pulseDevice}"`);
  } else if (platform === 'darwin') {
    // macOS: AVFoundation - :1 is typically Soundflower or loopback
    const avfDevice = customDevice || ':1';
    ffmpegCmd = [
      '-hide_banner',
      '-loglevel', 'warning',
      '-f', 'avfoundation',
      '-i', avfDevice,
      '-ac', '1',
      '-ar', '16000',
      '-t', String(recordDurationSeconds),
      '-y',
      filePath,
    ];
    console.log(`[audio-record] macOS AVFoundation: using device "${avfDevice}"`);
  }

  const ffmpegBin = resolveFfmpegBinary();
  
  console.log(`[audio-record] starting ffmpeg`);
  console.log(`[audio-record] recording to: ${filePath}`);
  console.log(`[audio-record] duration: ${recordDurationSeconds} seconds`);
  console.log(`[audio-record] ffmpeg binary: ${ffmpegBin}`);

  return new Promise((resolve, reject) => {
    const ffmpeg = spawn(ffmpegBin, ffmpegCmd, { 
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false
    });

    let errorOutput = '';
    let outputData = '';
    
    ffmpeg.stderr.on('data', (chunk) => {
      const line = chunk.toString();
      errorOutput += line;
      // Log ffmpeg progress
      if (line.includes('frame=') || line.includes('Duration')) {
        console.log(`[ffmpeg] ${line.trim()}`);
      }
    });

    ffmpeg.stdout.on('data', (chunk) => {
      outputData += chunk.toString();
    });

    ffmpeg.on('exit', (code, signal) => {
      console.log(`[audio-record] ffmpeg exited: code=${code}, signal=${signal}`);
      
      // Check if file was created
      if (fs.existsSync(filePath)) {
        const stats = fs.statSync(filePath);
        const sizeKB = (stats.size / 1024).toFixed(2);
        console.log(`[audio-record] ✅ File created: ${sizeKB} KB`);
        resolve();
      } else {
        console.log(`[audio-record] ❌ No file created at ${filePath}`);
        
        // On Windows, if Stereo Mix failed, suggest checking settings
        if (os.platform() === 'win32' && errorOutput.includes('Stereo Mix')) {
          console.error(`[audio-record] ⚠️  Stereo Mix not found or disabled`);
          console.error(`[audio-record] To enable audio capture on Windows:`);
          console.error(`[audio-record]   1. Right-click volume icon → Sound settings`);
          console.error(`[audio-record]   2. Advanced → App volume and device preferences`);
          console.error(`[audio-record]   3. Find ffmpeg → Choose output → Stereo Mix`);
          console.error(`[audio-record] OR`);
          console.error(`[audio-record]   Set env var: BOT_AUDIO_DEVICE="Microphone"`);
        }
        
        if (code !== 0) {
          console.error(`[audio-record] ffmpeg error:\n${errorOutput.slice(0, 500)}`);
          reject(new Error(`ffmpeg failed with code ${code}`));
        } else {
          reject(new Error('ffmpeg exited but did not create output file'));
        }
      }
    });

    ffmpeg.on('error', (err) => {
      console.error(`[audio-record] ❌ ffmpeg error: ${err.message}`);
      reject(err);
    });

    // Force kill after timeout
    const killTimeout = setTimeout(() => {
      if (!ffmpeg.killed) {
        console.log(`[audio-record] timeout reached, terminating ffmpeg`);
        ffmpeg.kill('SIGTERM');
        setTimeout(() => {
          if (!ffmpeg.killed) {
            ffmpeg.kill('SIGKILL');
          }
        }, 2000);
      }
    }, (recordDurationSeconds + 5) * 1000);

    ffmpeg.on('exit', () => {
      clearTimeout(killTimeout);
    });
  });
}

function recordAudioWithWindowsDshow(ffmpegBin, filePath, recordDurationSeconds, candidates) {
  const tryCandidate = (deviceName) => new Promise((resolve, reject) => {
    const ffmpegCmd = [
      '-hide_banner',
      '-loglevel', 'warning',
      '-f', 'dshow',
      '-i', `audio=${deviceName}`,
      '-ac', '1',
      '-ar', '16000',
      '-t', String(recordDurationSeconds),
      '-y',
      filePath,
    ];

    console.log(`[audio-record] trying Windows dshow device "${deviceName}"`);
    const ffmpeg = spawn(ffmpegBin, ffmpegCmd, { stdio: ['pipe', 'pipe', 'pipe'], shell: false });
    let errorOutput = '';

    ffmpeg.stderr.on('data', (chunk) => {
      errorOutput += chunk.toString();
    });

    ffmpeg.on('exit', (code, signal) => {
      if (fs.existsSync(filePath)) {
        const stats = fs.statSync(filePath);
        console.log(`[audio-record] ✅ File created with "${deviceName}": ${(stats.size / 1024).toFixed(2)} KB`);
        resolve({ deviceName, code, signal });
        return;
      }

      const cleanError = errorOutput.trim();
      console.log(`[audio-record] device "${deviceName}" failed: code=${code}, signal=${signal}`);
      if (cleanError) {
        console.log(`[audio-record] ffmpeg stderr for "${deviceName}":\n${cleanError.slice(0, 500)}`);
      }
      reject(new Error(cleanError || `ffmpeg failed for device ${deviceName} with code ${code}`));
    });

    ffmpeg.on('error', reject);
  });

  return candidates.reduce((chain, deviceName, index) => chain.then(async () => {
    if (index > 0 && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    try {
      await tryCandidate(deviceName);
      return;
    } catch {
      if (index === candidates.length - 1) {
        throw new Error(`All Windows dshow audio devices failed: ${candidates.join(', ')}`);
      }
    }
  }), Promise.resolve());
}

function connectAssemblyAiRealtime(meetingId) {
  return new Promise((resolve, reject) => {
    const aaiUrl = buildAssemblyAiWsUrl();
    console.log('[aai] connecting to AssemblyAI realtime with speaker labels');
    console.log('[aai] Authorization header present?:', ASSEMBLYAI_API_KEY ? `yes (${String(ASSEMBLYAI_API_KEY).length} chars)` : 'no');

    const aaiWebSocket = new WebSocketModule(aaiUrl, {
      headers: {
        Authorization: ASSEMBLYAI_API_KEY,
      },
    });
    const handleTranscript = createAssemblyAiTranscriptHandler(meetingId);

    aaiWebSocket.on('open', () => {
      console.log('[aai] ✅ Connected to AssemblyAI realtime WebSocket');
      resolve(aaiWebSocket);
    });

    aaiWebSocket.on('message', async (raw) => {
        try {
          console.log('\n================ AAI RAW ================');
          try { console.log(raw.toString()); } catch { console.log(String(raw)); }
          console.log('=========================================\n');

          await handleTranscript(raw);
        } catch (error) {
          console.error('[aai] transcript handling error:', error.message);
        }
    });

    aaiWebSocket.on('error', (error) => {
      reject(error);
    });

    aaiWebSocket.on('close', (code, reason) => {
      const reasonText = reason ? reason.toString() : '';
      console.log(`[aai] realtime socket closed: code=${code}${reasonText ? ` reason=${reasonText}` : ''}`);
    });
  });
}

async function startRealtimeAudioStream({ page, aaiWebSocket, meetingUrl, meetingId, botName, platform }) {
  if (shouldUseJitsiAudioCapture(meetingUrl, platform)) {
    console.log('[audio-stream] using Jitsi conference audio capture');
    return startJitsiRealtimeAudioStream({ page, aaiWebSocket, meetingUrl, meetingId, botName });
  }

  const osPlatform = os.platform();
  const { args, device, format, ffmpegBin } = buildAudioCaptureArgs(osPlatform);

  if (osPlatform === 'win32' && format === 'dshow') {
    const ffmpeg = await startWindowsRealtimeDshowStream(aaiWebSocket, ffmpegBin);

    ffmpeg.stop = async () => {
      if (!ffmpeg.killed) {
        try {
          if (ffmpeg.stdin) {
            ffmpeg.stdin.write('q\n');
          }
        } catch {
          // ignore
        }

        await new Promise((resolve) => setTimeout(resolve, 1500));

        if (!ffmpeg.killed) {
          ffmpeg.kill('SIGKILL');
        }
      }
    };

    return ffmpeg;
  }

  ensureFfmpegCaptureSupport(ffmpegBin, osPlatform);
  console.log(`[audio-stream] starting ffmpeg (${osPlatform}) format=${format} device=${device}`);
  console.log(`[audio-stream] using ${ffmpegBin}`);

  const ffmpeg = spawn(ffmpegBin, args, { stdio: ['pipe', 'pipe', 'pipe'] });

  ffmpeg.stderr.on('data', (chunk) => {
    const line = chunk.toString().trim();
    if (line) {
      console.error(`[ffmpeg] ${line}`);
    }
  });

  ffmpeg.on('exit', (code) => {
    console.log(`[audio-stream] ffmpeg exited with code ${code}`);
  });

  if (ffmpeg.stdout) {
    ffmpeg.stdout.on('data', (chunk) => {
      if (aaiWebSocket.readyState === WebSocketModule.OPEN) {
        try {
          sendAudioChunkToAssemblyAI(aaiWebSocket, chunk);
        } catch (error) {
          console.error('[audio-stream] Failed to send audio to AssemblyAI:', error.message);
        }
      }
    });
  }

  ffmpeg.stop = async () => {
    if (!ffmpeg.killed) {
      try {
        if (ffmpeg.stdin) {
          ffmpeg.stdin.write('q\n');
        }
      } catch {
        // ignore
      }

      await new Promise((resolve) => setTimeout(resolve, 1500));

      if (!ffmpeg.killed) {
        ffmpeg.kill('SIGKILL');
      }
    }
  };

  return ffmpeg;
}

function sendAudioChunkToAssemblyAI(aaiWebSocket, chunk) {
  if (!chunk || aaiWebSocket.readyState !== WebSocketModule.OPEN) {
    return;
  }

  if (AAI_AUDIO_SEND_MODE !== 'binary' && !aaiWebSocket.__warnedAudioSendMode) {
    aaiWebSocket.__warnedAudioSendMode = true;
    console.warn(`[aai] AAI_AUDIO_SEND_MODE=${AAI_AUDIO_SEND_MODE} is deprecated for realtime; sending raw binary PCM`);
  }

  aaiWebSocket.send(chunk);
}

function shouldUseJitsiAudioCapture(meetingUrl, platform = '') {
  if (BOT_AUDIO_CAPTURE_MODE === 'jitsi' || platform === 'jitsi') {
    return true;
  }

  try {
    const parsedUrl = new URL(meetingUrl);
    return /(^|\.)jitsi\.|meet\.jit\.si$/i.test(parsedUrl.hostname) || /jitsi/i.test(parsedUrl.hostname);
  } catch {
    return false;
  }
}

function buildJitsiBotToken(meetingUrl, meetingId, botName) {
  if (BOT_JITSI_TOKEN) {
    return BOT_JITSI_TOKEN;
  }

  const secret = process.env.JITSI_JWT_SECRET;
  if (!secret) {
    return '';
  }

  try {
    const parsedUrl = new URL(meetingUrl);
    return createJitsiBotToken({
      meetingId,
      botName,
      domain: parsedUrl.hostname,
      secret,
      issuer: process.env.JITSI_JWT_ISSUER || 'melanam',
    });
  } catch {
    return '';
  }
}

async function loadJitsiDeploymentConfig(meetingUrl) {
  const parsedUrl = new URL(meetingUrl);
  const cacheKey = parsedUrl.origin;

  if (JITSI_CONFIG_CACHE.has(cacheKey)) {
    return JITSI_CONFIG_CACHE.get(cacheKey);
  }

  const configUrl = `${parsedUrl.origin}/config.js`;
  const response = await fetch(configUrl);

  if (!response.ok) {
    throw new Error(`Failed to load Jitsi config: ${response.status} ${response.statusText}`);
  }

  const script = await response.text();
  const context = {
    config: {},
    interfaceConfig: {},
    console: {
      log() {},
      warn() {},
      error() {},
    },
  };

  vm.runInNewContext(script, context, {
    filename: configUrl,
    timeout: 2000,
  });

  const deploymentConfig = context.config || {};
  JITSI_CONFIG_CACHE.set(cacheKey, deploymentConfig);
  return deploymentConfig;
}

async function resolveJitsiJoinConfig(meetingUrl, meetingId, botName) {
  const parsedUrl = new URL(meetingUrl);
  const protocol = parsedUrl.protocol === 'http:' ? 'http:' : 'https:';
  const wsProtocol = protocol === 'http:' ? 'ws:' : 'wss:';
  const pathSegments = parsedUrl.pathname.split('/').map((segment) => segment.trim()).filter(Boolean);
  const rawRoomName = pathSegments.length > 0
    ? decodeURIComponent(pathSegments[pathSegments.length - 1])
    : (parsedUrl.hash ? decodeURIComponent(parsedUrl.hash.replace(/^#/, '').trim()) : meetingId || 'meeting');
  const roomName = String(rawRoomName || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, '');
  let deploymentConfig = {};

  try {
    deploymentConfig = await loadJitsiDeploymentConfig(meetingUrl);
  } catch (error) {
    console.warn('[jitsi-audio] failed to load deployment config, using URL-derived defaults:', error.message);
  }

  const hosts = deploymentConfig.hosts || {};
  const domain = hosts.domain || parsedUrl.hostname;
  const muc = hosts.muc || process.env.BOT_JITSI_MUC_DOMAIN || `conference.${domain}`;
  const anonymousdomain = hosts.anonymousdomain || process.env.BOT_JITSI_ANONYMOUS_DOMAIN || '';
  const focus = hosts.focus || process.env.BOT_JITSI_FOCUS_DOMAIN || `focus.${domain}`;
  const bosh = deploymentConfig.bosh || process.env.BOT_JITSI_BOSH_URL || `${protocol}//${parsedUrl.hostname}/http-bind`;
  const websocket = deploymentConfig.websocket || process.env.BOT_JITSI_WEBSOCKET_URL || `${wsProtocol}//${parsedUrl.hostname}/xmpp-websocket`;
  const serviceUrl = process.env.BOT_JITSI_SERVICE_URL || websocket || bosh;
  const serviceUrls = [...new Set([serviceUrl, websocket, bosh].filter(Boolean))];
  const bridgeChannel = {
    preferSctp: process.env.BOT_JITSI_BRIDGE_CHANNEL !== 'websocket',
  };

  return {
    roomName,
    token: buildJitsiBotToken(meetingUrl, roomName || meetingId, botName),
    connectionOptions: {
      hosts: {
        domain,
        muc,
        focus,
        ...(anonymousdomain ? { anonymousdomain } : {}),
      },
      bosh,
      websocket,
      serviceUrl,
      clientNode: 'https://melanam.com/meeting-ai-bot',
      bridgeChannel,
    },
    serviceUrls,
    bridgeChannel,
  };
}

async function startJitsiRealtimeAudioStream({ page, aaiWebSocket, meetingUrl, meetingId, botName }) {
  const jitsiBundlePath = require.resolve('@joinera/lib-jitsi-meet/dist/umd/lib-jitsi-meet.min.js');
  const jitsiJoinConfig = await resolveJitsiJoinConfig(meetingUrl, meetingId, botName);
  const browserConsoleHandler = (msg) => {
    try {
      const text = msg.text();
      if (text && (/\[jitsi-audio\]/.test(text) || msg.type() === 'error' || msg.type() === 'warning')) {
        console.log(text);
      }
    } catch {
      // ignore
    }
  };
  const pageErrorHandler = (error) => {
    console.error('[jitsi-audio] page error:', error?.message || error);
  };

  page.on('console', browserConsoleHandler);
  page.on('pageerror', pageErrorHandler);
  let deliveredAudioBytes = 0;
  let deliveredAudioChunks = 0;
  let lastAudioStatsAt = Date.now();

  await page.exposeFunction('__botDeliverAudioChunk', async (base64Chunk) => {
    if (aaiWebSocket.readyState !== WebSocketModule.OPEN) {
      return;
    }

    const chunkBuffer = Buffer.from(String(base64Chunk || ''), 'base64');
    deliveredAudioBytes += chunkBuffer.length;
    deliveredAudioChunks += 1;

    const now = Date.now();
    if (now - lastAudioStatsAt >= 5000) {
      console.log(`[jitsi-audio] forwarded pcm chunks=${deliveredAudioChunks} bytes=${deliveredAudioBytes}`);
      lastAudioStatsAt = now;
    }

    sendAudioChunkToAssemblyAI(aaiWebSocket, chunkBuffer);
  });

  await page.addScriptTag({ path: jitsiBundlePath });

  await page.evaluate(async ({ targetMeetingUrl, botDisplayName, joinConfig }) => {
    const JitsiMeetJS = window.JitsiMeetJS;
    if (!JitsiMeetJS) {
      throw new Error('JitsiMeetJS bundle did not load');
    }

    const parsedUrl = new URL(targetMeetingUrl);
    const roomName = joinConfig.roomName;

    JitsiMeetJS.init({});

    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const ensureAudioContextRunning = async () => {
      if (audioContext.state === 'suspended') {
        try {
          await audioContext.resume();
        } catch (error) {
          console.warn('[jitsi-audio] audio context resume failed', error);
        }
      }
    };
    const processor = audioContext.createScriptProcessor(4096, 1, 1);
    const mixer = audioContext.createGain();
    mixer.gain.value = 1;
    const zeroGain = audioContext.createGain();
    zeroGain.gain.value = 0;
    const sourceNodes = new Map();
    let connection = null;
    let conference = null;
    let cleaningUp = false;
    let currentAttempt = null;
    let maintenanceTimer = null;
    let lastProcessorTickAt = 0;
    let processorTickCount = 0;

    const downsampleBuffer = (buffer, inputSampleRate, outputSampleRate) => {
      if (outputSampleRate === inputSampleRate) {
        return buffer;
      }

      if (outputSampleRate > inputSampleRate) {
        return buffer;
      }

      const sampleRateRatio = inputSampleRate / outputSampleRate;
      const newLength = Math.round(buffer.length / sampleRateRatio);
      const result = new Float32Array(newLength);
      let offsetResult = 0;
      let offsetBuffer = 0;

      while (offsetResult < result.length) {
        const nextOffsetBuffer = Math.round((offsetResult + 1) * sampleRateRatio);
        let accum = 0;
        let count = 0;

        for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i += 1) {
          accum += buffer[i];
          count += 1;
        }

        result[offsetResult] = count > 0 ? accum / count : 0;
        offsetResult += 1;
        offsetBuffer = nextOffsetBuffer;
      }

      return result;
    };

    const floatTo16BitPCM = (floatBuffer) => {
      const output = new ArrayBuffer(floatBuffer.length * 2);
      const view = new DataView(output);

      for (let i = 0; i < floatBuffer.length; i += 1) {
        const sample = Math.max(-1, Math.min(1, floatBuffer[i]));
        view.setInt16(i * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      }

      return new Uint8Array(output);
    };

    const bytesToBase64 = (uint8Array) => {
      let binary = '';

      for (let i = 0; i < uint8Array.length; i += 0x8000) {
        binary += String.fromCharCode(...uint8Array.subarray(i, i + 0x8000));
      }

      return btoa(binary);
    };

    const sendBuffer = async (inputBuffer) => {
      if (sourceNodes.size === 0 || !inputBuffer || inputBuffer.length === 0) {
        return;
      }

      const downsampled = downsampleBuffer(inputBuffer, audioContext.sampleRate, 16000);
      const pcmBytes = floatTo16BitPCM(downsampled);

      if (pcmBytes.length > 0 && typeof window.__botDeliverAudioChunk === 'function') {
        await window.__botDeliverAudioChunk(bytesToBase64(pcmBytes));
      }
    };

    processor.onaudioprocess = (event) => {
      processorTickCount += 1;
      lastProcessorTickAt = Date.now();
      const input = event.inputBuffer.getChannelData(0).slice();

      sendBuffer(input).catch((error) => {
        console.error('[jitsi-audio] failed to forward audio chunk', error);
      });
    };

    mixer.connect(processor);
    processor.connect(zeroGain);
    zeroGain.connect(audioContext.destination);
    await ensureAudioContextRunning();

    const startAudioElement = async (entry) => {
      if (!entry || !entry.audioElement) {
        return;
      }

      await ensureAudioContextRunning();

      if (entry.audioElement.paused) {
        await entry.audioElement.play();
      }
    };

    maintenanceTimer = window.setInterval(() => {
      try {
        for (const entry of sourceNodes.values()) {
          startAudioElement(entry).catch(() => {});
        }

        const now = Date.now();
        if (sourceNodes.size > 0 && lastProcessorTickAt && now - lastProcessorTickAt > 5000) {
          console.warn('[jitsi-audio] processor watchdog: onaudioprocess has not fired recently', {
            processorTickCount,
            lastProcessorTickAt,
            audioContextState: audioContext.state,
          });
        }
      } catch (error) {
        console.warn('[jitsi-audio] watchdog error', error && (error.message || error));
      }
    }, 1000);

    const getAudioTrackKey = (track, mediaTrack) => {
      return (mediaTrack && mediaTrack.id)
        || (track && typeof track.getTrackId === 'function' && track.getTrackId())
        || `${track && typeof track.getParticipantId === 'function' ? track.getParticipantId() : 'remote'}-${Date.now()}`;
    };

    const getUsableAudioStream = (track, mediaTrack, audioElement) => {
      const originalStream = track && typeof track.getOriginalStream === 'function'
        ? track.getOriginalStream()
        : null;

      if (
        originalStream
        && typeof originalStream.getAudioTracks === 'function'
        && originalStream.getAudioTracks().some((candidate) => candidate === mediaTrack || candidate.id === mediaTrack.id)
      ) {
        return originalStream;
      }

      if (
        audioElement
        && audioElement.srcObject
        && typeof audioElement.srcObject.getAudioTracks === 'function'
        && audioElement.srcObject.getAudioTracks().length > 0
      ) {
        return audioElement.srcObject;
      }

      return new MediaStream([mediaTrack]);
    };

    const attachAudioSource = ({ track = null, mediaTrack, participantId = 'unknown', label = 'track' }) => {
      if (!mediaTrack || mediaTrack.kind !== 'audio') {
        return null;
      }

      const trackKey = getAudioTrackKey(track, mediaTrack);

      if (sourceNodes.has(trackKey)) {
        return trackKey;
      }

      if (mediaTrack.readyState && mediaTrack.readyState !== 'live') {
        console.warn(`[jitsi-audio] skipped non-live ${label} audio track: ${trackKey} readyState=${mediaTrack.readyState}`);
        return null;
      }

      const audioElement = document.createElement('audio');
      audioElement.autoplay = true;
      audioElement.playsInline = true;
      audioElement.controls = false;
      audioElement.muted = false;
      audioElement.volume = 1;
      audioElement.style.display = 'none';
      document.body.appendChild(audioElement);

      let attachedWithJitsi = false;
      let mediaStream = null;
      let sourceNode = null;

      try {
        if (track && typeof track.attach === 'function') {
          track.attach(audioElement);
          attachedWithJitsi = true;
        } else {
          audioElement.srcObject = new MediaStream([mediaTrack]);
        }

        mediaStream = getUsableAudioStream(track, mediaTrack, audioElement);
        sourceNode = audioContext.createMediaElementSource(audioElement);
      } catch (elementErr) {
        try {
          mediaStream = mediaStream || getUsableAudioStream(track, mediaTrack, audioElement);
          sourceNode = audioContext.createMediaStreamSource(mediaStream);
        } catch (streamErr) {
          console.error('[jitsi-audio] failed to attach audio source', streamErr && (streamErr.message || streamErr));

          try {
            if (attachedWithJitsi && track && typeof track.detach === 'function') {
              track.detach(audioElement);
            }
            audioElement.pause();
            audioElement.srcObject = null;
            audioElement.remove();
          } catch {
            // ignore
          }

          return null;
        }
      }

      sourceNode.connect(mixer);
      const entry = {
        sourceNode,
        audioElement,
        track,
        mediaStream,
        mediaTrack,
        participantId,
      };

      sourceNodes.set(trackKey, entry);

      startAudioElement(entry).catch((error) => {
        console.warn('[jitsi-audio] audio element playback failed', error && (error.message || error));
      });

      return trackKey;
    };

    const trackMuteHandlers = new Map();

    const onTrackMuteChanged = (track) => {
      const mediaTrack = track && typeof track.getTrack === 'function' ? track.getTrack() : null;
      const trackKey = mediaTrack
        ? getAudioTrackKey(track, mediaTrack)
        : ((track && typeof track.getTrackId === 'function' && track.getTrackId()) || 'unknown');
      const muted = track && typeof track.isMuted === 'function' ? track.isMuted() : 'unknown';
      if (muted === false) {
        const entry = sourceNodes.get(trackKey);
        if (entry) {
          startAudioElement(entry).catch(() => {});
        } else {
          ensureAudioContextRunning().catch(() => {});
        }
      }
    };

    const attachTrack = (track) => {
      if (!track || (typeof track.isLocal === 'function' && track.isLocal())) {
        return;
      }

      const isAudioTrack = typeof track.isAudioTrack === 'function'
        ? track.isAudioTrack()
        : (typeof track.getType === 'function' ? track.getType() === 'audio' : true);

      if (!isAudioTrack) {
        return;
      }

      const mediaTrack = typeof track.getTrack === 'function' ? track.getTrack() : null;
      if (!mediaTrack || mediaTrack.kind !== 'audio') {
        return;
      }

      const trackKey = attachAudioSource({
        track,
        mediaTrack,
        participantId: typeof track.getParticipantId === 'function' ? track.getParticipantId() : 'unknown',
        label: 'jitsi-track',
      });

      if (!trackKey) {
        return;
      }

      try {
        if (typeof track.addEventListener === 'function' && !trackMuteHandlers.has(trackKey)) {
          const muteHandler = () => onTrackMuteChanged(track);
          trackMuteHandlers.set(trackKey, muteHandler);
          track.addEventListener(JitsiMeetJS.events.track.TRACK_MUTE_CHANGED, muteHandler);
        }
      } catch {
        // ignore
      }

      console.log(
        `[jitsi-audio] attached remote audio track: ${trackKey} participant=${typeof track.getParticipantId === 'function' ? track.getParticipantId() : 'unknown'} muted=${typeof track.isMuted === 'function' ? track.isMuted() : 'unknown'} readyState=${mediaTrack.readyState}`
      );
    };
    const detachTrack = (track) => {
      const mediaTrack = track && typeof track.getTrack === 'function' ? track.getTrack() : null;
      const trackKey = mediaTrack ? getAudioTrackKey(track, mediaTrack) : (track && typeof track.getTrackId === 'function' && track.getTrackId());

      if (!trackKey || !sourceNodes.has(trackKey)) {
        return;
      }

      const entry = sourceNodes.get(trackKey);

      try {
        entry.sourceNode.disconnect();
      } catch {
        // ignore
      }

      try {
        const muteHandler = trackMuteHandlers.get(trackKey);
        if (entry.track && muteHandler && typeof entry.track.removeEventListener === 'function') {
          entry.track.removeEventListener(JitsiMeetJS.events.track.TRACK_MUTE_CHANGED, muteHandler);
        }
      } catch {
        // ignore
      }

      trackMuteHandlers.delete(trackKey);

      try {
        if (entry.audioElement) {
          if (entry.track && typeof entry.track.detach === 'function') {
            entry.track.detach(entry.audioElement);
          }
          entry.audioElement.pause();
          entry.audioElement.srcObject = null;
          entry.audioElement.remove();
        }
      } catch {
        // ignore
      }

      sourceNodes.delete(trackKey);
      console.log(`[jitsi-audio] detached remote audio track: ${trackKey}`);
    };

    const cleanup = async () => {
      if (cleaningUp) {
        return;
      }
      cleaningUp = true;

      try {
        if (conference) {
          conference.off(JitsiMeetJS.events.conference.TRACK_ADDED, attachTrack);
          conference.off(JitsiMeetJS.events.conference.TRACK_REMOVED, detachTrack);
          conference.off(JitsiMeetJS.events.conference.TRACK_MUTE_CHANGED, onTrackMuteChanged);
          conference.off(JitsiMeetJS.events.conference.CONFERENCE_LEFT, cleanup);

          try {
            conference.leave();
          } catch {
            // ignore
          }
        }
      } catch {
        // ignore
      }

      try {
        if (maintenanceTimer) {
          window.clearInterval(maintenanceTimer);
          maintenanceTimer = null;
        }

        processor.disconnect();
        mixer.disconnect();
        zeroGain.disconnect();
      } catch {
        // ignore
      }

      for (const entry of sourceNodes.values()) {
        try {
          entry.sourceNode.disconnect();
        } catch {
          // ignore
        }

        try {
          if (entry.audioElement) {
            if (entry.track && typeof entry.track.detach === 'function') {
              entry.track.detach(entry.audioElement);
            }
            entry.audioElement.pause();
            entry.audioElement.srcObject = null;
            entry.audioElement.remove();
          }
        } catch {
          // ignore
        }
      }

      sourceNodes.clear();
      trackMuteHandlers.clear();

      try {
        if (connection) {
          connection.removeEventListener(JitsiMeetJS.events.connection.CONNECTION_ESTABLISHED, onConnectionEstablished);
          connection.removeEventListener(JitsiMeetJS.events.connection.CONNECTION_FAILED, onConnectionFailed);
          connection.removeEventListener(JitsiMeetJS.events.connection.CONNECTION_DISCONNECTED, onConnectionDisconnected);
          connection.disconnect();
        }
      } catch {
        // ignore
      }

      try {
        await audioContext.close();
      } catch {
        // ignore
      }
    };

    const attachExistingTracks = () => {
      if (!conference || typeof conference.getParticipants !== 'function') {
        return;
      }

      const participants = conference.getParticipants();

      for (const participant of participants) {
        const tracks = typeof participant?.getTracks === 'function' ? participant.getTracks() : [];
        for (const track of tracks) {
          attachTrack(track);
        }
      }
    };

    function onConnectionEstablished() {
      conference = connection.initJitsiConference(roomName, {
        openBridgeChannel: joinConfig.bridgeChannel?.preferSctp ? 'datachannel' : 'websocket',
        p2p: {
          enabled: false,
        },
      });
      conference.on(JitsiMeetJS.events.conference.TRACK_ADDED, attachTrack);
      conference.on(JitsiMeetJS.events.conference.TRACK_REMOVED, detachTrack);
      conference.on(JitsiMeetJS.events.conference.TRACK_MUTE_CHANGED, onTrackMuteChanged);
      conference.on(JitsiMeetJS.events.conference.CONFERENCE_LEFT, cleanup);
      conference.on(JitsiMeetJS.events.conference.CONFERENCE_JOINED, () => {
        console.log('[jitsi-audio] conference joined');
        attachExistingTracks();
        if (currentAttempt?.resolve) {
          currentAttempt.resolve();
          currentAttempt = null;
        }
      });

      if (typeof conference.setDisplayName === 'function') {
        conference.setDisplayName(botDisplayName);
      }

      conference.join();
      console.log('[jitsi-audio] conference join requested');
    }

    function onConnectionFailed(errorType, errorMessage) {
      const errorText = `Jitsi connection failed: ${errorType || 'unknown'} ${errorMessage || ''}`.trim();
      if (currentAttempt?.reject) {
        currentAttempt.reject(new Error(errorText));
        currentAttempt = null;
        return;
      }

      throw new Error(errorText);
    }

    function onConnectionDisconnected() {
      if (conference) {
        cleanup().catch(() => {});
      } else if (currentAttempt?.reject) {
        currentAttempt.reject(new Error('Jitsi connection disconnected before conference join'));
        currentAttempt = null;
      }
    }

    const attemptConnection = async (serviceUrl) => {
      const attemptOptions = {
        ...joinConfig.connectionOptions,
        serviceUrl,
      };

      connection = new JitsiMeetJS.JitsiConnection(null, joinConfig.token || null, attemptOptions);
      connection.addEventListener(JitsiMeetJS.events.connection.CONNECTION_ESTABLISHED, onConnectionEstablished);
      connection.addEventListener(JitsiMeetJS.events.connection.CONNECTION_FAILED, onConnectionFailed);
      connection.addEventListener(JitsiMeetJS.events.connection.CONNECTION_DISCONNECTED, onConnectionDisconnected);

      console.log('[jitsi-audio] connecting', {
        roomName,
        domain: joinConfig.connectionOptions.hosts?.domain || parsedUrl.hostname,
        serviceUrl,
        hasToken: Boolean(joinConfig.token),
      });

      const startupPromise = new Promise((resolve, reject) => {
        currentAttempt = { resolve, reject };
      });
      const timeoutMs = Number(joinConfig.connectionTimeoutMs || 12000);
      const timeoutPromise = new Promise((_, reject) => {
        window.setTimeout(() => {
          reject(new Error(`Jitsi connection timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      });

      connection.connect();
      await Promise.race([startupPromise, timeoutPromise]);
    };

    try {
      const serviceUrls = Array.isArray(joinConfig.serviceUrls) && joinConfig.serviceUrls.length > 0
        ? joinConfig.serviceUrls
        : [joinConfig.connectionOptions.serviceUrl];
      let lastError = null;

      for (let index = 0; index < serviceUrls.length; index += 1) {
        const serviceUrl = serviceUrls[index];

        try {
          await attemptConnection(serviceUrl);
          lastError = null;
          break;
        } catch (error) {
          lastError = error;
          console.warn('[jitsi-audio] connection attempt failed', {
            serviceUrl,
            message: error?.message || String(error),
          });

          try {
            if (connection) {
              connection.removeEventListener(JitsiMeetJS.events.connection.CONNECTION_ESTABLISHED, onConnectionEstablished);
              connection.removeEventListener(JitsiMeetJS.events.connection.CONNECTION_FAILED, onConnectionFailed);
              connection.removeEventListener(JitsiMeetJS.events.connection.CONNECTION_DISCONNECTED, onConnectionDisconnected);
              connection.disconnect();
            }
          } catch {
            // ignore
          }

          connection = null;
          conference = null;
          currentAttempt = null;
        }
      }

      if (lastError) {
        throw lastError;
      }
    } finally {
      window.__botStopAudioCapture = cleanup;
    }
  }, { targetMeetingUrl: meetingUrl, botDisplayName: botName, joinConfig: jitsiJoinConfig });

  return {
    kind: 'jitsi-capture',
    async stop() {
      try {
        await page.evaluate(() => {
          if (typeof window.__botStopAudioCapture === 'function') {
            return window.__botStopAudioCapture();
          }

          return undefined;
        });
      } catch {
        // ignore
      }

      try {
        page.off('console', browserConsoleHandler);
      } catch {
        // ignore
      }

      try {
        page.off('pageerror', pageErrorHandler);
      } catch {
        // ignore
      }
    },
  };
}

(async () => {
  const config = parseArgs();

  console.log('[bot] REALTIME MEETING BOT: JOIN + STREAM + CAPTION');
  console.log(`[bot] meetingId=${config.meetingId}`);

  let browser;
  let recorder;
  let aaiWebSocket;
  let page;
  let monitorInterval;
  let shuttingDown = false;

  const shutdown = async (reason) => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;

    console.log(`[bot] shutdown: ${reason}`);

    if (monitorInterval) {
      clearInterval(monitorInterval);
      monitorInterval = null;
    }

    if (recorder && typeof recorder.stop === 'function') {
      try {
        await recorder.stop();
      } catch {
        // ignore
      }
    } else if (recorder && !recorder.killed) {
      try {
        recorder.stdin.write('q\n');
      } catch {
        // ignore
      }
      await new Promise((resolve) => setTimeout(resolve, 1500));
      if (!recorder.killed) {
        recorder.kill('SIGKILL');
      }
    }

    if (aaiWebSocket && aaiWebSocket.readyState === WebSocketModule.OPEN) {
      try {
        aaiWebSocket.send(JSON.stringify({ type: 'Terminate' }));
      } catch {
        // ignore
      }

      try {
        aaiWebSocket.close();
      } catch {
        // ignore
      }
    }

    if (browser) {
      try {
        await browser.close();
      } catch {
        // ignore
      }
    }

    process.exit(0);
  };

  process.on('SIGINT', () => {
    shutdown('SIGINT');
  });
  process.on('SIGTERM', () => {
    shutdown('SIGTERM');
  });

  try {
    console.log('[bot] mode: join meeting muted, stream audio to AssemblyAI realtime, publish captions');

    browser = await chromium.launch({
      headless: config.headless,
      args: [
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
        '--autoplay-policy=no-user-gesture-required',
      ],
    });

    const context = await browser.newContext();
    page = await context.newPage();

    // Forward any browser page console messages to the Node process for runtime diagnostics
    page.on('console', (msg) => {
      try {
        console.log(`[PAGE ${msg.type()}] ${msg.text()}`);
      } catch {
        // ignore console forwarding failures
      }
    });

    page.on('pageerror', (err) => {
      try {
        console.error('[PAGE ERROR]', err && err.message ? err.message : String(err));
      } catch {
        // ignore
      }
    });

    const useJitsiCapture = shouldUseJitsiAudioCapture(config.meetingUrl, config.platform);

    if (!useJitsiCapture) {
      const joined = await joinZoomMeeting(page, config.meetingUrl, config.botName);
      if (joined) {
        console.log('[bot] ✅ joined meeting successfully');
      } else {
        console.warn('[bot] ⚠️ join state not confirmed, attempting audio capture anyway');
      }
    }

    try {
      aaiWebSocket = await connectAssemblyAiRealtime(config.meetingId);
    } catch (streamError) {
      console.error('[bot] ❌ AssemblyAI connection failed:', streamError.message);
      await shutdown('assemblyai-connect-failed');
      return;
    }

    recorder = await startRealtimeAudioStream({
      page,
      aaiWebSocket,
      meetingUrl: config.meetingUrl,
      meetingId: config.meetingId,
      botName: config.botName,
      platform: config.platform,
    });
    console.log('[bot] ✅ realtime audio stream started');

    aaiWebSocket.on('close', () => {
      if (!shuttingDown) {
        shutdown('assemblyai-closed');
      }
    });

    if (recorder && typeof recorder.on === 'function') {
      recorder.on('exit', (code) => {
        if (!shuttingDown) {
          console.warn(`[bot] audio stream exited with code ${code}`);
          shutdown('audio-stream-ended');
        }
      });
    }

    if (useJitsiCapture) {
      monitorInterval = setInterval(async () => {
        try {
          if (!page || page.isClosed()) {
            console.warn('[bot] Jitsi capture page closed, shutting down');
            await shutdown('jitsi-page-closed');
          }
        } catch (error) {
          console.warn('[bot] monitor check failed:', error.message);
        }
      }, Number(process.env.BOT_MONITOR_INTERVAL_MS || 15000));
    } else {
      let rejoinAttempts = 0;
      const maxRejoinAttempts = Number(process.env.BOT_MAX_REJOIN_ATTEMPTS || 3);

      monitorInterval = setInterval(async () => {
        try {
          if (!page || page.isClosed()) {
            console.warn('[bot] meeting page closed, attempting to recreate page/context');
            try {
              if (!browser) {
                console.log('[bot] browser missing, launching new browser instance');
                browser = await chromium.launch({
                  headless: config.headless,
                  args: [
                    '--no-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-blink-features=AutomationControlled',
                    '--autoplay-policy=no-user-gesture-required',
                  ],
                });
              }

              const context = await browser.newContext();
              page = await context.newPage();

              console.log('[bot] attempting to rejoin after page recreation');
              const joined = await joinZoomMeeting(page, config.meetingUrl, config.botName);
              if (joined) {
                console.log('[bot] ✅ rejoin after recreation succeeded');
              } else {
                console.warn('[bot] ⚠️ rejoin after recreation not confirmed');
              }
            } catch (err) {
              console.warn('[bot] failed to recreate page/context:', err.message);
              // fall through; rejoin logic below will handle attempts
            }
          }

          const status = await getZoomPageStatus(page);

          if (status.hasJoinControls && !status.hasMeetingControls) {
            console.warn('[bot] ⚠️ meeting page appears to be back in join flow');

            if (rejoinAttempts >= maxRejoinAttempts) {
              console.error('[bot] ❌ max rejoin attempts reached, shutting down');
              await shutdown('rejoin-failed');
              return;
            }

            try {
              rejoinAttempts += 1;
              console.log(`[bot] attempting rejoin (attempt ${rejoinAttempts}/${maxRejoinAttempts})`);
              await clickJoinWithoutAudio(page);
              await clickJoin(page);
              await page.waitForTimeout(3000);
              const confirmed = await waitUntilInsideMeeting(page);
              if (confirmed) {
                console.log('[bot] ✅ rejoined meeting successfully');
                rejoinAttempts = 0;
              } else {
                console.warn('[bot] ⚠️ rejoin attempt did not confirm inside meeting');
              }
            } catch (err) {
              console.warn('[bot] rejoin attempt failed:', err.message);
            }
          }
        } catch (error) {
          console.warn('[bot] monitor check failed:', error.message);
        }
      }, Number(process.env.BOT_MONITOR_INTERVAL_MS || 15000));
    }

    console.log('[bot] 🎯 bot is live and streaming captions');

    await new Promise(() => {});
  } catch (error) {
    console.error('[bot] fatal error:', error.message);
    console.error(error.stack);
    await shutdown('fatal-error');
  }
})();
